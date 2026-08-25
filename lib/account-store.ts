import { createHmac, pbkdf2Sync, randomBytes } from "crypto";
import { type AccountPlan, planOf } from "@/lib/account-plans";
import { withoutAttachments } from "@/lib/attachments";
import { emptyItinerary, type Itinerary } from "@/data/itinerary";
import { proposalOptionToItinerary, type Proposal } from "@/data/proposal";
import type { ManualTripStage } from "@/data/trip-pipeline";
import type { PaymentRecord, TripBalance } from "@/data/trip-payments";
import { alertsFromStatusChange, type FlightStatusSnapshot, type TripAlert } from "@/data/trip-alerts";
import { checkFlightStatus } from "@/lib/flight-status";
import type { LibraryItem, LibraryPack } from "@/data/library";
import type { ClientFormResponse, ClientFormTemplate } from "@/data/client-form";
import { limitsFor, newTripProblem } from "@/lib/account-limits";
import { getLimitOverrides } from "@/lib/account-limits-store";
import { getPlan } from "@/lib/account-plan-store";
import { identityKey, normalizeIdentity } from "@/lib/identity";
import { type Collaborator, type TripRole, may, readCollaborators, roleOf } from "@/lib/trip-roles";
import { passwordProblem } from "@/lib/password-rules";
import type { SavedPlace } from "@/data/route-utils";
import { accountCookieName, createAccountSession, parseAccountSession } from "@/lib/account-session";
import { templateFromTrip, tripFromTemplate } from "@/lib/trip-templates";
import { readTemplatesStore, writeTemplatesStore, type SavedTemplate } from "@/lib/trip-templates-store";
import type { PushSubscriptionRecord } from "@/data/push-subscriptions";
import { sendPushToSubscriptions } from "@/lib/push-notify";

type RedisResult<T> = { result?: T };

export type AccountRecord = {
  /**
   * What the account is called and stored under: an email address, or a phone
   * number in E.164.
   *
   * The field keeps the name `email` because everything in the site and every
   * record already written uses it, and renaming it would break accounts that
   * exist. Read it as "the thing they sign in with"; `identityKind` says which
   * it is, and `describeIdentity` spells it for a person.
   */
  email: string;
  /** "email" or "phone". Absent on accounts made before phones were allowed. */
  identityKind?: "email" | "phone";
  name?: string;
  /** A contact number, whether or not it is what they sign in with. */
  phone?: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  /**
   * Traveler, Gold or Business. Absent on every account made before plans
   * existed, which reads as Traveler — exactly what it was before.
   *
   * Set only from the admin (app/admin/accounts/actions.ts). Nothing reads it
   * to allow or refuse anything; see lib/account-plans.ts for why.
   */
  plan?: AccountPlan;
  planSince?: string;
  planSetBy?: string;
  verifiedAt?: string;
  verificationCodeHash?: string;
  verificationCodeExpiresAt?: string;
  verificationRequestedAt?: string;
  resetCodeHash?: string;
  resetCodeExpiresAt?: string;
  /**
   * When this account was first signed into with Google.
   *
   * The SAME account either way — signing in with Google is this person
   * skipping the password, not a second identity. Kept so the account screen
   * can say how they get in, and so support can answer "why is there no
   * password on this one".
   */
  googleLinkedAt?: string;
  /**
   * True when the account was opened by signing in with Google and no password
   * has ever been chosen for it.
   *
   * `passwordHash` and `salt` are still filled, with random bytes that are the
   * hash of nothing — so every existing check keeps working and no password
   * anybody can type will ever match. "Forgotten password" sets a real one.
   */
  noPasswordYet?: boolean;
  /**
   * The unguessable media-store id of their profile picture (lib/media.ts),
   * absent when they have not chosen one. It appears beside reviews they
   * publish and nowhere else — the account page says so next to the control,
   * and nothing else on the site reads it.
   */
  avatarMediaId?: string;
};

/**
 * One trip in the account: an itinerary, the route of places behind it, and
 * whoever it has been shared with.
 *
 * A person planning Poland in the spring and Ukraine in the autumn was, until
 * now, planning over the top of themselves — there was one itinerary per
 * account and saving the second lost the first.
 */
export type SavedTrip = {
  id: string;
  name: string;
  /**
   * Who this trip is being planned FOR, when that is somebody else.
   *
   * A Business account plans for other people, and twenty of their trips are
   * called "Italy", "Italy" and "Italy 2" — which is fine for somebody with two
   * trips and useless for somebody with twenty. This is the field that tells
   * them apart, and it is the name that goes on the cover of the document their
   * client is handed.
   *
   * Empty for everybody else, and empty is the normal case. A traveller
   * planning their own trip is not a client of anybody.
   */
  client?: string;
  /**
   * The advisor a Business account has put on this trip — the person in their
   * office the client is dealing with.
   *
   * Shown to the client as their point of contact in the app; it is the name
   * the trip carries, not the account's. Empty for everybody else, and empty is
   * the normal case — a traveller planning their own trip has no advisor.
   */
  advisor?: string;
  itinerary: Itinerary;
  route: SavedPlace[];
  /** Public read-only token, when this particular trip is shared. */
  shareId?: string;
  /**
   * Who it is shared with and what each may do.
   *
   * Stored as `Collaborator[]`. Trips saved before roles existed hold plain
   * strings; readCollaborators takes both and calls every old one a VIEWER,
   * which is what they could already do. See lib/trip-roles.ts.
   */
  collaborators?: (string | Collaborator)[];
  /**
   * What the planner is offering before the trip is confirmed — one or more
   * options the client compares and picks between. Absent until the planner
   * starts one; stays after it is converted, as the record of what was
   * actually offered and approved.
   */
  proposal?: Proposal;
  /** Public read-only token for the proposal above — separate from `shareId`
   *  (the itinerary's own link), since a client may hold one before the
   *  other exists. */
  proposalShareId?: string;
  /**
   * One traveler's own door into the trip app, keyed by their id in
   * itinerary.travelers — for a family or group trip where each person gets
   * their own link rather than everyone sharing the one trip-wide link.
   * Most trips never use this; it stays empty.
   */
  travelerShares?: Record<string, string>;
  /**
   * The pre-trip form a client fills out — legal name, passport, emergency
   * contact, preferences, whatever the planner asks for. The template (which
   * fields, which are required) is not sensitive; the answers are, so they
   * are read back only through the planner's own authenticated route, never
   * through a shared itinerary, a proposal, or the app. See data/client-form.ts.
   */
  formTemplate?: ClientFormTemplate;
  formShareId?: string;
  formResponses?: ClientFormResponse[];
  /**
   * Set only before a proposal exists — an inquiry the planner hasn't started
   * active work on yet, versus one they have. Every later stage is read off
   * the proposal's own status and the trip's own dates instead; see
   * data/trip-pipeline.ts for why nothing past this is stored by hand.
   */
  pipelineStage?: ManualTripStage;
  /**
   * Whether this trip sends its client automatic reminders — see
   * lib/trip-reminders.ts for what and when. OFF by default on every trip:
   * nothing is ever sent to a client the advisor did not choose this for.
   */
  autoReminders?: boolean;
  /**
   * When each automatic reminder last went out, ISO date — so a reminder
   * fires once, ever, per trip rather than every day a window holds true.
   * See lib/trip-reminders.ts.
   */
  remindersSent?: { departure?: string; balanceDue?: string };
  /**
   * This trip's payment balance — total, split across families/travelers,
   * any deposit/installment schedule, and the ledger of what has actually
   * been paid. Absent until the planner sets one up. See data/trip-payments.ts.
   */
  balance?: TripBalance;
  /**
   * What the advisor recorded earning on this trip — typed in by hand, not
   * worked out from a percentage or read off a booking. Bookings on this
   * site can come from more than one supplier with different commission
   * terms, so a formula here would be a guess dressed up as a fact; a
   * number the advisor typed in themselves is at least honestly theirs.
   * Absent until they enter one. Whole cents, the same convention as
   * TripBalance — see formatCents in data/trip-payments.ts.
   */
  commissionCents?: number;
  commissionCurrency?: string;
  /**
   * The last real reading of each of this trip's flights — keyed by the
   * flight's own id. Absent until a flight is actually checked. See
   * lib/flight-status.ts and checkTripFlightStatus below.
   */
  flightStatus?: Record<string, FlightStatusSnapshot>;
  /**
   * What a flight-status check found worth telling somebody about — a
   * meaningful delay, a cancellation, a real gate/terminal change. Not every
   * status reading becomes one of these; see data/trip-alerts.ts.
   */
  alerts?: TripAlert[];
  /**
   * Devices asking to be pushed a notification when one of the alerts above
   * is created — a client's own phone, subscribed from inside the app they
   * were sent (see components/companion/CompanionApp.tsx). Absent until
   * somebody actually opts in; never set on their behalf.
   */
  pushSubscriptions?: PushSubscriptionRecord[];
  createdAt: string;
  updatedAt: string;
};

export type AccountData = {
  /**
   * The open trip's route and itinerary, kept as they always were.
   *
   * Everything else in the site reads these two fields — the print view, the
   * share links, the admin account list. Rather than rewrite all of it, the
   * trips layer keeps them pointing at whichever trip is open, so an account
   * that has never made a second trip behaves exactly as before.
   */
  route: SavedPlace[];
  favorites: SavedPlace[];
  itinerary?: Itinerary;
  itineraryShareId?: string;
  /** Strings on trips saved before roles. Read with readCollaborators. */
  itineraryCollaborators?: (string | Collaborator)[];
  /** Every trip in the account. Absent on accounts made before this existed. */
  trips?: SavedTrip[];
  activeTripId?: string;
  /**
   * The planner's own reusable content — hotels, activities, tours,
   * contacts — and the destination packs built from them. Belongs to the
   * ACCOUNT, not one trip, since the whole point is using the same saved
   * hotel on a dozen different trips instead of retyping it each time.
   */
  library?: { items: LibraryItem[]; packs: LibraryPack[] };
  /**
   * The advisor's own saved trip shapes, from before templates got their own
   * store (lib/trip-templates-store.ts) — read once, by getTemplates below,
   * to carry an account's existing templates into the new store. Nothing
   * writes here any more.
   */
  templates?: SavedTemplate[];
  updatedAt?: string;
};

// One entry in a person's "shared with me" index.
export type SharedTrip = {
  ownerEmail: string;
  ownerName?: string;
  title: string;
  shareId: string;
  /** What this person may do on it. Absent on entries written before roles. */
  role?: TripRole;
};

export type AccountSummary = {
  email: string;
  name?: string;
  phone?: string;
  routeCount: number;
  favoriteCount: number;
  createdAt?: string;
  verifiedAt?: string;
  /** Their profile picture's media id, for the account screen to show it. */
  avatarMediaId?: string;
};

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis<T>(command: string) {
  const config = redisConfig();
  if (!config) return undefined;
  try {
    const response = await fetch(`${config.url}/${command}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    return (await response.json()) as RedisResult<T>;
  } catch {
    return undefined;
  }
}

function accountKey(email: string) {
  return `white-glove:account:${email}`;
}

function dataKey(email: string) {
  return `white-glove:account-data:${email}`;
}

/**
 * The one spelling an account is stored under.
 *
 * An account is named by an email address or by a phone number, and both are
 * just strings — so both work as the key, provided each has exactly one
 * spelling. "(555) 123-4567" and "+1 555 123 4567" have to land on the same
 * account, or somebody signs up twice without meaning to.
 *
 * Anything unreadable falls back to trimmed lower case rather than being
 * rejected here, so an account made before this existed still looks itself up.
 */
function normalizeId(identifier: string) {
  return identityKey(identifier);
}

function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, 120000, 64, "sha256").toString("hex");
}

function verificationSecret() {
  return process.env.WHITE_GLOVE_SESSION_SECRET || process.env.ADMIN_PASSWORD || "white-glove-development-secret";
}

function verificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashVerificationCode(email: string, code: string) {
  return createHmac("sha256", verificationSecret()).update(`${normalizeId(email)}:${code}`).digest("base64url");
}

export function hasAccountStorage() {
  return Boolean(redisConfig());
}

export function createSessionCookie(email: string) {
  return createAccountSession(email);
}

export function readSessionEmail(cookieValue?: string) {
  return parseAccountSession(cookieValue);
}

async function readJson<T>(key: string) {
  const response = await redis<string>(`get/${encodeURIComponent(key)}`);
  if (!response?.result) return undefined;
  try {
    return JSON.parse(response.result) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(key: string, value: unknown) {
  const payload = encodeURIComponent(JSON.stringify(value));
  const response = await redis(`set/${encodeURIComponent(key)}/${payload}`);
  return Boolean(response);
}

export async function getAccountRecord(email: string) {
  const normalized = normalizeId(email);
  return readJson<AccountRecord>(accountKey(normalized));
}

export type AdminAccountSummary = {
  email: string;
  name?: string;
  phone?: string;
  createdAt?: string;
  verifiedAt?: string;
  routeCount: number;
  favoriteCount: number;
  hasItinerary: boolean;
  /** Traveler, Gold or Business. See lib/account-plans.ts — nothing is behind one yet. */
  plan: AccountPlan;
};

const ACCOUNT_PREFIX = "white-glove:account:";

/**
 * Every registered account, for the owner's admin view. Scans the Redis
 * keyspace (SCAN) rather than needing an index, so it includes accounts made
 * before this feature. Returns only owner-appropriate fields — never the
 * password hash or salt.
 */
export async function listAllAccounts(): Promise<AdminAccountSummary[]> {
  if (!hasAccountStorage()) return [];
  const keys: string[] = [];
  let cursor = "0";
  let guard = 0;
  do {
    const res = await redis<[string, string[]]>(
      `scan/${cursor}/match/${encodeURIComponent(`${ACCOUNT_PREFIX}*`)}/count/500`,
    );
    const [next, batch] = res?.result ?? ["0", []];
    cursor = typeof next === "string" ? next : "0";
    if (Array.isArray(batch)) keys.push(...batch);
    guard += 1;
  } while (cursor !== "0" && guard < 100);

  const emails = keys.map((k) => k.slice(ACCOUNT_PREFIX.length)).filter(Boolean);
  const summaries = await Promise.all(
    emails.map(async (email): Promise<AdminAccountSummary | null> => {
      const [record, data] = await Promise.all([getAccountRecord(email), getAccountData(email)]);
      if (!record) return null;
      return {
        email: record.email,
        name: record.name,
        phone: record.phone,
        createdAt: record.createdAt,
        verifiedAt: record.verifiedAt,
        routeCount: data.route?.length ?? 0,
        favoriteCount: data.favorites?.length ?? 0,
        hasItinerary: Boolean(data.itinerary),
        plan: planOf(record),
      };
    }),
  );
  return summaries
    .filter((s): s is AdminAccountSummary => s !== null)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/**
 * Make an account, named by an email address or a phone number.
 *
 * The identifier is checked properly here rather than accepted and puzzled
 * over later: a number too short to dial, or an address with no domain, means
 * a code sent nowhere and somebody waiting for it.
 */
/**
 * @param contactPhone A number to reach them on. Never required, and never
 *   what they sign in with — that is `identifier`. Somebody who signs up with
 *   an email and gives a number has given us a way to ring them about a trip,
 *   not a second account.
 */
export async function createAccount(identifier: string, password: string, name?: string, contactPhone?: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const identity = normalizeIdentity(identifier ?? "");
  if (!identity) {
    return { ok: false as const, error: "Enter an email address or a phone number we can reach you on." };
  }
  // The same rule the reset screen enforces. Signing up accepted a one-letter
  // password while changing it demanded eight, so the weakest passwords on the
  // site were the ones people started with and never changed.
  const problem = passwordProblem(password);
  if (problem) return { ok: false as const, error: problem };
  const normalized = identity.value;
  const existing = await getAccountRecord(normalized);
  if (existing) {
    return {
      ok: false as const,
      error: identity.kind === "phone" ? "An account already exists for that number." : "An account already exists for that email.",
    };
  }
  const salt = randomBytes(16).toString("hex");
  const cleanName = name?.trim();
  const record: AccountRecord = {
    email: normalized,
    identityKind: identity.kind,
    name: cleanName || undefined,
    // Signing in with a number makes it the contact number too — there is no
    // sense asking for it twice.
    // Their sign-in number if that is what they used; otherwise whatever they
    // chose to give us, which may be nothing.
    phone: identity.kind === "phone" ? normalized : contactPhone?.trim() || undefined,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    verificationRequestedAt: new Date().toISOString(),
  };
  const code = verificationCode();
  record.verificationCodeHash = hashVerificationCode(normalized, code);
  record.verificationCodeExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const saved = await writeJson(accountKey(normalized), record);
  if (!saved) return { ok: false as const, error: "The account could not be created." };
  await writeJson(dataKey(normalized), { route: [], favorites: [], updatedAt: new Date().toISOString() } satisfies AccountData);
  return { ok: true as const, email: normalized, verificationCode: code };
}

/**
 * Sign in with Google, onto the account that is already there.
 *
 * THE OWNER'S DECISION: the same account as the password, not a second one.
 * Somebody who signed up with a password and later presses the Google button
 * lands in the account they already have, with their trips, their notes and
 * their boarding passes in it — they have simply skipped typing the password.
 *
 * The caller must have already established that GOOGLE VERIFIED THE ADDRESS
 * (lib/google-signin.ts refuses otherwise). Everything below rests on it: this
 * hands over an existing account to whoever proved they hold the email.
 *
 * A GOOGLE SIGN-IN ALSO COUNTS AS VERIFYING THE ACCOUNT. An account still
 * waiting on our own six-digit code is verified by this, because Google
 * checking the address is the same evidence the code was asking for and better
 * evidence than a code sitting unread in the same inbox.
 *
 * A NEW ACCOUNT GETS NO PASSWORD, rather than one nobody chose. The hash is
 * random bytes — the hash of nothing, so no password anyone types can match —
 * and `noPasswordYet` records why. "Forgotten password" sets a real one, which
 * is the same path as any other account and needs nothing new.
 */
export async function signInWithGoogle(input: { email: string; name?: string; googleId: string }) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const identity = normalizeIdentity(input.email);
  if (!identity || identity.kind !== "email") return { ok: false as const, error: "Google did not share a usable email address." };
  const normalized = identity.value;
  const now = new Date().toISOString();

  const existing = await getAccountRecord(normalized);
  if (existing) {
    const record: AccountRecord = {
      ...existing,
      // Read from the record and written back whole, so signing in cannot drop
      // the password hash, the plan, or anything else added since.
      name: existing.name || input.name?.trim() || undefined,
      googleLinkedAt: existing.googleLinkedAt ?? now,
      verifiedAt: existing.verifiedAt ?? now,
    };
    // A pending code is spent: it was asking the question Google just answered,
    // and leaving it live is one more live credential for no reason.
    delete record.verificationCodeHash;
    delete record.verificationCodeExpiresAt;
    if (!(await writeJson(accountKey(normalized), record))) {
      return { ok: false as const, error: "Could not sign you in just now. Try again." };
    }
    return { ok: true as const, email: normalized, created: false };
  }

  const salt = randomBytes(16).toString("hex");
  const record: AccountRecord = {
    email: normalized,
    identityKind: "email",
    name: input.name?.trim() || undefined,
    salt,
    // The hash of nothing. Random bytes of the same shape hashPassword makes,
    // so verifyAccount runs exactly as it always does and never matches.
    passwordHash: randomBytes(64).toString("hex"),
    noPasswordYet: true,
    createdAt: now,
    googleLinkedAt: now,
    verifiedAt: now,
  };
  if (!(await writeJson(accountKey(normalized), record))) {
    return { ok: false as const, error: "The account could not be created." };
  }
  await writeJson(dataKey(normalized), { route: [], favorites: [], updatedAt: now } satisfies AccountData);
  return { ok: true as const, email: normalized, created: true };
}

export async function verifyAccount(email: string, password: string) {
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return false;
  return hashPassword(password, record.salt) === record.passwordHash;
}

export async function verifyAccountStatus(email: string, password: string) {
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, reason: "missing" as const };
  if (hashPassword(password, record.salt) !== record.passwordHash) return { ok: false as const, reason: "credentials" as const };
  if (!record.verifiedAt) return { ok: false as const, reason: "unverified" as const, record };
  return { ok: true as const, record };
}

export async function requestPasswordReset(email: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, error: "We have no account with those details." };
  const code = verificationCode();
  const next: AccountRecord = {
    ...record,
    resetCodeHash: hashVerificationCode(normalized, code),
    resetCodeExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
  const saved = await writeJson(accountKey(normalized), next);
  if (!saved) return { ok: false as const, error: "The reset code could not be created." };
  return { ok: true as const, email: normalized, resetCode: code };
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, error: "We have no account with those details." };
  if (!record.resetCodeHash || !record.resetCodeExpiresAt) return { ok: false as const, error: "No reset code is active. Request a new one." };
  if (new Date(record.resetCodeExpiresAt).getTime() < Date.now()) return { ok: false as const, error: "That reset code has expired. Request a new one." };
  if (hashVerificationCode(normalized, code) !== record.resetCodeHash) return { ok: false as const, error: "That reset code is not correct." };
  const resetProblem = passwordProblem(newPassword);
  if (resetProblem) return { ok: false as const, error: resetProblem };
  const salt = randomBytes(16).toString("hex");
  const next: AccountRecord = {
    ...record,
    salt,
    passwordHash: hashPassword(newPassword, salt),
    resetCodeHash: undefined,
    resetCodeExpiresAt: undefined,
  };
  const saved = await writeJson(accountKey(normalized), next);
  if (!saved) return { ok: false as const, error: "The password could not be updated." };
  return { ok: true as const, email: normalized };
}

export async function verifyEmailCode(email: string, code: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, error: "We have no account with those details." };
  if (!record.verificationCodeHash || !record.verificationCodeExpiresAt) return { ok: false as const, error: "No verification code is active. Request a new one." };
  if (new Date(record.verificationCodeExpiresAt).getTime() < Date.now()) return { ok: false as const, error: "That verification code has expired. Request a new one." };
  if (hashVerificationCode(normalized, code) !== record.verificationCodeHash) return { ok: false as const, error: "That verification code is not correct." };
  const next: AccountRecord = {
    ...record,
    verifiedAt: new Date().toISOString(),
    verificationCodeHash: undefined,
    verificationCodeExpiresAt: undefined,
  };
  const saved = await writeJson(accountKey(normalized), next);
  if (!saved) return { ok: false as const, error: "The account could not be verified." };
  return { ok: true as const, email: normalized };
}

export async function resendVerificationCode(email: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, error: "We have no account with those details." };
  const code = verificationCode();
  const next: AccountRecord = {
    ...record,
    verificationRequestedAt: new Date().toISOString(),
    verificationCodeHash: hashVerificationCode(normalized, code),
    verificationCodeExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
  const saved = await writeJson(accountKey(normalized), next);
  if (!saved) return { ok: false as const, error: "The verification code could not be refreshed." };
  return { ok: true as const, email: normalized, verificationCode: code };
}

export async function isAccountVerified(email: string) {
  const record = await getAccountRecord(email);
  return Boolean(record?.verifiedAt);
}

export async function getAccountData(email: string) {
  const normalized = normalizeId(email);
  const data = await readJson<AccountData>(dataKey(normalized));
  return data ?? { route: [], favorites: [] };
}

export async function saveAccountCollection(email: string, collection: "route" | "favorites", items: SavedPlace[]) {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const capped = items.slice(0, 200);
  const next: AccountData = {
    ...current,
    [collection]: capped,
    updatedAt: new Date().toISOString(),
  };
  // The route belongs to whichever trip is open. Favorites belong to the
  // person, so they stay outside the trips.
  if (collection === "route") {
    const { trips, activeId } = withTrips(current);
    next.trips = trips.map((t) => (t.id === activeId ? { ...t, route: capped, updatedAt: new Date().toISOString() } : t));
    next.activeTripId = activeId;
  }
  return writeJson(dataKey(normalized), next);
}

// ---- Content library -----------------------------------------------------
//
// A planner's reusable hotels, activities, tours and contacts, and the
// destination packs built from them — scoped to the ACCOUNT rather than one
// trip, since reuse across trips is the entire point. Read-modify-write
// against AccountData.library, the same shape every other per-account
// collection here already keeps.

function libraryId() {
  return randomBytes(6).toString("base64url");
}

export async function getLibrary(email: string): Promise<{ items: LibraryItem[]; packs: LibraryPack[] }> {
  const data = await getAccountData(email);
  return { items: data.library?.items ?? [], packs: data.library?.packs ?? [] };
}

export async function saveLibraryItem(email: string, item: LibraryItem): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const items = current.library?.items ?? [];
  const now = new Date().toISOString();
  const stamped: LibraryItem = { ...item, id: item.id || libraryId(), savedAt: item.savedAt || now, updatedAt: now };
  const nextItems = items.some((i) => i.id === stamped.id) ? items.map((i) => (i.id === stamped.id ? stamped : i)) : [...items, stamped];
  const next: AccountData = { ...current, library: { items: nextItems, packs: current.library?.packs ?? [] }, updatedAt: now };
  return writeJson(dataKey(normalized), next);
}

export async function deleteLibraryItem(email: string, id: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const items = (current.library?.items ?? []).filter((i) => i.id !== id);
  // Drop it from any pack that referenced it too, so a pack never quietly
  // points at an item that no longer exists.
  const packs = (current.library?.packs ?? []).map((p) => ({ ...p, itemIds: p.itemIds.filter((x) => x !== id) }));
  const next: AccountData = { ...current, library: { items, packs }, updatedAt: new Date().toISOString() };
  return writeJson(dataKey(normalized), next);
}

export async function saveLibraryPack(email: string, pack: LibraryPack): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const packs = current.library?.packs ?? [];
  const now = new Date().toISOString();
  const stamped: LibraryPack = { ...pack, id: pack.id || libraryId(), savedAt: pack.savedAt || now, updatedAt: now };
  const nextPacks = packs.some((p) => p.id === stamped.id) ? packs.map((p) => (p.id === stamped.id ? stamped : p)) : [...packs, stamped];
  const next: AccountData = { ...current, library: { items: current.library?.items ?? [], packs: nextPacks }, updatedAt: now };
  return writeJson(dataKey(normalized), next);
}

export async function deleteLibraryPack(email: string, id: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const packs = (current.library?.packs ?? []).filter((p) => p.id !== id);
  const next: AccountData = { ...current, library: { items: current.library?.items ?? [], packs }, updatedAt: new Date().toISOString() };
  return writeJson(dataKey(normalized), next);
}

// ---- Trips -------------------------------------------------------------

function tripId() {
  return randomBytes(6).toString("base64url");
}

/**
 * The account's trips, migrating an older single-itinerary account on read.
 *
 * Nothing is written by this — an account that has never opened the switcher
 * keeps its record exactly as it was, and only starts carrying a `trips` array
 * the first time something is saved.
 */
export function withTrips(data: AccountData): { trips: SavedTrip[]; activeId: string } {
  const existing = data.trips?.filter((t) => t && t.id) ?? [];
  if (existing.length) {
    const activeId = existing.some((t) => t.id === data.activeTripId) ? data.activeTripId! : existing[0].id;
    return { trips: existing, activeId };
  }
  const now = data.updatedAt || new Date().toISOString();
  const itinerary = data.itinerary ?? emptyItinerary();
  const first: SavedTrip = {
    id: tripId(),
    name: itinerary.title?.trim() || "My trip",
    itinerary,
    route: data.route ?? [],
    // The old single share link belongs to this first trip.
    shareId: data.itineraryShareId,
    collaborators: data.itineraryCollaborators ?? [],
    createdAt: now,
    updatedAt: now,
  };
  return { trips: [first], activeId: first.id };
}

export type TripSummary = {
  id: string;
  name: string;
  /** Who it is for, when somebody is planning on another person's behalf. */
  client: string;
  /** The advisor on the trip — the agent the client is dealing with. */
  advisor: string;
  active: boolean;
  /** Stops in the itinerary itself. */
  stops: number;
  /** Places saved to this trip's route but not yet placed on a day. */
  places: number;
  days: number;
  /** The trip's dates, so the account page can say when each one is. */
  startDate: string;
  endDate: string;
  shared: boolean;
  /** The public token when shared, so a screen can build the link to it. */
  shareId?: string;
  updatedAt: string;
  /** Whether this trip's client gets automatic reminders — see lib/trip-reminders.ts. */
  autoReminders: boolean;
};

/** How many days the trip covers, from its dates. Zero until both are set. */
function dayCount(itinerary?: Itinerary): number {
  const start = Date.parse(`${itinerary?.startDate ?? ""}T00:00:00Z`);
  const end = Date.parse(`${itinerary?.endDate ?? ""}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

function summarize(trips: SavedTrip[], activeId: string): TripSummary[] {
  return trips.map((t) => ({
    id: t.id,
    name: t.name,
    client: t.client?.trim() ?? "",
    advisor: t.advisor?.trim() ?? "",
    active: t.id === activeId,
    stops: t.itinerary?.activities?.length ?? 0,
    places: t.route?.length ?? 0,
    days: dayCount(t.itinerary),
    startDate: t.itinerary?.startDate ?? "",
    endDate: t.itinerary?.endDate ?? "",
    shared: Boolean(t.shareId),
    shareId: t.shareId,
    updatedAt: t.updatedAt,
    autoReminders: Boolean(t.autoReminders),
  }));
}

export async function getTrips(email: string): Promise<TripSummary[]> {
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  return summarize(trips, activeId);
}

/** One trip's itinerary, or the open one when no id is given. */
export async function getTripItinerary(email: string, id?: string) {
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === (id || activeId)) ?? trips[0];
  return trip
    ? {
        itinerary: trip.itinerary,
        tripId: trip.id,
        tripName: trip.name,
        client: trip.client?.trim() ?? "",
        advisor: trip.advisor?.trim() ?? "",
        shareId: trip.shareId,
      }
    : null;
}

/** How long a client's name may be. It goes on a cover, not in a database. */
export const MAX_TRIP_CLIENT = 60;
/** And an advisor's — the same, it is a name on a screen. */
export const MAX_TRIP_ADVISOR = 60;

/**
 * Say who a trip is for, or clear it.
 *
 * NOT GATED HERE. Whether an account may use this is a question about plans,
 * and this file knows nothing about plans — the check is in the route, which is
 * the door. Storing a name on a trip is harmless; showing it on a document is
 * the part that belongs to Business.
 */
export async function setTripClient(email: string, id: string, client: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === id);
  if (!trip) return { ok: false as const, error: "That trip is gone." };
  const clean = client.trim().slice(0, MAX_TRIP_CLIENT);
  const next = trips.map((t) => (t.id === id ? { ...t, client: clean || undefined, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(email, next, activeId);
  if (!saved) return { ok: false as const, error: "Could not save that." };
  return { ok: true as const, trips: saved, activeId };
}

/**
 * Put an advisor on a trip, or clear it — the agent the client is dealing with.
 *
 * Same shape and same reasoning as setTripClient: not gated here (the route is
 * the door), and it is a name the trip carries, shown to the client in the app.
 */
export async function setTripAdvisor(email: string, id: string, advisor: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === id);
  if (!trip) return { ok: false as const, error: "That trip is gone." };
  const clean = advisor.trim().slice(0, MAX_TRIP_ADVISOR);
  const next = trips.map((t) => (t.id === id ? { ...t, advisor: clean || undefined, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(email, next, activeId);
  if (!saved) return { ok: false as const, error: "Could not save that." };
  return { ok: true as const, trips: saved, activeId };
}

/**
 * Turn a trip's automatic client reminders on or off.
 *
 * NOT GATED HERE, same reasoning as setTripClient — the route is the door.
 * Turning this off does not clear `remindersSent`: turning it back on later
 * must not re-fire a reminder that already went out once.
 */
export async function setTripAutoReminders(email: string, id: string, on: boolean) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === id);
  if (!trip) return { ok: false as const, error: "That trip is gone." };
  const next = trips.map((t) => (t.id === id ? { ...t, autoReminders: on, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(email, next, activeId);
  if (!saved) return { ok: false as const, error: "Could not save that." };
  return { ok: true as const, trips: saved, activeId };
}

/**
 * Mark one automatic reminder as sent, so it never fires twice. Called only
 * from the cron route (app/api/cron/trip-reminders/route.ts), across
 * whichever account actually owns the trip — not a signed-in caller, so
 * there is no route gate to point to here; the cron route's own auth is the
 * only door.
 */
export async function markReminderSent(email: string, id: string, kind: "departure" | "balanceDue", when: string) {
  if (!hasAccountStorage()) return false;
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === id);
  if (!trip) return false;
  const next = trips.map((t) =>
    t.id === id ? { ...t, remindersSent: { ...t.remindersSent, [kind]: when }, updatedAt: new Date().toISOString() } : t,
  );
  return writeTrips(email, next, activeId);
}

/**
 * Record what the advisor earned on this trip, or clear it.
 *
 * Not gated here — the route is the door, same as setTripClient. `cents`
 * null clears the field entirely rather than storing a zero, so "nothing
 * recorded yet" and "recorded as nothing" stay two different things.
 */
export async function setTripCommission(email: string, id: string, cents: number | null, currency: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === id);
  if (!trip) return { ok: false as const, error: "That trip is gone." };
  const clean = currency.trim().slice(0, 3).toUpperCase() || "USD";
  const next = trips.map((t) =>
    t.id === id
      ? {
          ...t,
          commissionCents: cents === null ? undefined : cents,
          commissionCurrency: cents === null ? undefined : clean,
          updatedAt: new Date().toISOString(),
        }
      : t,
  );
  const saved = await writeTrips(email, next, activeId);
  if (!saved) return { ok: false as const, error: "Could not save that." };
  return { ok: true as const, trips: saved, activeId };
}

/**
 * Write the trips back, keeping the legacy fields in step with the open one.
 *
 * Everything outside this file still reads `data.itinerary` and `data.route`,
 * so the open trip is mirrored there on every write. Get that wrong and the
 * print view or a share link quietly shows a different trip than the builder.
 */
async function writeTrips(email: string, trips: SavedTrip[], activeId: string) {
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const open = trips.find((t) => t.id === activeId) ?? trips[0];
  const next: AccountData = {
    ...current,
    trips,
    activeTripId: open?.id,
    route: open?.route ?? [],
    itinerary: open?.itinerary,
    itineraryShareId: open?.shareId,
    itineraryCollaborators: open?.collaborators ?? [],
    updatedAt: new Date().toISOString(),
  };
  const ok = await writeJson(dataKey(normalized), next);
  return ok ? summarize(trips, open?.id ?? activeId) : null;
}


/**
 * Why this account may not start another trip, or null.
 *
 * ONE PLACE, called by all three doors into a new trip — starting one, adding a
 * shared one, and copying one. The hard 25 that used to sit inline in each of
 * them is still here as the ceiling nobody is meant to reach; the plan limit
 * sits under it and is the one anybody will actually meet.
 *
 * FAILS OPEN. If the plan cannot be read the trip is allowed: refusing somebody
 * their own trip because a store blinked is a worse outcome than one extra
 * trip on a free account.
 */
async function cannotAddTrip(email: string, existing: number): Promise<string | null> {
  if (existing >= 25) return "That is 25 trips already. Delete one first.";
  try {
    const plan = await getPlan(email);
    return newTripProblem(plan, existing, limitsFor(plan, await getLimitOverrides()));
  } catch {
    return null;
  }
}

export async function createTrip(email: string, name?: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips } = withTrips(data);
  const refused = await cannotAddTrip(email, trips.length);
  if (refused) return { ok: false as const, error: refused };
  const now = new Date().toISOString();
  const clean = name?.trim() || `Trip ${trips.length + 1}`;
  const trip: SavedTrip = {
    id: tripId(),
    name: clean,
    itinerary: { ...emptyItinerary(), title: clean },
    route: [],
    collaborators: [],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await writeTrips(email, [...trips, trip], trip.id);
  if (!saved) return { ok: false as const, error: "Could not start the trip." };
  return { ok: true as const, trips: saved, activeId: trip.id };
}

/**
 * Put a trip somebody shared into this account, as a trip of its own.
 *
 * Never over the top of what is already there. Somebody who has spent an hour
 * planning Poland and is then sent a friend's Uman itinerary should end up
 * with two trips, not one — losing the first to gain the second is the worst
 * possible reading of "add this to my account".
 *
 * It is opened straight away, because adding it is how somebody says they want
 * to look at it. The one already open is still there, untouched, in the
 * switcher.
 */
export async function importTrip(email: string, itinerary: Itinerary, name?: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips } = withTrips(data);
  const refused = await cannotAddTrip(email, trips.length);
  if (refused) return { ok: false as const, error: refused };

  const now = new Date().toISOString();
  const clean = (name?.trim() || itinerary.title?.trim() || "Shared trip").slice(0, 80);
  const trip: SavedTrip = {
    id: tripId(),
    name: clean,
    // The copy is theirs. No share link and no collaborators come across — a
    // link handed to them is not a link they may hand on.
    itinerary: { ...itinerary, title: clean, updatedAt: now },
    route: [],
    shareId: undefined,
    collaborators: [],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await writeTrips(email, [...trips, trip], trip.id);
  if (!saved) return { ok: false as const, error: "Could not add the trip." };
  return { ok: true as const, trips: saved, activeId: trip.id };
}

export async function renameTrip(email: string, id: string, name: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const clean = name.trim();
  if (!clean) return { ok: false as const, error: "Give the trip a name." };
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === id)) return { ok: false as const, error: "That trip is gone." };
  const next = trips.map((t) =>
    t.id === id
      ? { ...t, name: clean, itinerary: { ...t.itinerary, title: clean }, updatedAt: new Date().toISOString() }
      : t,
  );
  const saved = await writeTrips(email, next, activeId);
  if (!saved) return { ok: false as const, error: "Could not rename the trip." };
  return { ok: true as const, trips: saved, activeId };
}

export async function switchTrip(email: string, id: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips } = withTrips(data);
  if (!trips.some((t) => t.id === id)) return { ok: false as const, error: "That trip is gone." };
  const saved = await writeTrips(email, trips, id);
  if (!saved) return { ok: false as const, error: "Could not open that trip." };
  return { ok: true as const, trips: saved, activeId: id };
}

export async function duplicateTrip(email: string, id: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const source = trips.find((t) => t.id === id);
  if (!source) return { ok: false as const, error: "That trip is gone." };
  const refused = await cannotAddTrip(email, trips.length);
  if (refused) return { ok: false as const, error: refused };
  const now = new Date().toISOString();
  const name = `${source.name} (copy)`;
  const copy: SavedTrip = {
    id: tripId(),
    name,
    // The client comes across. A copy is a copy — an agent duplicating a trip
    // for a different family renames both, and having to retype the name they
    // meant to keep is the more annoying of the two mistakes.
    client: source.client,
    itinerary: { ...source.itinerary, title: name },
    route: [...(source.route ?? [])],
    // A copy is not shared. Handing someone a link to one trip should not
    // hand them every copy of it made afterwards.
    shareId: undefined,
    collaborators: [],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await writeTrips(email, [...trips, copy], activeId);
  if (!saved) return { ok: false as const, error: "Could not copy the trip." };
  return { ok: true as const, trips: saved, activeId };
}

export async function deleteTrip(email: string, id: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (trips.length <= 1) return { ok: false as const, error: "This is your only trip. Start another one first." };
  const going = trips.find((t) => t.id === id);
  if (!going) return { ok: false as const, error: "That trip is already gone." };
  // Take its share link down with it, or the link would keep resolving to the
  // account and show whatever trip happened to be open.
  if (going.shareId) await deleteKey(shareKey(going.shareId));
  for (const collaborator of readCollaborators(going.collaborators)) {
    await removeFromSharedWith(collaborator.person, normalized);
  }
  const remaining = trips.filter((t) => t.id !== id);
  const nextActive = activeId === id ? remaining[0].id : activeId;
  const saved = await writeTrips(normalized, remaining, nextActive);
  if (!saved) return { ok: false as const, error: "Could not delete the trip." };
  return { ok: true as const, trips: saved, activeId: nextActive };
}

// ---- Templates -----------------------------------------------------------

/**
 * The account's templates, carrying an older account's inline ones into the
 * shared store (lib/trip-templates-store.ts) the first time they are read.
 *
 * Nothing is written here for an account whose store is already populated —
 * this only fires once, for a template saved before the store existed, and
 * writes the carried-over copy back so the next read finds it in the store
 * directly rather than repeating the migration.
 */
async function currentTemplates(email: string): Promise<SavedTemplate[]> {
  const fromStore = await readTemplatesStore(email);
  if (fromStore.length) return fromStore;
  const data = await getAccountData(email);
  const legacy = data.templates?.filter((t) => t && t.id) ?? [];
  if (legacy.length) await writeTemplatesStore(email, legacy);
  return legacy;
}

export async function getTemplates(email: string): Promise<SavedTemplate[]> {
  const templates = await currentTemplates(email);
  return templates.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** How long a template's name may be — a label on a list, not a document. */
export const MAX_TEMPLATE_NAME = 80;
const MAX_TEMPLATES = 25;

/**
 * Save one of the account's own trips as a reusable shape.
 *
 * See lib/trip-templates.ts for exactly what survives — the places, the
 * order, the pacing, where to sleep — and what does not: no traveler names,
 * no flights, no booking references or attachments, nothing that belonged to
 * the one client this trip was actually built for.
 */
export async function saveTripAsTemplate(email: string, id: string, name: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const clean = name.trim().slice(0, MAX_TEMPLATE_NAME);
  if (!clean) return { ok: false as const, error: "Give the template a name." };
  const data = await getAccountData(email);
  const { trips } = withTrips(data);
  const trip = trips.find((t) => t.id === id);
  if (!trip) return { ok: false as const, error: "That trip is gone." };
  const templates = await currentTemplates(email);
  if (templates.length >= MAX_TEMPLATES) {
    return { ok: false as const, error: `That is ${MAX_TEMPLATES} templates already. Delete one first.` };
  }
  const template: SavedTemplate = {
    id: tripId(),
    name: clean,
    itinerary: templateFromTrip(trip.itinerary, clean, tripId),
    createdAt: new Date().toISOString(),
  };
  const next = [...templates, template];
  const saved = await writeTemplatesStore(email, next);
  if (!saved) return { ok: false as const, error: "Could not save the template." };
  return { ok: true as const, templates: next };
}

export async function renameTemplate(email: string, id: string, name: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const clean = name.trim().slice(0, MAX_TEMPLATE_NAME);
  if (!clean) return { ok: false as const, error: "Give the template a name." };
  const templates = await currentTemplates(email);
  if (!templates.some((t) => t.id === id)) return { ok: false as const, error: "That template is gone." };
  const next = templates.map((t) => (t.id === id ? { ...t, name: clean, itinerary: { ...t.itinerary, title: clean } } : t));
  const saved = await writeTemplatesStore(email, next);
  if (!saved) return { ok: false as const, error: "Could not rename the template." };
  return { ok: true as const, templates: next };
}

export async function deleteTemplate(email: string, id: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const templates = await currentTemplates(email);
  if (!templates.some((t) => t.id === id)) return { ok: false as const, error: "That template is already gone." };
  const next = templates.filter((t) => t.id !== id);
  const saved = await writeTemplatesStore(email, next);
  if (!saved) return { ok: false as const, error: "Could not delete the template." };
  return { ok: true as const, templates: next };
}

/**
 * A saved template, brought back as a real trip on the dates a new client
 * actually needs — opened straight away, the same way a shared trip is
 * (importTrip above): adding one is how somebody says they want to look at
 * it, and the trip already open stays untouched in the switcher.
 */
export async function startTripFromTemplate(email: string, templateId: string, name: string, startDate: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const data = await getAccountData(email);
  const template = (await currentTemplates(email)).find((t) => t.id === templateId);
  if (!template) return { ok: false as const, error: "That template is gone." };
  const { trips } = withTrips(data);
  const refused = await cannotAddTrip(email, trips.length);
  if (refused) return { ok: false as const, error: refused };

  const now = new Date().toISOString();
  const clean = (name.trim() || template.name).slice(0, 80);
  const itinerary = tripFromTemplate(template.itinerary, clean, startDate, tripId);
  const trip: SavedTrip = {
    id: tripId(),
    name: clean,
    itinerary: { ...itinerary, updatedAt: now },
    route: [],
    collaborators: [],
    createdAt: now,
    updatedAt: now,
  };
  const saved = await writeTrips(email, [...trips, trip], trip.id);
  if (!saved) return { ok: false as const, error: "Could not start the trip." };
  return { ok: true as const, trips: saved, activeId: trip.id };
}

/** Save an itinerary into one trip, or into the open one. */
export async function saveAccountItinerary(email: string, itinerary: Itinerary, id?: string) {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const targetId = id && trips.some((t) => t.id === id) ? id : activeId;
  const stamped = { ...itinerary, updatedAt: new Date().toISOString() };
  const next = trips.map((t) =>
    t.id === targetId
      ? { ...t, itinerary: stamped, name: stamped.title?.trim() || t.name, updatedAt: new Date().toISOString() }
      : t,
  );
  return Boolean(await writeTrips(normalized, next, activeId));
}

// ---- Proposals ----------------------------------------------------------
//
// A proposal lives on the trip it belongs to (SavedTrip.proposal), read and
// written the same read-modify-write way the itinerary itself is. Its own
// public link (proposalShareId) is separate from the itinerary's, resolved
// through its own reverse-index key — a client may hold a proposal link
// before the trip has an itinerary worth sharing at all.

function proposalId() {
  return randomBytes(6).toString("base64url");
}

function proposalShareKey(shareId: string) {
  return `white-glove:proposal-share:${shareId}`;
}

/** One trip's proposal, or null if the planner hasn't started one. */
export async function getProposal(email: string, tripId: string): Promise<Proposal | null> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.proposal ?? null;
}

/** Create or overwrite a trip's proposal. */
export async function saveProposal(email: string, tripId: string, proposal: Proposal): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === tripId)) return false;
  const stamped: Proposal = { ...proposal, id: proposal.id || proposalId(), updatedAt: new Date().toISOString() };
  const next = trips.map((t) => (t.id === tripId ? { ...t, proposal: stamped, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/**
 * Move a trip between the only two stages a planner ever sets by hand —
 * inquiry and active planning, before a proposal exists. See
 * data/trip-pipeline.ts for why nothing past this is stored rather than
 * derived.
 */
export async function savePipelineStage(email: string, tripId: string, stage: ManualTripStage): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === tripId)) return false;
  const next = trips.map((t) => (t.id === tripId ? { ...t, pipelineStage: stage, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

// ---- Payments --------------------------------------------------------
//
// A trip's payment balance — total, split, schedule and ledger. See
// data/trip-payments.ts for the shape and every pure computation on it
// (paid/remaining/collected/outstanding); this file only ever reads and
// writes the whole TripBalance object, the same read-modify-write every
// other per-trip record here uses.

/** One trip's payment balance, or null if the planner hasn't set one up. */
export async function getBalance(email: string, tripId: string): Promise<TripBalance | null> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.balance ?? null;
}

/** Create or overwrite a trip's balance — the planner's own setup, never a payment itself. */
export async function saveBalance(email: string, tripId: string, balance: TripBalance): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === tripId)) return false;
  const next = trips.map((t) => (t.id === tripId ? { ...t, balance, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/**
 * Append one real payment attempt to the ledger — IDEMPOTENT, but keyed on the
 * intent AND its outcome, not the intent alone.
 *
 * A single Stripe PaymentIntent keeps the SAME `pi_…` id across a declined
 * attempt and the successful retry that follows it (a card re-entered against
 * the same client secret). Deduping on the id alone meant the earlier
 * `payment_failed` row swallowed the later `payment_succeeded` for the same id:
 * the money settled, but the ledger only ever held the failure, so the trip
 * still read as owing and `/pay` would mint a SECOND charge. So:
 *
 * - the same intent with the same outcome is a genuine duplicate (a retried or
 *   double-delivered webhook) and changes nothing;
 * - a `failed` event for an intent that already succeeded is ignored — settled
 *   money is never overwritten by a late or out-of-order failure;
 * - a `succeeded` event supersedes any earlier `failed` row for that same
 *   intent rather than sitting behind it, so paidCentsFor counts the money.
 */
export async function recordPayment(ownerEmail: string, tripId: string, record: PaymentRecord): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(ownerEmail);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const balance: TripBalance = trip.balance ?? { currency: record.currency, splitMode: "equal", assignments: [], schedule: [], showTotalToTravelers: false, payments: [] };
  const merged = mergePaymentRecord(balance.payments, record);
  // Nothing changed — a genuine duplicate, or a stale failure after success.
  // Idempotent success, exactly as a retried webhook expects.
  if (!merged) return true;
  const next = trips.map((t) =>
    t.id === tripId ? { ...t, balance: { ...balance, payments: merged }, updatedAt: new Date().toISOString() } : t,
  );
  return Boolean(await writeTrips(normalized, next, activeId));
}

/**
 * Merge one payment attempt into a ledger, keyed on the intent AND its outcome.
 * Returns the new payments array, or null when nothing should change. Pulled
 * out of recordPayment as pure logic so the idempotency rules can be pinned by
 * a test without a live store. See recordPayment for why the id alone is not a
 * safe key (a declined attempt and its successful retry share one intent id).
 */
export function mergePaymentRecord(existing: PaymentRecord[], record: PaymentRecord): PaymentRecord[] | null {
  const sameIntent = existing.filter((p) => p.stripePaymentIntentId === record.stripePaymentIntentId);
  // Same intent, same outcome → a retried or double-delivered webhook. No-op.
  if (sameIntent.some((p) => p.status === record.status)) return null;
  // A failure arriving after this intent already succeeded is stale — drop it.
  if (record.status === "failed" && sameIntent.some((p) => p.status === "succeeded")) return null;
  // A success supersedes any earlier failed attempt on the same intent, rather
  // than sitting behind it where paidCentsFor would never count the money.
  const kept =
    record.status === "succeeded"
      ? existing.filter((p) => !(p.stripePaymentIntentId === record.stripePaymentIntentId && p.status === "failed"))
      : existing;
  return [...kept, record];
}

// ---- Live travel information ----------------------------------------------
//
// A flight's real status, checked on demand (no cron in this deployment —
// see lib/flight-status.ts) whenever somebody opens the app on a trip with a
// flight coming up soon, throttled so the same flight isn't re-queried every
// time the page loads.

function tripAlertId() {
  return randomBytes(6).toString("base64url");
}

/** Re-check status if the last real reading is older than this. */
const FLIGHT_RECHECK_MS = 3 * 60 * 60 * 1000;
/** Only bother checking a flight departing this soon — no use querying a flight six months out. */
const FLIGHT_CHECK_WINDOW_DAYS = 3;

/**
 * Check every upcoming flight on this trip that is due for a re-check, and
 * record whatever alerts come out of a meaningful change. Silent when
 * nothing needed checking (every flight was checked recently, or none is
 * departing soon) — no write happens in that case.
 */
export async function checkTripFlightStatus(email: string, tripId: string): Promise<TripAlert[]> {
  if (!hasAccountStorage()) return [];
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return [];

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + FLIGHT_CHECK_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const candidates = trip.itinerary.flights.filter((f) => f.flightNo?.trim() && f.date && f.date >= today && f.date <= cutoff);
  if (candidates.length === 0) return [];

  const statuses = { ...(trip.flightStatus ?? {}) };
  const newAlerts: TripAlert[] = [];
  let checkedAny = false;

  for (const flight of candidates) {
    const previous = statuses[flight.id];
    if (previous && Date.now() - Date.parse(previous.checkedAt) < FLIGHT_RECHECK_MS) continue;
    const next = await checkFlightStatus(flight.id, flight.flightNo!.trim(), flight.date);
    if (!next) continue;
    checkedAny = true;
    const label = [flight.airline, flight.flightNo].filter(Boolean).join(" ") || `${flight.from} → ${flight.to}`;
    newAlerts.push(...alertsFromStatusChange(label, previous, next, tripAlertId));
    statuses[flight.id] = next;
  }
  if (!checkedAny) return [];

  const nextTrips = trips.map((t) =>
    t.id === tripId
      ? { ...t, flightStatus: statuses, alerts: [...(t.alerts ?? []), ...newAlerts], updatedAt: new Date().toISOString() }
      : t,
  );
  await writeTrips(normalized, nextTrips, activeId);

  // Told, not just recorded — a device subscribed to this trip (see
  // savePushSubscription) is pushed the moment there is something worth
  // knowing, rather than only finding out the next time the app happens to
  // be opened. Best-effort: nothing here is allowed to fail the check itself.
  if (newAlerts.length && trip.pushSubscriptions?.length) {
    await notifySubscribers(normalized, tripId, trip.pushSubscriptions, trip.shareId, newAlerts).catch((error) =>
      console.error("[account-store] push notify failed:", error),
    );
  }

  return newAlerts;
}

/** One push, summarizing however many alerts a single check turned up. */
async function notifySubscribers(
  ownerEmail: string,
  tripId: string,
  subscriptions: PushSubscriptionRecord[],
  shareId: string | undefined,
  alerts: TripAlert[],
): Promise<void> {
  const payload =
    alerts.length === 1
      ? { title: alerts[0].title, body: alerts[0].note }
      : { title: `${alerts.length} changes on your trip`, body: alerts.map((a) => a.title).join(" · ") };
  const { expired } = await sendPushToSubscriptions(subscriptions, {
    ...payload,
    ...(shareId ? { url: `/i/${shareId}/app` } : {}),
  });
  if (!expired.length) return;

  // Endpoints the push service itself says are gone — pruned in their own
  // write so a slow or failed send never risks the alerts just recorded.
  const data = await getAccountData(ownerEmail);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip?.pushSubscriptions?.length) return;
  const kept = trip.pushSubscriptions.filter((s) => !expired.includes(s.endpoint));
  const nextTrips = trips.map((t) => (t.id === tripId ? { ...t, pushSubscriptions: kept } : t));
  await writeTrips(ownerEmail, nextTrips, activeId);
}

/** Every alert recorded on this trip so far, oldest first — read fresh after checkTripFlightStatus so a just-created alert is included. */
export async function getTripAlerts(email: string, tripId: string): Promise<TripAlert[]> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.alerts ?? [];
}

/** Mark one alert as read — dismissed from the Changes screen, never deleted. */
export async function acknowledgeAlert(email: string, tripId: string, alertId: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const nextTrips = trips.map((t) =>
    t.id === tripId
      ? { ...t, alerts: (t.alerts ?? []).map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)), updatedAt: new Date().toISOString() }
      : t,
  );
  return Boolean(await writeTrips(normalized, nextTrips, activeId));
}

/** The proposal's public link — created once, reused after. */
export async function ensureProposalShare(email: string, tripId: string): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  if (trip.proposalShareId) {
    await writeJson(proposalShareKey(trip.proposalShareId), { ownerEmail: normalized, tripId, createdAt: new Date().toISOString() });
    return trip.proposalShareId;
  }
  const token = shareToken();
  const wrote = await writeJson(proposalShareKey(token), { ownerEmail: normalized, tripId, createdAt: new Date().toISOString() });
  if (!wrote) return null;
  const next = trips.map((t) => (t.id === tripId ? { ...t, proposalShareId: token, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(normalized, next, activeId);
  return saved ? token : null;
}

/** A proposal by its public token — marks it "viewed" the first time a client opens a "sent" one. */
export async function getSharedProposal(shareId: string) {
  const rec = await readJson<{ ownerEmail: string; tripId: string }>(proposalShareKey(shareId));
  if (!rec) return null;
  const data = await getAccountData(rec.ownerEmail);
  const trip = withTrips(data).trips.find((t) => t.id === rec.tripId);
  if (!trip?.proposal) return null;
  let proposal = trip.proposal;
  if (proposal.status === "sent") {
    proposal = { ...proposal, status: "viewed", viewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await saveProposal(rec.ownerEmail, rec.tripId, proposal);
  }
  const record = await getAccountRecord(rec.ownerEmail);
  return { proposal, tripName: trip.client || trip.name, ownerName: record?.name, advisor: trip.advisor };
}

export type ProposalClientAction =
  | { kind: "select"; optionId: string }
  | { kind: "approve" }
  | { kind: "request_changes"; text?: string }
  | { kind: "comment"; text: string };

/**
 * What a client may do to a proposal from its public link — never more.
 * Approving with nothing selected, or selecting an option that isn't on the
 * proposal, is refused rather than guessed at.
 */
export async function applyProposalClientAction(shareId: string, action: ProposalClientAction): Promise<Proposal | null> {
  const rec = await readJson<{ ownerEmail: string; tripId: string }>(proposalShareKey(shareId));
  if (!rec) return null;
  const data = await getAccountData(rec.ownerEmail);
  const trip = withTrips(data).trips.find((t) => t.id === rec.tripId);
  if (!trip?.proposal) return null;
  const now = new Date().toISOString();
  const current = trip.proposal;
  let next: Proposal;

  if (action.kind === "select") {
    if (!current.options.some((o) => o.id === action.optionId)) return null;
    next = { ...current, selectedOptionId: action.optionId };
  } else if (action.kind === "approve") {
    if (!current.selectedOptionId) return null;
    next = { ...current, status: "approved", respondedAt: now };
  } else if (action.kind === "request_changes") {
    const text = action.text?.trim().slice(0, 2000);
    next = {
      ...current,
      status: "changes_requested",
      respondedAt: now,
      comments: text ? [...current.comments, { from: "client" as const, text, at: now }] : current.comments,
    };
  } else {
    const text = action.text.trim().slice(0, 2000);
    if (!text) return null;
    next = { ...current, comments: [...current.comments, { from: "client" as const, text, at: now }] };
  }

  const ok = await saveProposal(rec.ownerEmail, rec.tripId, next);
  return ok ? next : null;
}

/**
 * Turn the client's approved option into real itinerary rows — appended to
 * whatever the itinerary already holds, never replacing it. The proposal
 * itself stays on the trip afterward, marked confirmed, as the record of
 * what was actually offered and agreed to.
 */
export async function convertProposalToItinerary(email: string, tripId: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip?.proposal?.selectedOptionId) return false;
  const option = trip.proposal.options.find((o) => o.id === trip.proposal!.selectedOptionId);
  if (!option) return false;
  const itinerary = proposalOptionToItinerary(option, trip.itinerary);
  const now = new Date().toISOString();
  const next = trips.map((t) =>
    t.id === tripId
      ? { ...t, itinerary, proposal: { ...t.proposal!, status: "confirmed" as const, updatedAt: now }, updatedAt: now }
      : t,
  );
  return Boolean(await writeTrips(normalized, next, activeId));
}

// ---- Per-traveler access --------------------------------------------------
//
// A door into the trip app scoped to ONE traveler, for a family or group
// trip where each person is handed their own link rather than everyone
// sharing the one trip-wide link. Most trips never use this.

function travelerShareKey(shareId: string) {
  return `white-glove:traveler-share:${shareId}`;
}

/** One traveler's own link — created once, reused after. */
export async function ensureTravelerShare(email: string, tripId: string, travelerId: string): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  const traveler = trip?.itinerary.travelers?.find((p) => p.id === travelerId);
  if (!trip || !traveler) return null;

  const existing = trip.travelerShares?.[travelerId];
  if (existing) {
    await writeJson(travelerShareKey(existing), { ownerEmail: normalized, tripId, travelerId, createdAt: new Date().toISOString() });
    // A trip that already had per-traveler links from before this was added
    // may still have no trip-wide share — ensure one now, since the chat
    // thread a traveler's link opens is keyed by the TRIP's own share token.
    await ensureTripShare(normalized, tripId);
    return existing;
  }
  const token = shareToken();
  const wrote = await writeJson(travelerShareKey(token), { ownerEmail: normalized, tripId, travelerId, createdAt: new Date().toISOString() });
  if (!wrote) return null;
  const nextTravelers = (trip.itinerary.travelers ?? []).map((p) => (p.id === travelerId ? { ...p, hasOwnAccess: true } : p));
  const next = trips.map((t) =>
    t.id === tripId
      ? {
          ...t,
          itinerary: { ...t.itinerary, travelers: nextTravelers },
          travelerShares: { ...(t.travelerShares ?? {}), [travelerId]: token },
          updatedAt: new Date().toISOString(),
        }
      : t,
  );
  const saved = await writeTrips(normalized, next, activeId);
  if (!saved) return null;
  // Same reason as above: guarantee a trip-wide share exists so this
  // traveler's app has a chat thread to open, even if the planner never
  // created a whole-trip client link.
  await ensureTripShare(normalized, tripId);
  return token;
}

/**
 * Who a traveler-scoped link belongs to, and everything its own app page
 * needs: the trip's itinerary (attachments stripped — see
 * getSharedItineraryByShareId, the same rule applies to every client link,
 * traveler-scoped or not), and the names shown in the app's header.
 *
 * `internalChatKey` IS THE TRIP'S OWN WHOLE-TRIP SHARE TOKEN — a strictly
 * MORE powerful credential than the one this traveler actually holds, since
 * it opens /i/[shareId] unredacted for every unit on the trip. It exists here
 * ONLY so resolveCompanionShare (below) can find the one shared chat thread
 * every traveler and the advisor post into. NEVER send this field to a
 * browser or echo it in an API response — a page that did this once already
 * (app/t/[shareId]/app/page.tsx, fixed) handed a redacted viewer the key to
 * their own unredacted trip. Use resolveCompanionShare, not this field
 * directly, for anything chat-related.
 */
export async function getSharedTraveler(shareId: string) {
  const rec = await readJson<{ ownerEmail: string; tripId: string; travelerId: string }>(travelerShareKey(shareId));
  if (!rec) return null;
  const [data, record] = await Promise.all([getAccountData(rec.ownerEmail), getAccountRecord(rec.ownerEmail)]);
  const trip = withTrips(data).trips.find((t) => t.id === rec.tripId);
  const traveler = trip?.itinerary.travelers?.find((p) => p.id === rec.travelerId);
  if (!trip || !traveler) return null;
  return {
    ownerEmail: rec.ownerEmail,
    tripId: rec.tripId,
    traveler,
    itinerary: withoutAttachments(trip.itinerary),
    internalChatKey: trip.shareId,
    ownerName: record?.name,
    advisor: trip.advisor?.trim() ?? "",
  };
}

/**
 * Resolve ANY token that opens the companion app's chat — a trip-wide
 * /i/[shareId] token, or a traveler-scoped /t/[shareId] one — to the trip's
 * owner and the ONE real chat key every side's messages are actually stored
 * under (always the trip's own whole-trip share token, so a family and the
 * advisor share one thread regardless of which door each person came in by).
 *
 * THE RETURNED chatKey IS SERVER-SIDE ONLY. It is what lib/companion-chat-store.ts
 * is keyed by internally; it must never be echoed back in a response or
 * handed to a browser as a value it can act on — the caller already has
 * `shareId`, its own, less-powerful token, for anything the client needs to
 * keep using.
 */
export async function resolveCompanionShare(shareId: string): Promise<{ ownerEmail: string; chatKey: string } | null> {
  const ownerEmail = await getShareOwnerEmail(shareId);
  if (ownerEmail) return { ownerEmail, chatKey: shareId };
  const traveler = await getSharedTraveler(shareId);
  if (traveler?.internalChatKey) return { ownerEmail: traveler.ownerEmail, chatKey: traveler.internalChatKey };
  return null;
}

// ---- Push notifications ----------------------------------------------------
//
// Kept per trip, not per account — a client has no account, only the link
// they were sent, and either kind of link (the whole-trip one or a single
// traveler's own) resolves to the same trip's subscriptions, because a
// flight delay is news to everyone on the trip alike.

/** Either shape of client link, resolved down to the one trip it opens. */
async function resolveShareToTrip(shareId: string): Promise<{ ownerEmail: string; tripId: string } | null> {
  const ownerEmail = await getShareOwnerEmail(shareId);
  if (ownerEmail) {
    const trip = withTrips(await getAccountData(ownerEmail)).trips.find((t) => t.shareId === shareId);
    if (trip) return { ownerEmail, tripId: trip.id };
  }
  const traveler = await getSharedTraveler(shareId);
  if (traveler) return { ownerEmail: traveler.ownerEmail, tripId: traveler.tripId };
  return null;
}

const MAX_PUSH_SUBSCRIPTIONS = 12;

/** A device asking to be told about this trip's alerts — added from inside the app itself, never on anyone's behalf. */
export async function savePushSubscription(shareId: string, subscription: PushSubscriptionRecord): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const resolved = await resolveShareToTrip(shareId);
  if (!resolved) return false;
  const data = await getAccountData(resolved.ownerEmail);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === resolved.tripId);
  if (!trip) return false;
  const existing = (trip.pushSubscriptions ?? []).filter((s) => s.endpoint !== subscription.endpoint);
  // A phone re-subscribing (a fresh key after clearing site data) replaces
  // its old entry rather than piling up a duplicate under the same endpoint.
  const next = [...existing, subscription].slice(-MAX_PUSH_SUBSCRIPTIONS);
  const nextTrips = trips.map((t) => (t.id === resolved.tripId ? { ...t, pushSubscriptions: next, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(resolved.ownerEmail, nextTrips, activeId));
}

/** Turning notifications back off on one device. */
export async function removePushSubscription(shareId: string, endpoint: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const resolved = await resolveShareToTrip(shareId);
  if (!resolved) return false;
  const data = await getAccountData(resolved.ownerEmail);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === resolved.tripId);
  if (!trip?.pushSubscriptions?.length) return true; // nothing to remove is not a failure
  const next = trip.pushSubscriptions.filter((s) => s.endpoint !== endpoint);
  const nextTrips = trips.map((t) => (t.id === resolved.tripId ? { ...t, pushSubscriptions: next, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(resolved.ownerEmail, nextTrips, activeId));
}

// ---- Client forms ---------------------------------------------------------
//
// The template (which fields, which are required) lives on the trip; the
// answers do too, but are NEVER handed back by getSharedForm — that route
// answers a fresh respondent with the template alone. Reading answers back
// is a separate, planner-only, authenticated call (getFormResponses).

function formShareKey(shareId: string) {
  return `white-glove:form-share:${shareId}`;
}
function formResponseId() {
  return randomBytes(6).toString("base64url");
}

export async function getFormTemplate(email: string, tripId: string): Promise<ClientFormTemplate | null> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.formTemplate ?? null;
}

export async function saveFormTemplate(email: string, tripId: string, template: ClientFormTemplate): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === tripId)) return false;
  const stamped: ClientFormTemplate = { ...template, updatedAt: new Date().toISOString() };
  const next = trips.map((t) => (t.id === tripId ? { ...t, formTemplate: stamped, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** The form's public link — created once, reused after. */
export async function ensureFormShare(email: string, tripId: string): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  if (trip.formShareId) {
    await writeJson(formShareKey(trip.formShareId), { ownerEmail: normalized, tripId, createdAt: new Date().toISOString() });
    return trip.formShareId;
  }
  const token = shareToken();
  const wrote = await writeJson(formShareKey(token), { ownerEmail: normalized, tripId, createdAt: new Date().toISOString() });
  if (!wrote) return null;
  const next = trips.map((t) => (t.id === tripId ? { ...t, formShareId: token, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(normalized, next, activeId);
  return saved ? token : null;
}

/** What a fresh respondent needs — the template and who it's for, never
 *  any answer anybody else already gave. */
export async function getSharedForm(shareId: string) {
  const rec = await readJson<{ ownerEmail: string; tripId: string }>(formShareKey(shareId));
  if (!rec) return null;
  const data = await getAccountData(rec.ownerEmail);
  const trip = withTrips(data).trips.find((t) => t.id === rec.tripId);
  if (!trip?.formTemplate) return null;
  return { template: trip.formTemplate, tripName: trip.client || trip.name, advisor: trip.advisor };
}

/** Add one response — the only thing a client's link may ever do here. */
export async function submitFormResponse(shareId: string, respondentName: string, answers: Record<string, string>): Promise<boolean> {
  const rec = await readJson<{ ownerEmail: string; tripId: string }>(formShareKey(shareId));
  if (!rec) return false;
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(rec.ownerEmail);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === rec.tripId);
  if (!trip?.formTemplate) return false;
  const name = respondentName.trim().slice(0, 120);
  if (!name) return false;
  // Only what the template actually asked for — a caller cannot smuggle an
  // extra field onto the record just by including it in the request.
  const cleanAnswers: Record<string, string> = {};
  for (const field of trip.formTemplate.fields) {
    const value = answers[field.id];
    if (typeof value === "string" && value.trim()) cleanAnswers[field.id] = value.trim().slice(0, 500);
  }
  const response: ClientFormResponse = { id: formResponseId(), respondentName: name, answers: cleanAnswers, submittedAt: new Date().toISOString() };
  const nextResponses = [...(trip.formResponses ?? []), response];
  const next = trips.map((t) => (t.id === rec.tripId ? { ...t, formResponses: nextResponses, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** The planner's own read of what's come back — never reachable any other way. */
export async function getFormResponses(email: string, tripId: string): Promise<ClientFormResponse[]> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.formResponses ?? [];
}

// ---- Itinerary sharing ------------------------------------------------

function shareKey(shareId: string) {
  return `white-glove:itinerary-share:${shareId}`;
}
function sharedWithKey(email: string) {
  return `white-glove:shared-with:${normalizeId(email)}`;
}
function shareToken() {
  return randomBytes(9).toString("base64url"); // ~12 url-safe chars
}

/**
 * Patch the account record, mirroring share changes onto the open trip.
 *
 * Sharing is written in the legacy fields, and the trips array is written from
 * those same fields when a trip is opened. Without this mirror the next switch
 * would hand the open trip's share link back to whatever it used to be.
 */
async function patchAccountData(email: string, patch: Partial<AccountData>) {
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const next: AccountData = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const touchesShare = "itineraryShareId" in patch || "itineraryCollaborators" in patch;
  if (touchesShare) {
    const { trips, activeId } = withTrips(current);
    next.trips = trips.map((t) =>
      t.id === activeId
        ? {
            ...t,
            shareId: "itineraryShareId" in patch ? patch.itineraryShareId : t.shareId,
            collaborators: "itineraryCollaborators" in patch ? (patch.itineraryCollaborators ?? []) : t.collaborators,
            updatedAt: new Date().toISOString(),
          }
        : t,
    );
    next.activeTripId = activeId;
  }
  const ok = await writeJson(dataKey(normalized), next);
  return ok ? next : null;
}

/** Current share state for the owner's trip, with everyone's role. */
export async function getItineraryShareState(email: string) {
  const data = await getAccountData(email);
  return { shareId: data.itineraryShareId, collaborators: readCollaborators(data.itineraryCollaborators) };
}

/**
 * Who this person is on somebody else's trip, and what they may do.
 *
 * The one function the server asks before it changes a shared trip. It reads
 * the owner's own record every time rather than trusting anything the browser
 * sent, because the browser is where somebody would lie about being an editor.
 */
export async function tripAccessFor(ownerEmail: string, asker: string | null) {
  const owner = normalizeId(ownerEmail);
  const collaborators = readCollaborators((await getAccountData(owner)).itineraryCollaborators);
  const who = asker ? normalizeId(asker) : null;
  const at = { owner, asker: who, collaborators };
  return {
    role: who && who === owner ? ("owner" as const) : roleOf(who, collaborators),
    canView: may("view", at),
    canComment: may("comment", at),
    canEdit: may("edit", at),
  };
}

/** Ensure a public share token exists for this account's trip; returns it. */
export async function ensureItineraryShare(email: string): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  if (data.itineraryShareId) {
    // Make sure the reverse lookup exists (self-heal).
    await writeJson(shareKey(data.itineraryShareId), { ownerEmail: normalized, createdAt: new Date().toISOString() });
    return data.itineraryShareId;
  }
  const token = shareToken();
  const wrote = await writeJson(shareKey(token), { ownerEmail: normalized, createdAt: new Date().toISOString() });
  if (!wrote) return null;
  await patchAccountData(normalized, { itineraryShareId: token });
  return token;
}

/** Stop sharing: remove the public link and every collaborator's access. */
export async function stopItineraryShare(email: string) {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  if (data.itineraryShareId) await deleteKey(shareKey(data.itineraryShareId));
  for (const collaborator of readCollaborators(data.itineraryCollaborators)) {
    await removeFromSharedWith(collaborator.person, normalized);
  }
  await patchAccountData(normalized, { itineraryShareId: undefined, itineraryCollaborators: [] });
  return true;
}

export async function getShareOwnerEmail(shareId: string): Promise<string | null> {
  const rec = await readJson<{ ownerEmail: string }>(shareKey(shareId));
  return rec?.ownerEmail ?? null;
}

/**
 * Read a shared trip by its public token (read-only view).
 *
 * PER TRIP, not per account. The link resolves to the ONE trip that carries
 * this token — so a client sent their own link sees their own itinerary and
 * never another of the agency's trips, whichever trip happens to be open in the
 * planner. A token from before trips had their own share links has no trip that
 * matches, and falls back to the open trip, which is exactly the one it was.
 */
export async function getSharedItineraryByShareId(shareId: string) {
  const ownerEmail = await getShareOwnerEmail(shareId);
  if (!ownerEmail) return null;
  const [data, record] = await Promise.all([getAccountData(ownerEmail), getAccountRecord(ownerEmail)]);
  const trip = withTrips(data).trips.find((t) => t.shareId === shareId);
  const itinerary = trip?.itinerary ?? data.itinerary; // legacy: the account-level share is the open trip
  if (!itinerary) return null;
  // Who the trip was planned for, and by whom — the two names the client reads
  // to know the itinerary is theirs.
  const client = trip?.client?.trim() ?? "";
  const advisor = trip?.advisor?.trim() ?? "";
  // Boarding passes and tickets do not leave the account they were uploaded
  // to. Serving one already checks the owner, so the reference alone would
  // fetch nothing — but stripping it here means the person holding the link is
  // not even told a pass exists. Two answers to the same question, because
  // this is the one that costs somebody their flight if it is wrong.
  return { itinerary: withoutAttachments(itinerary), ownerName: record?.name, ownerEmail, client, advisor, tripId: trip?.id };
}

/* ---- per-trip sharing: one link, locked to one itinerary ---------------- */

/** The share token on a specific trip, if it has one. */
export async function getTripShareState(email: string, tripId: string): Promise<{ shareId: string | null }> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return { shareId: trip?.shareId ?? null };
}

/**
 * Ensure a public token on ONE trip (not the open one), and return it.
 *
 * The token is written onto the trip itself and into the reverse lookup that
 * maps it back to this owner. Reusing an existing token self-heals the lookup,
 * the same way the account-level share does.
 */
export async function ensureTripShare(email: string, tripId: string): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  if (trip.shareId) {
    await writeJson(shareKey(trip.shareId), { ownerEmail: normalized, createdAt: new Date().toISOString() });
    return trip.shareId;
  }
  const token = shareToken();
  const wrote = await writeJson(shareKey(token), { ownerEmail: normalized, createdAt: new Date().toISOString() });
  if (!wrote) return null;
  const next = trips.map((t) => (t.id === tripId ? { ...t, shareId: token, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(normalized, next, activeId);
  return saved ? token : null;
}

/** Stop sharing ONE trip: drop its token and everyone it was shared with. */
export async function stopTripShare(email: string, tripId: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  if (trip.shareId) await deleteKey(shareKey(trip.shareId));
  for (const collaborator of readCollaborators(trip.collaborators)) {
    await removeFromSharedWith(collaborator.person, normalized);
  }
  // Push subscriptions go with it too — a device that opted in while the
  // link was live has no business still getting trip-change notifications
  // once the advisor has revoked that link. Left in place, notifySubscribers
  // (called whenever a flight-status check finds something new) would keep
  // sending to it regardless: it reads pushSubscriptions off the trip, not
  // the share token, and never itself checks whether shareId is still set.
  const next = trips.map((t) =>
    t.id === tripId ? { ...t, shareId: undefined, collaborators: [], pushSubscriptions: [], updatedAt: new Date().toISOString() } : t,
  );
  return Boolean(await writeTrips(normalized, next, activeId));
}

async function upsertSharedWith(collaboratorEmail: string, entry: SharedTrip) {
  const key = sharedWithKey(collaboratorEmail);
  const list = (await readJson<SharedTrip[]>(key)) ?? [];
  const next = [entry, ...list.filter((e) => normalizeId(e.ownerEmail) !== normalizeId(entry.ownerEmail))].slice(0, 50);
  await writeJson(key, next);
}
async function removeFromSharedWith(collaboratorEmail: string, ownerEmail: string) {
  const key = sharedWithKey(collaboratorEmail);
  const list = (await readJson<SharedTrip[]>(key)) ?? [];
  const next = list.filter((e) => normalizeId(e.ownerEmail) !== normalizeId(ownerEmail));
  await writeJson(key, next);
}

/**
 * Add a person to the owner's trip, by whatever they sign in with.
 *
 * A phone number is allowed, because somebody who signed up with one has no
 * email to be added by. Only an email gets the "somebody shared a trip with
 * you" message, though — a share link is not worth a text message, and the
 * trip is waiting for them either way when they next sign in.
 */
export async function addItineraryCollaborator(ownerEmail: string, collaboratorEmail: string, role: TripRole = "viewer") {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const owner = normalizeId(ownerEmail);
  const identity = normalizeIdentity(collaboratorEmail ?? "");
  if (!identity) return { ok: false as const, error: "Enter an email address or a phone number." };
  const person = identity.value;
  if (person === owner) return { ok: false as const, error: "That's your own account." };
  const shareId = await ensureItineraryShare(owner);
  if (!shareId) return { ok: false as const, error: "Could not create the share link." };
  const data = await getAccountData(owner);
  const current = readCollaborators(data.itineraryCollaborators);
  // Sharing with somebody already on it CHANGES their role rather than adding
  // them twice — which is also how the owner demotes an editor back to a
  // viewer, so taking access away needs no separate door.
  const collaborators = current.some((c) => c.person === person)
    ? current.map((c) => (c.person === person ? { ...c, role } : c))
    : [...current, { person, role, addedAt: new Date().toISOString() }].slice(0, 50);
  await patchAccountData(owner, { itineraryCollaborators: collaborators });
  const [record] = await Promise.all([getAccountRecord(owner)]);
  await upsertSharedWith(person, { ownerEmail: owner, ownerName: record?.name, title: data.itinerary?.title || "Shared trip", shareId });
  return { ok: true as const, shareId, collaborators };
}

export async function removeItineraryCollaborator(ownerEmail: string, collaboratorEmail: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const owner = normalizeId(ownerEmail);
  const person = normalizeId(collaboratorEmail);
  const data = await getAccountData(owner);
  const collaborators = readCollaborators(data.itineraryCollaborators).filter((c) => c.person !== person);
  await patchAccountData(owner, { itineraryCollaborators: collaborators });
  await removeFromSharedWith(person, owner);
  return { ok: true as const, collaborators };
}

/** Trips other people have shared with this person (still-valid ones only). */
export async function listSharedWithMe(email: string): Promise<SharedTrip[]> {
  const list = (await readJson<SharedTrip[]>(sharedWithKey(email))) ?? [];
  const valid = await Promise.all(
    list.map(async (e): Promise<SharedTrip | null> => {
      const owner = await getShareOwnerEmail(e.shareId);
      if (!owner || normalizeId(owner) !== normalizeId(e.ownerEmail)) return null;
      const data = await getAccountData(owner);
      // Confirm the person is still a collaborator (owner may have removed
      // them) and carry what they may do, so the list can say so before it is
      // opened rather than after Save has failed.
      const role = roleOf(normalizeId(email), readCollaborators(data.itineraryCollaborators));
      if (!role) return null;
      return { ...e, title: data.itinerary?.title || e.title, role };
    }),
  );
  return valid.filter((e): e is SharedTrip => e !== null);
}

export async function toggleAccountPlace(email: string, collection: "route" | "favorites", place: SavedPlace) {
  const current = await getAccountData(email);
  const items = current[collection] ?? [];
  const exists = items.some((item) => item.id === place.id);
  const next = exists ? items.filter((item) => item.id !== place.id) : [...items, place];
  return saveAccountCollection(email, collection, next);
}

export async function getCurrentAccountSummary(cookieValue?: string): Promise<AccountSummary | null> {
  const email = readSessionEmail(cookieValue);
  if (!email) return null;
  const [record, data] = await Promise.all([getAccountRecord(email), getAccountData(email)]);
  if (!record) return null;
  return {
    email,
    name: record.name,
    phone: record.phone,
    routeCount: data.route.length,
    favoriteCount: data.favorites.length,
    createdAt: record.createdAt,
    verifiedAt: record.verifiedAt,
    avatarMediaId: record.avatarMediaId,
  };
}

async function deleteKey(key: string) {
  const response = await redis(`del/${encodeURIComponent(key)}`);
  return Boolean(response);
}

export async function updateAccountProfile(email: string, updates: { name?: string; phone?: string }) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, error: "Account not found." };
  const next: AccountRecord = {
    ...record,
    name: updates.name !== undefined ? updates.name.trim() || undefined : record.name,
    phone: updates.phone !== undefined ? updates.phone.trim() || undefined : record.phone,
  };
  const saved = await writeJson(accountKey(normalized), next);
  if (!saved) return { ok: false as const, error: "Could not save your changes." };
  return { ok: true as const };
}

/**
 * Set or clear the account's profile picture.
 *
 * Only the media id is stored here — the image itself lives in the media store
 * (lib/media.ts) and is served by the public /api/media route, the same way
 * every other uploaded file on the site is. Clearing passes null; the replaced
 * image stays behind in the store, unguessable and referenced by nothing,
 * because the media store deliberately has no delete and a dangling id is
 * harmless.
 */
export async function setAccountAvatar(email: string, mediaId: string | null) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record) return { ok: false as const, error: "Account not found." };
  const next: AccountRecord = { ...record, avatarMediaId: mediaId ?? undefined };
  const saved = await writeJson(accountKey(normalized), next);
  if (!saved) return { ok: false as const, error: "Could not save the picture." };
  return { ok: true as const };
}

// Move the account (and its saved data) to a new identifier — an email address
// or a phone number. It is the record key, so changing it re-keys both records
// and removes the old ones.
export async function changeAccountEmail(currentEmail: string, newEmail: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const from = normalizeId(currentEmail);
  const identity = normalizeIdentity(newEmail ?? "");
  if (!identity) return { ok: false as const, error: "Enter an email address or a phone number." };
  const to = identity.value;
  if (to === from) return { ok: true as const, email: from };
  if (await getAccountRecord(to)) {
    return {
      ok: false as const,
      error: identity.kind === "phone" ? "An account already exists for that number." : "An account already exists for that email.",
    };
  }
  const record = await getAccountRecord(from);
  if (!record) return { ok: false as const, error: "Account not found." };
  const data = await getAccountData(from);
  const moved = await writeJson(accountKey(to), {
    ...record,
    email: to,
    identityKind: identity.kind,
    phone: identity.kind === "phone" ? to : record.phone,
  });
  if (!moved) return { ok: false as const, error: "Could not update your sign-in details." };
  await writeJson(dataKey(to), data);
  await deleteKey(accountKey(from));
  await deleteKey(dataKey(from));
  return { ok: true as const, email: to };
}

export async function deleteAccount(email: string) {
  if (!hasAccountStorage()) return { ok: false as const, error: "Connect the private database first." };
  const normalized = normalizeId(email);
  await deleteKey(accountKey(normalized));
  await deleteKey(dataKey(normalized));
  return { ok: true as const };
}

export async function getCurrentAccountData(cookieValue?: string) {
  const email = readSessionEmail(cookieValue);
  if (!email) return null;
  const [record, data] = await Promise.all([getAccountRecord(email), getAccountData(email)]);
  if (!record) return null;
  return { email, record, data };
}

export { accountCookieName };
/* ---- the assistant's conversation --------------------------------------- */

/**
 * Kept beside the account rather than inside its data blob.
 *
 * The account record is read on nearly every request that touches a signed-in
 * traveler; a conversation is read by one panel on demand. Its own key keeps
 * the chat out of that hot path entirely, and means clearing it is one
 * deletion rather than a rewrite of everything else about them.
 */
function assistantKey(email: string) {
  return `white-glove:assistant-chat:${normalizeId(email)}`;
}

export async function getAssistantConversation(email: string): Promise<unknown> {
  if (!hasAccountStorage()) return null;
  return (await readJson<unknown>(assistantKey(email))) ?? null;
}

export async function saveAssistantConversation(email: string, conversation: unknown): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  return writeJson(assistantKey(email), conversation);
}

export async function clearAssistantConversation(email: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const response = await redis(`del/${encodeURIComponent(assistantKey(email))}`);
  return Boolean(response);
}
