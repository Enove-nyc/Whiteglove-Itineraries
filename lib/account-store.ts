import type { AdvisorWelcome } from "@/data/advisor-welcome";
import { recentActivity, withActivity, type ActivityEntry } from "@/data/trip-activity";
import { tripSignature, type PackingList } from "@/data/packing-list";
import { suggestPackingList } from "@/lib/packing-ai";
import { dismissSuggestion, itinerarySignature, type OptimizationResult } from "@/data/itinerary-optimization";
import { emptyTranslation, type TranslatedItinerary } from "@/data/itinerary-translation";
import { suggestItineraryOptimizations } from "@/lib/itinerary-optimization-ai";
import { translateFields, type TranslationField } from "@/lib/itinerary-translation-ai";
import { readTeam, type TeamMember } from "@/data/team";
import { clientsFromTrips, emptyClientProfile, tripsForClient, type ClientProfile, type ClientSummary } from "@/data/clients";
import type { AddonItem } from "@/data/trip-addons";
import type { CommissionRecord } from "@/data/trip-commission";
import { createHmac, pbkdf2Sync, randomBytes } from "crypto";
import { accepting, openStatus, withOpen, withRevoked, type OpenStatus, type ShareOpens } from "@/lib/share-opens";
import { tripTimeZone } from "@/lib/trip-timezone";
import { type AccountPlan, planOf } from "@/lib/account-plans";
import { travelerAttachments, withoutAttachments } from "@/lib/attachments";
import { flightRouteLabel, buildDays, emptyItinerary, type Itinerary } from "@/data/itinerary";
import { proposalOptionToItinerary, type Proposal } from "@/data/proposal";
import type { ManualTripStage } from "@/data/trip-pipeline";
import { formatCents } from "@/data/trip-payments";
import type { PaymentRecord, TripBalance } from "@/data/trip-payments";
import { alertsFromStatusChange, flightRecheckMs, type FlightStatusSnapshot, type TripAlert } from "@/data/trip-alerts";
import { summarizeItineraryChange, type ItineraryChange } from "@/data/trip-changes";
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
import { sendPushToSubscriptions, type PushPayload } from "@/lib/push-notify";

type RedisResult<T> = { result?: T };

export type AccountRecord = {
  /** The owner's roster. Written only by the team functions. */
  team?: TeamMember[];
  /** Set on a staff login; absent means the login is its own business. */
  teamOwnerEmail?: string;
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
  /** The advisor's own note and picture, shown at the top of the client app. */
  advisorWelcome?: AdvisorWelcome;
  /** The client's own link to the extras on this trip. */
  addonsShareId?: string;
  /** What happened on this trip, newest first. */
  activity?: ActivityEntry[];
  /**
   * Which readiness alerts have already gone to the owner's phone, by
   * lib/trip-alerts.ts's stable `key`, with the day each went — so "the clash
   * you already know about" does not arrive again every morning.
   */
  alertsPushed?: Record<string, string>;
  /** The packing list generated for this trip, and what is ticked off. */
  packingList?: PackingList;
  /** The AI's pacing and flow suggestions for this trip, and which are dismissed. */
  optimization?: OptimizationResult;
  /** A read-out of the trip's free text, by language. */
  translations?: Record<string, TranslatedItinerary>;
  /** Advisor's own record of what this trip earned. */
  commissions?: CommissionRecord[];
  /** Extras offered to the client on this trip, and their answers. */
  addons?: AddonItem[];
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
   * Tokens this trip has had and stopped.
   *
   * Kept because a stopped link is not the same as a link that never existed:
   * the advisor still needs to see that the client opened it twice before it
   * was turned off. The token itself opens nothing once its share record is
   * deleted — this is a label to hang the frozen open-history on, not a
   * credential.
   */
  revokedShareIds?: string[];
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
  /** What the advisor has written about each client, keyed by clientKey. */
  clients?: Record<string, ClientProfile>;
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
   * The advisor's OWN devices for push — kept on the account, not a trip, so
   * one opt-in in the advisor app covers every client's trip rather than being
   * re-armed per trip. A client's device stays on their trip (a client has no
   * account); this is the other side of that, the advisor being told when a
   * client writes back. See saveAccountPushSubscription below.
   */
  pushSubscriptions?: PushSubscriptionRecord[];
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

/**
 * A best-effort distributed lease — SET NX PX. Succeeds for exactly one caller
 * across every instance for `ms`, then auto-expires so a crashed holder never
 * wedges it. Used to keep the in-process scheduler (lib/cron-scheduler.ts) from
 * running the same tick on every replica: duplicate client reminders and
 * multiplied paid flight lookups. Returns false when storage is unavailable —
 * the scheduler treats that as "skip", which is the safe side (a missed tick,
 * not a doubled send).
 */
export async function tryAcquireLease(name: string, ms: number): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const key = `white-glove:lease:${name}`;
  const token = randomBytes(8).toString("base64url");
  const res = await redis<string>(`set/${encodeURIComponent(key)}/${token}/NX/PX/${ms}`);
  return res?.result === "OK";
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

/**
 * Has this trip been started at all?
 *
 * WHY IT EXISTS. withTrips() answers "what trips does this account have",
 * and for an account still on the old single-trip shape it answers by
 * SYNTHESIZING one out of data.itinerary — which is right, because that
 * itinerary is a real trip somebody planned. For an account with nothing at
 * all it synthesizes an empty "My trip", which is also right for the planner
 * (you have to open something) and wrong for anything that counts trips: a new
 * advisor would be told they had one active trip before they had made any.
 *
 * The advisor dashboard tried to dodge that by reading data.trips directly and
 * skipping withTrips entirely. That fixed the phantom and broke the real case:
 * an account whose trip is still in the legacy slot has an empty data.trips, so
 * the dashboard showed "Start your first trip" while the planner, the pipeline
 * and every other screen showed the trip. Empty and wrong, on the one screen
 * meant to say how the business is doing.
 *
 * So: take withTrips' answer, and drop what has nothing in it. A trip with a
 * name somebody chose, a client, a date, a stop, a traveller, a proposal or a
 * balance has been started. One with none of those is the placeholder, whether
 * it was synthesized just now or saved empty months ago — and either way there
 * is nothing on it to count.
 */
export function tripIsStarted(trip: SavedTrip): boolean {
  const itinerary = trip.itinerary;
  // The one string that means "nobody has named this". emptyItinerary() puts it
  // on the title and withTrips falls back to it for the name, so a trip
  // carrying it has not been named — it has been left alone.
  const UNTITLED = "My trip";
  const named = trip.name?.trim();
  const titled = itinerary?.title?.trim();
  return Boolean(
    (named && named !== UNTITLED) ||
      (titled && titled !== UNTITLED) ||
      trip.client?.trim() ||
      trip.advisor?.trim() ||
      trip.proposal ||
      trip.balance ||
      trip.shareId ||
      itinerary?.startDate ||
      itinerary?.endDate ||
      itinerary?.flights?.length ||
      itinerary?.lodging?.length ||
      itinerary?.activities?.length ||
      itinerary?.travelers?.length ||
      trip.route?.length,
  );
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
  /**
   * Every link this trip has, live or stopped, with whether it has been
   * opened. One entry per link because an advisor who sent three travellers
   * three separate doors needs to know which of the three walked through.
   */
  links: TripLinkStatus[];
};

/** One share link, and the two dates that say whether it has been used. */
export type TripLinkStatus = {
  shareId: string;
  /** "The trip link" or a traveller's name — what the advisor called it. */
  label: string;
  /** Live links can still record an open; stopped ones are frozen. */
  live: boolean;
  opens: ShareOpens;
  /**
   * The line to show, worked out on the server.
   *
   * Computed here rather than in the browser for two reasons the codebase
   * already settled: a component may not read a clock while it renders, and
   * the day shown has to be the day where the TRIP is — which needs the
   * itinerary's coordinates, and those never leave the server.
   */
  status: OpenStatus;
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
    links: linksOf(t),
  }));
}

/**
 * Every door into one trip, named the way the advisor would name it.
 *
 * The trip-wide link first, then each traveller's own, then the ones that have
 * been stopped. Dates are left empty here — summarize() is synchronous and the
 * open records are separate keys; withLinkOpens() below fills them in for the
 * screens that show status, so the many callers that only want trip names pay
 * nothing for it.
 */
/** What a link shows before withLinkOpens has read its record. */
const BLANK_STATUS: OpenStatus = { text: "Not opened yet", detail: "", state: "unopened" };

function linksOf(t: SavedTrip): TripLinkStatus[] {
  const links: TripLinkStatus[] = [];
  if (t.shareId) links.push({ shareId: t.shareId, label: "The trip link", live: true, opens: {}, status: BLANK_STATUS });
  for (const [travelerId, token] of Object.entries(t.travelerShares ?? {})) {
    if (!token || token === t.shareId) continue;
    const traveler = t.itinerary?.travelers?.find((p) => p.id === travelerId);
    links.push({ shareId: token, label: traveler?.name?.trim() || "A traveller's own link", live: true, opens: {}, status: BLANK_STATUS });
  }
  for (const token of t.revokedShareIds ?? []) {
    if (!token || links.some((l) => l.shareId === token)) continue;
    links.push({ shareId: token, label: "A stopped link", live: false, opens: {}, status: BLANK_STATUS });
  }
  return links;
}

/**
 * Fill in when each link was opened, and the line that says so.
 *
 * One read per link, and only for trips that have one — an account sharing
 * nothing costs nothing. Kept out of summarize() deliberately: getTrips is
 * called by screens that only want names and dates, and none of them should
 * pay for a status they do not draw.
 */
export async function withLinkOpens(email: string, now = new Date().toISOString()): Promise<TripSummary[]> {
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const summaries = summarize(trips, activeId);
  return Promise.all(
    summaries.map(async (summary) => {
      if (summary.links.length === 0) return summary;
      const zone = tripTimeZone(trips.find((t) => t.id === summary.id)?.itinerary);
      const links = await Promise.all(
        summary.links.map(async (link) => {
          const opens = await readShareOpens(link.shareId).catch(() => ({}) as ShareOpens);
          return { ...link, opens, status: openStatus(opens, now, zone) };
        }),
      );
      return { ...summary, links };
    }),
  );
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
  const target = trips.find((t) => t.id === targetId);
  const now = new Date().toISOString();
  const stamped = { ...itinerary, updatedAt: now };

  // A shared trip has someone else watching it — a client on a per-trip code,
  // family on a group link. When the plan they were handed moves, record it on
  // the Changes feed so they see WHAT changed, not just a silently different
  // itinerary the next time they open the app. A trip nobody has been given a
  // link to has no such audience, so its edits are logged for no one.
  const change = target?.shareId ? summarizeItineraryChange(target.itinerary, stamped) : null;

  const next = trips.map((t) => {
    if (t.id !== targetId) return t;
    const withPlan = { ...t, itinerary: stamped, name: stamped.title?.trim() || t.name, updatedAt: now };
    if (change) withPlan.alerts = coalesceItineraryChange(t.alerts ?? [], change, now, tripAlertId);
    return withPlan;
  });
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** How close two edits must be to read as one sitting. Beyond it, a fresh
 *  round of changes earns its own entry — and its own unread mark, which
 *  matters for a client whose read state is kept per alert id in their own
 *  browser rather than in the server's `acknowledged` flag. */
const CHANGE_COALESCE_MS = 30 * 60 * 1000;

/**
 * Fold a fresh plan-change into a trip's alerts. A burst of edits in one
 * sitting should read as one "Trip updated", not a wall of them — so while the
 * newest alert is a still-unseen itinerary_update from within the last
 * half-hour, this refreshes that one in place (newest wording, newest time)
 * rather than adding another. A later round of edits, or one after the
 * traveler has read this, starts a fresh entry. Alerts are stored oldest-first,
 * so the last element is the newest.
 */
function coalesceItineraryChange(
  alerts: TripAlert[],
  change: ItineraryChange,
  now: string,
  idFor: () => string,
): TripAlert[] {
  const last = alerts[alerts.length - 1];
  const recent = last ? Date.parse(now) - Date.parse(last.createdAt) < CHANGE_COALESCE_MS : false;
  if (last && last.kind === "itinerary_update" && !last.acknowledged && recent) {
    // Fold in place so a burst of edits reads as one entry, but with a FRESH
    // id. A client's read state is kept per alert id in their own browser (the
    // owner's `acknowledged` flag never reaches them), so reusing the id would
    // leave a change they made after the client already read the entry looking
    // already-seen. A new id restores the unread signal; the feed still shows
    // one line, since the old entry is dropped.
    return [...alerts.slice(0, -1), { id: idFor(), kind: "itinerary_update", title: change.title, note: change.note, createdAt: now, acknowledged: false }];
  }
  return [
    ...alerts,
    { id: idFor(), kind: "itinerary_update", title: change.title, note: change.note, createdAt: now, acknowledged: false },
  ];
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
  const existing = trips.find((t) => t.id === tripId);
  if (!existing) return false;
  const stamped: Proposal = { ...proposal, id: proposal.id || proposalId(), updatedAt: new Date().toISOString() };
  // Log the one transition the planner initiates — putting a proposal in front
  // of the client. Every other status move (viewed, approved, changes) is the
  // client's and is logged where the client's action is applied; this write is
  // also how those persist, so it must not double-log them.
  const justSent = stamped.status === "sent" && existing.proposal?.status !== "sent";
  const activity = justSent
    ? withActivity(existing.activity ?? [], activityEntry("proposal_sent", "Proposal sent to the client."))
    : existing.activity;
  const next = trips.map((t) =>
    t.id === tripId ? { ...t, proposal: stamped, ...(activity ? { activity } : {}), updatedAt: new Date().toISOString() } : t,
  );
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
  // A settled charge is worth a line in the trip's feed; a declined attempt is
  // not (the ledger keeps it, but it isn't something that happened to the trip).
  const activity =
    record.status === "succeeded"
      ? withActivity(trip.activity ?? [], activityEntry("payment_received", `Payment received: ${formatCents(record.amountCents, record.currency)}.`))
      : trip.activity;
  const next = trips.map((t) =>
    t.id === tripId
      ? { ...t, balance: { ...balance, payments: merged }, ...(activity ? { activity } : {}), updatedAt: new Date().toISOString() }
      : t,
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
  const { trips } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return [];

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + FLIGHT_CHECK_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const candidates = trip.itinerary.flights.filter((f) => f.flightNo?.trim() && f.date && f.date >= today && f.date <= cutoff);
  if (candidates.length === 0) return [];

  // Only the flights actually re-read this run — merged onto the freshest copy
  // at write time, so a stale reading for a flight we did not check cannot
  // overwrite a newer one.
  const checkedStatuses: Record<string, FlightStatusSnapshot> = {};
  const newAlerts: TripAlert[] = [];
  let checkedAny = false;

  for (const flight of candidates) {
    const previous = trip.flightStatus?.[flight.id];
    if (previous && Date.now() - Date.parse(previous.checkedAt) < flightRecheckMs(flight.date, Date.now())) continue;
    const next = await checkFlightStatus(flight.id, flight.flightNo!.trim(), flight.date);
    if (!next) continue;
    checkedAny = true;
    const label = [flight.airline, flight.flightNo].filter(Boolean).join(" ") || `${flight.from} → ${flight.to}`;
    newAlerts.push(...alertsFromStatusChange(label, previous, next, tripAlertId));
    checkedStatuses[flight.id] = next;
  }
  if (!checkedAny) return [];

  // Re-read immediately before writing. The status lookups above are slow
  // network calls; a user edit (or another writer) can land on this account
  // during them, and writeTrips rewrites the whole account. Merging the new
  // statuses and alerts onto the freshest trip — not the stale snapshot read
  // before the network round-trips — keeps a concurrent itinerary edit from
  // being clobbered.
  const fresh = withTrips(await getAccountData(normalized));
  const target = fresh.trips.find((t) => t.id === tripId);
  if (!target) return [];
  const nextTrips = fresh.trips.map((t) =>
    t.id === tripId
      ? {
          ...t,
          flightStatus: { ...(t.flightStatus ?? {}), ...checkedStatuses },
          alerts: [...(t.alerts ?? []), ...newAlerts],
          updatedAt: new Date().toISOString(),
        }
      : t,
  );
  await writeTrips(normalized, nextTrips, fresh.activeId);

  // Told, not just recorded — a device subscribed to this trip (see
  // savePushSubscription) is pushed the moment there is something worth
  // knowing, rather than only finding out the next time the app happens to
  // be opened. Best-effort: nothing here is allowed to fail the check itself.
  if (newAlerts.length && target.pushSubscriptions?.length) {
    await notifySubscribers(normalized, tripId, target.pushSubscriptions, target.shareId, newAlerts).catch((error) =>
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

/** Mark every alert on this trip read at once — what opening the Changes
 *  screen does, rather than dismissing them one by one. No-op, and reported as
 *  success, when they were all already read. */
export async function acknowledgeAllAlerts(email: string, tripId: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  if (!(trip.alerts ?? []).some((a) => !a.acknowledged)) return true;
  const nextTrips = trips.map((t) =>
    t.id === tripId
      ? { ...t, alerts: (t.alerts ?? []).map((a) => (a.acknowledged ? a : { ...a, acknowledged: true })), updatedAt: new Date().toISOString() }
      : t,
  );
  return Boolean(await writeTrips(normalized, nextTrips, activeId));
}

/** Longest a hand-sent advisor alert may be — a line or two, not an essay. */
export const ADVISOR_ALERT_MAX = 280;

/**
 * A note the advisor sends the traveler by hand — "your driver is running
 * twenty minutes late", "the museum opens an hour later than we thought". It
 * lands on the same Changes feed as everything else and, like a flight change,
 * is pushed straight to any device following the trip. Nothing a data feed
 * would ever produce; this is the one alert a person types.
 *
 * Returns the created alert, or null if it could not be stored (no trip, no
 * storage) — the caller reports that rather than pretending it was sent.
 */
export async function sendAdvisorAlert(email: string, tripId: string, text: string): Promise<TripAlert | null> {
  if (!hasAccountStorage()) return null;
  const clean = text.trim().slice(0, ADVISOR_ALERT_MAX);
  if (!clean) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const alert: TripAlert = {
    id: tripAlertId(),
    kind: "advisor_alert",
    title: "From your travel advisor",
    note: clean,
    createdAt: new Date().toISOString(),
    acknowledged: false,
  };
  const nextTrips = trips.map((t) =>
    t.id === tripId ? { ...t, alerts: [...(t.alerts ?? []), alert], updatedAt: new Date().toISOString() } : t,
  );
  if (!(await writeTrips(normalized, nextTrips, activeId))) return null;

  if (trip.pushSubscriptions?.length) {
    await notifySubscribers(normalized, tripId, trip.pushSubscriptions, trip.shareId, [alert]).catch((error) =>
      console.error("[account-store] advisor alert push failed:", error),
    );
  }
  return alert;
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
  const normalized = normalizeId(rec.ownerEmail);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === rec.tripId);
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

  // Log the two client actions that move a proposal to a decision — approving
  // it, or asking for changes. A bare select or comment is not a decision and
  // is not logged. Written into the trip's own feed in the same write that
  // persists the proposal, rather than through saveProposal, so the entry and
  // the new status land together.
  const logKind: ActivityEntry["kind"] | null =
    action.kind === "approve" ? "proposal_approved" : action.kind === "request_changes" ? "proposal_changes_requested" : null;
  const stamped: Proposal = { ...next, id: next.id || proposalId(), updatedAt: now };
  const activity = logKind
    ? withActivity(
        trip.activity ?? [],
        activityEntry(logKind, logKind === "proposal_approved" ? "Client approved the proposal." : "Client asked for changes to the proposal."),
      )
    : undefined;
  const updated = trips.map((t) =>
    t.id === rec.tripId ? { ...t, proposal: stamped, ...(activity ? { activity } : {}), updatedAt: now } : t,
  );
  const ok = await writeTrips(normalized, updated, activeId);
  return ok ? stamped : null;
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
  if (ownerEmail) {
    // A code somebody made for their own phone has no second person on it, so
    // it resolves to no thread at all. THIS is the block: every messaging
    // route goes through here, so refusing once closes the chat route, the
    // report route and anything added later, rather than each of them
    // remembering to ask. The app is told the same thing by being handed no
    // chat at all — see app/i/[shareId]/app/page.tsx.
    if ((await getShareKind(shareId)) === "self") return null;
    return { ownerEmail, chatKey: shareId };
  }
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

/* ---- the advisor's OWN devices (account-level push) -----------------------
 *
 * The advisor opts in once, in their app, and is then told when a client writes
 * back on ANY of their trips. So the subscription lives on the account, not a
 * trip — one list of the advisor's devices, read whenever a client message
 * needs to reach them.
 */

/** The advisor's subscribed devices. */
export async function readAccountPushSubscriptions(email: string): Promise<PushSubscriptionRecord[]> {
  const data = await getAccountData(normalizeId(email));
  return data.pushSubscriptions ?? [];
}

/** Add (or refresh) one of the advisor's own devices. */
export async function saveAccountPushSubscription(email: string, subscription: PushSubscriptionRecord): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const existing = (current.pushSubscriptions ?? []).filter((s) => s.endpoint !== subscription.endpoint);
  const next: AccountData = {
    ...current,
    pushSubscriptions: [...existing, subscription].slice(-MAX_PUSH_SUBSCRIPTIONS),
    updatedAt: new Date().toISOString(),
  };
  return Boolean(await writeJson(dataKey(normalized), next));
}

/** Turn the advisor's notifications off on one device. */
export async function removeAccountPushSubscription(email: string, endpoint: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  if (!current.pushSubscriptions?.length) return true;
  const next: AccountData = {
    ...current,
    pushSubscriptions: current.pushSubscriptions.filter((s) => s.endpoint !== endpoint),
    updatedAt: new Date().toISOString(),
  };
  return Boolean(await writeJson(dataKey(normalized), next));
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
  const activity = withActivity(trip.activity ?? [], activityEntry("form_submitted", `${name} filled out the pre-trip form.`));
  const next = trips.map((t) =>
    t.id === rec.tripId ? { ...t, formResponses: nextResponses, activity, updatedAt: new Date().toISOString() } : t,
  );
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** The planner's own read of what's come back — never reachable any other way. */
export async function getFormResponses(email: string, tripId: string): Promise<ClientFormResponse[]> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.formResponses ?? [];
}

/**
 * One trip's own history — proposal, form, payment and add-on events in the
 * order they should be read (most recent first). Resolves the trip the same
 * way every per-trip screen does: the one named in `?trip=` when the advisor
 * opened it from a specific trip, otherwise whichever is open on the account.
 * The advisor's own read; a client never reaches this.
 */
export async function getTripActivity(
  email: string,
  wanted?: string,
): Promise<{ tripId: string; tripName: string; activity: ActivityEntry[] } | null> {
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === (wanted || activeId)) ?? trips[0];
  if (!trip) return null;
  return {
    tripId: trip.id,
    tripName: trip.client?.trim() || trip.name || trip.itinerary.title || "This trip",
    activity: recentActivity(trip.activity ?? []),
  };
}

// ---- Itinerary sharing ------------------------------------------------

function shareOpensKey(shareId: string) {
  return `white-glove:share-opens:${shareId}`;
}

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

/**
 * WHETHER THE TRAVELLER HAS OPENED THIS LINK, kept apart from the link itself.
 *
 * Its own key rather than a field on the share record, for one reason that
 * decides the design: stopTripShare DELETES the share record, and the advisor
 * still needs to see that the client opened it twice before it was stopped. A
 * field would go with the link; this outlives it, and is where `revokedAt` is
 * written so a stopped link refuses later opens rather than merely failing to
 * receive them.
 *
 * Two timestamps. Nothing else is stored — see lib/share-opens.ts for what
 * that promise is and why it is not negotiable.
 */
export async function readShareOpens(shareId: string): Promise<ShareOpens> {
  if (!shareId) return {};
  return (await readJson<ShareOpens>(shareOpensKey(shareId))) ?? {};
}

/**
 * Record that somebody who is not the owner opened this link.
 *
 * BEST EFFORT, ALWAYS. A traveller opening their itinerary on a train must
 * never see an error because a status write failed, so every caller ignores
 * the result and this never throws. Returns false when nothing was written —
 * the link is stopped, or the store is not configured.
 */
export async function recordShareOpen(shareId: string, at = new Date().toISOString()): Promise<boolean> {
  if (!shareId || !hasAccountStorage()) return false;
  const current = await readShareOpens(shareId);
  if (!accepting(current)) return false;
  const next = withOpen(current, at);
  if (next.firstOpenedAt === current.firstOpenedAt && next.lastOpenedAt === current.lastOpenedAt) return false;
  return writeJson(shareOpensKey(shareId), next);
}

/** Freeze the record when a link is stopped. Keeps the history, takes no more. */
export async function markShareRevoked(shareId: string, at = new Date().toISOString()): Promise<void> {
  if (!shareId || !hasAccountStorage()) return;
  const current = await readShareOpens(shareId);
  if (current.revokedAt) return;
  await writeJson(shareOpensKey(shareId), withRevoked(current, at));
}

/**
 * WHO IS ON THE OTHER END OF A CODE.
 *
 * "client" — the code an adviser sends to the person taking the trip. Two
 * people, so there is a conversation, and the app shows Messages.
 *
 * "self" — the code somebody makes for their own trip, on their own phone.
 * One person. There is nobody to message, so the app shows no Messages tab
 * and resolveCompanionShare refuses the token outright, which closes the chat
 * and report routes to it server-side rather than hiding a tab.
 *
 * This is a fact about the CODE, not about the plan behind it. An Advisor Pro
 * carrying her own family's trip gets the same silence as a Trip Pass holder,
 * because in both cases the thread would be addressed to the reader.
 */
export type ShareKind = "client" | "self";

function isShareKind(value: unknown): value is ShareKind {
  return value === "client" || value === "self";
}

export async function getShareOwnerEmail(shareId: string): Promise<string | null> {
  const rec = await readJson<{ ownerEmail: string }>(shareKey(shareId));
  return rec?.ownerEmail ?? null;
}

/**
 * What kind of code this is. A record written before kinds existed has none,
 * and reads as "client" — every code that exists today was made by an adviser
 * to send to somebody, so the default has to keep their threads open.
 */
export async function getShareKind(shareId: string): Promise<ShareKind | null> {
  const rec = await readJson<{ ownerEmail?: unknown; kind?: unknown }>(shareKey(shareId));
  if (!rec?.ownerEmail) return null;
  return isShareKind(rec.kind) ? rec.kind : "client";
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
  // Boarding passes and tickets leave the account only where the adviser has
  // said so, file by file (see lib/attachments.ts). Anything not shared is
  // gone from what the client is handed rather than present and refused: a
  // reference left behind would tell them a document exists and is being
  // withheld, which is a worse answer than silence.
  return {
    itinerary: travelerAttachments(itinerary),
    ownerName: record?.name,
    ownerEmail,
    client,
    advisor,
    tripId: trip?.id,
  };
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
export async function ensureTripShare(email: string, tripId: string, kind: ShareKind = "client"): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  if (trip.shareId) {
    // Self-healing rewrite. The kind is NOT overwritten from the argument
    // here: a code already sent to a client stays a client code even if this
    // is later called for the owner's own phone, because downgrading it would
    // silently close a conversation that is already running.
    const existing = await readJson<{ kind?: unknown }>(shareKey(trip.shareId));
    await writeJson(shareKey(trip.shareId), {
      ownerEmail: normalized,
      kind: isShareKind(existing?.kind) ? existing.kind : "client",
      createdAt: new Date().toISOString(),
    });
    return trip.shareId;
  }
  const token = shareToken();
  const wrote = await writeJson(shareKey(token), { ownerEmail: normalized, kind, createdAt: new Date().toISOString() });
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
  // Marked revoked BEFORE the link is deleted: after the delete there is no
  // token left to look up, and the open history has to survive the link it
  // belongs to (see readShareOpens).
  if (trip.shareId) {
    await markShareRevoked(trip.shareId);
    await deleteKey(shareKey(trip.shareId));
  }
  // A traveller's own door is stopped with the trip-wide one — each is a
  // separate link with its own status, so each gets its own tombstone.
  for (const token of Object.values(trip.travelerShares ?? {})) {
    if (token) await markShareRevoked(token);
  }
  for (const collaborator of readCollaborators(trip.collaborators)) {
    await removeFromSharedWith(collaborator.person, normalized);
  }
  // Push subscriptions go with it too — a device that opted in while the
  // link was live has no business still getting trip-change notifications
  // once the advisor has revoked that link. Left in place, notifySubscribers
  // (called whenever a flight-status check finds something new) would keep
  // sending to it regardless: it reads pushSubscriptions off the trip, not
  // the share token, and never itself checks whether shareId is still set.
  // The stopped tokens are remembered so the advisor can still see what
  // happened on them. Capped: this is a short history, not a log.
  const stopped = [trip.shareId, ...Object.values(trip.travelerShares ?? {})].filter(Boolean) as string[];
  const remembered = [...stopped, ...(trip.revokedShareIds ?? [])].filter((v, i, all) => all.indexOf(v) === i).slice(0, 10);
  const next = trips.map((t) =>
    t.id === tripId
      ? {
          ...t,
          shareId: undefined,
          travelerShares: {},
          revokedShareIds: remembered,
          collaborators: [],
          pushSubscriptions: [],
          updatedAt: new Date().toISOString(),
        }
      : t,
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


function commissionId() {
  return randomBytes(6).toString("base64url");
}

function addonId() {
  return randomBytes(6).toString("base64url");
}

function addonsShareKey(shareId: string) {
  return `white-glove:addons-share:${shareId}`;
}

function activityEntry(kind: ActivityEntry["kind"], message: string): ActivityEntry {
  return { id: activityId(), kind, message, at: new Date().toISOString() };
}

function activityId() {
  return randomBytes(6).toString("base64url");
}

/* ─────────────────────────────────────────────────────────────────────────
 * THE ADVISOR'S OWN STORE, MOVED HERE FROM THE KOSHER REPOSITORY.
 *
 * Clients, commissions, add-ons and the advisor's welcome note. Every one of
 * these has the same user — somebody planning a trip for other people — which
 * is this product, not that one. They were written on the kosher side because
 * that is where the work happened to start, and were never moved; AGENTS.md
 * has said all along that an adviser feature "has to be built or ported in the
 * itineraries repository", and nothing enforced it.
 *
 * Lifted rather than rewritten: same names, same shapes, same keys, so a trip
 * saved by either deployment is read the same way by both. The two files have
 * drifted about eight hundred lines apart and this closes the advisor-shaped
 * part of that gap; the rest (packing, translation, push) is not advisor work
 * and is left where it is.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Whose business a signed-in login actually works against — the one seam
 * everything about running the business (trips, the pipeline, the library,
 * payments, proposals, the client inbox) should read instead of the signed-in
 * identity directly. An identity with no teamOwnerEmail is its own business,
 * same as every account before staff logins existed.
 *
 * THE OWNER'S ROSTER IS THE AUTHORITY, NOT THE MEMBER'S OWN FIELD. An earlier
 * version of this trusted teamOwnerEmail alone, on the reasoning that
 * removeTeamMember clears it in the same write that drops the roster row.
 * That reasoning was wrong: accept and remove each issue TWO independent
 * writes, so a half-failure (or a raced accept of one token by two logins)
 * can leave a login carrying teamOwnerEmail that the owner's roster does not
 * list — a staff grant over trips, payments, clients and commissions that the
 * team screen cannot revoke, because removeTeamMember refuses somebody who is
 * not on the roster.
 *
 * So the field is only a POINTER, and the owner's own roster is what decides.
 * Fails closed: a login the owner does not actively list resolves to itself,
 * which is exactly the access it had before it ever joined.
 */
export async function resolveBusinessOwner(email: string): Promise<string> {
  const normalized = normalizeId(email);
  const record = await getAccountRecord(normalized);
  if (!record?.teamOwnerEmail) return normalized;
  const owner = normalizeId(record.teamOwnerEmail);
  if (owner === normalized) return normalized;
  const ownerRecord = await getAccountRecord(owner);
  const listedActive = readTeam(ownerRecord?.team).some((m) => m.email === normalized && m.status === "active");
  return listedActive ? owner : normalized;
}

/**
 * Whether this login is its own business rather than staff on somebody
 * else's — the check for the few things only an owner may do (managing the
 * team, and setting up where the money lands; see the Stripe Connect note in
 * app/api/account/payments/route.ts). Reads the same authority
 * resolveBusinessOwner does, so a login the owner no longer lists is its own
 * business again and passes this, which is correct: it is answering for
 * itself, not for anybody else.
 */
export async function isOwnBusiness(email: string): Promise<boolean> {
  return (await resolveBusinessOwner(email)) === normalizeId(email);
}

/** Every distinct client on this account's trips, most recent activity
 *  first. */
export async function listClients(email: string, today: string): Promise<ClientSummary[]> {
  const data = await getAccountData(email);
  const { trips } = withTrips(data);
  return clientsFromTrips(
    trips.map((t) => ({ id: t.id, client: t.client, startDate: t.itinerary?.startDate, endDate: t.itinerary?.endDate, updatedAt: t.updatedAt })),
    today,
  );
}

/** One client's own trips, most recently updated first — the same summary
 *  shape the trip list itself uses. */
export async function getClientTrips(email: string, key: string): Promise<TripSummary[]> {
  const data = await getAccountData(email);
  const { trips, activeId } = withTrips(data);
  return summarize(tripsForClient(trips, key), activeId);
}

/** A client's own notes and preferences, or an empty one if nothing has
 *  been written yet — a screen should always have something to show. */
export async function getClientProfile(email: string, key: string): Promise<ClientProfile> {
  const data = await getAccountData(email);
  return data.clients?.[key] ?? emptyClientProfile(key);
}

/** Save a client's notes/preferences. `key` is trusted from the caller — see
 *  data/clients.ts's clientKey(), which the route computes from the name on
 *  the URL, never anything the client-side request could substitute a
 *  different key for while keeping the visible name the same. */
export async function saveClientProfile(email: string, key: string, patch: { notes?: string; preferences?: string }): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const current = await getAccountData(normalized);
  const now = new Date().toISOString();
  const existing = current.clients?.[key] ?? emptyClientProfile(key);
  const stamped: ClientProfile = { ...existing, ...patch, key, updatedAt: now };
  const next: AccountData = { ...current, clients: { ...current.clients, [key]: stamped }, updatedAt: now };
  return writeJson(dataKey(normalized), next);
}

/** One trip's commission ledger — every supplier booking logged so far. */
export async function getCommissions(email: string, tripId: string): Promise<CommissionRecord[]> {
  const data = await getAccountData(email);
  return withTrips(data).trips.find((t) => t.id === tripId)?.commissions ?? [];
}

/** Add or update one supplier booking's commission record. */
export async function saveCommissionRecord(email: string, tripId: string, record: CommissionRecord): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const now = new Date().toISOString();
  const existing = trip.commissions ?? [];
  const stamped: CommissionRecord = { ...record, id: record.id || commissionId(), createdAt: record.createdAt || now, updatedAt: now };
  const nextRecords = existing.some((r) => r.id === stamped.id)
    ? existing.map((r) => (r.id === stamped.id ? stamped : r))
    : [...existing, stamped];
  const next = trips.map((t) => (t.id === tripId ? { ...t, commissions: nextRecords, updatedAt: now } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** Remove one supplier booking's commission record. */
export async function deleteCommissionRecord(email: string, tripId: string, id: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const nextRecords = (trip.commissions ?? []).filter((r) => r.id !== id);
  const next = trips.map((t) => (t.id === tripId ? { ...t, commissions: nextRecords, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/**
 * Every trip that has at least one commission record — the agency-wide
 * rollup. One row per trip, not per booking: a trip with three supplier
 * bookings is one line here, the same way the pipeline is one line per
 * trip regardless of how many stops are on it.
 */
export async function listCommissionSummaries(email: string): Promise<
  Array<{ tripId: string; tripName: string; client: string; records: CommissionRecord[] }>
> {
  const data = await getAccountData(email);
  const { trips } = withTrips(data);
  return trips
    .filter((t) => (t.commissions?.length ?? 0) > 0)
    .map((t) => ({ tripId: t.id, tripName: t.name, client: t.client?.trim() ?? "", records: t.commissions ?? [] }));
}

/** Every add-on offered on this trip. */
export async function getAddons(email: string, tripId: string): Promise<AddonItem[]> {
  const data = await getAccountData(email);
  return withTrips(data).trips.find((t) => t.id === tripId)?.addons ?? [];
}

/** Add or update one add-on. */
export async function saveAddonItem(email: string, tripId: string, item: AddonItem): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const now = new Date().toISOString();
  const existing = trip.addons ?? [];
  const stamped: AddonItem = { ...item, id: item.id || addonId(), createdAt: item.createdAt || now, updatedAt: now };
  const nextItems = existing.some((i) => i.id === stamped.id)
    ? existing.map((i) => (i.id === stamped.id ? stamped : i))
    : [...existing, stamped];
  const next = trips.map((t) => (t.id === tripId ? { ...t, addons: nextItems, updatedAt: now } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** Remove one add-on. */
export async function deleteAddonItem(email: string, tripId: string, id: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const nextItems = (trip.addons ?? []).filter((i) => i.id !== id);
  const next = trips.map((t) => (t.id === tripId ? { ...t, addons: nextItems, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** The add-ons list's public link — created once, reused after. */
export async function ensureAddonsShare(email: string, tripId: string): Promise<string | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  if (trip.addonsShareId) {
    await writeJson(addonsShareKey(trip.addonsShareId), { ownerEmail: normalized, tripId, createdAt: new Date().toISOString() });
    return trip.addonsShareId;
  }
  const token = shareToken();
  const wrote = await writeJson(addonsShareKey(token), { ownerEmail: normalized, tripId, createdAt: new Date().toISOString() });
  if (!wrote) return null;
  const next = trips.map((t) => (t.id === tripId ? { ...t, addonsShareId: token, updatedAt: new Date().toISOString() } : t));
  const saved = await writeTrips(normalized, next, activeId);
  return saved ? token : null;
}

/** An add-ons list by its public token. */
export async function getSharedAddons(shareId: string) {
  const rec = await readJson<{ ownerEmail: string; tripId: string }>(addonsShareKey(shareId));
  if (!rec) return null;
  const data = await getAccountData(rec.ownerEmail);
  const trip = withTrips(data).trips.find((t) => t.id === rec.tripId);
  if (!trip) return null;
  const record = await getAccountRecord(rec.ownerEmail);
  return { items: trip.addons ?? [], tripName: trip.client || trip.name, ownerName: record?.name, advisor: trip.advisor };
}

/**
 * What a client may do with an add-on from its public link — accept or
 * decline one, never more. Answering one that isn't on the list, or one
 * already answered, is refused rather than silently overwritten.
 */
export async function applyAddonClientAction(
  shareId: string,
  itemId: string,
  accepted: boolean,
): Promise<{ items: AddonItem[]; ownerEmail: string; tripName: string; addon: AddonItem } | null> {
  const rec = await readJson<{ ownerEmail: string; tripId: string }>(addonsShareKey(shareId));
  if (!rec) return null;
  const normalized = normalizeId(rec.ownerEmail);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === rec.tripId);
  if (!trip) return null;
  const existing = trip.addons ?? [];
  const found = existing.find((i) => i.id === itemId);
  if (!found || found.status !== "offered") return null;
  const now = new Date().toISOString();
  const answered: AddonItem = { ...found, status: accepted ? "accepted" : "declined", respondedAt: now, updatedAt: now };
  const items = existing.map((i) => (i.id === itemId ? answered : i));
  const activity = withActivity(
    trip.activity ?? [],
    activityEntry(accepted ? "addon_accepted" : "addon_declined", `${accepted ? "Accepted" : "Declined"} the add-on: ${answered.name}.`),
  );
  const next = trips.map((t) => (t.id === rec.tripId ? { ...t, addons: items, activity, updatedAt: now } : t));
  const ok = await writeTrips(normalized, next, activeId);
  return ok ? { items, ownerEmail: rec.ownerEmail, tripName: trip.client || trip.name, addon: answered } : null;
}

/** The trip's welcome video, or null if none uploaded yet. */
export async function getAdvisorWelcome(email: string, tripId: string): Promise<AdvisorWelcome | null> {
  const data = await getAccountData(email);
  return withTrips(data).trips.find((t) => t.id === tripId)?.advisorWelcome ?? null;
}

/** Save (or replace) the trip's welcome video. */
export async function saveAdvisorWelcome(email: string, tripId: string, welcome: AdvisorWelcome): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === tripId)) return false;
  const next = trips.map((t) => (t.id === tripId ? { ...t, advisorWelcome: welcome, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** Remove the trip's welcome video. */
export async function removeAdvisorWelcome(email: string, tripId: string): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  if (!trips.some((t) => t.id === tripId)) return false;
  const next = trips.map((t) => (t.id === tripId ? { ...t, advisorWelcome: undefined, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

// ---- Packing list ------------------------------------------------------

function packingItemId() {
  return randomBytes(6).toString("base64url");
}

/** A short summary of what the trip actually is, for the AI prompt and for
 *  tripSignature() — destinations from where flights land and where the
 *  traveler sleeps, since neither alone is always present. */
function packingSummary(itinerary: Itinerary) {
  const destinations = Array.from(
    new Set([...itinerary.flights.map((f) => f.to).filter(Boolean), ...itinerary.lodging.map((l) => l.name).filter(Boolean)]),
  );
  const stops = [...itinerary.lodging.map((l) => l.name), ...itinerary.activities.map((a) => a.name)].filter(Boolean);
  return { destinations, startDate: itinerary.startDate, endDate: itinerary.endDate, stops, activityCount: itinerary.activities.length };
}

/** The trip's current packing list, or null if none has been generated yet. */
/** The trip's current packing list, or null if none has been generated yet. */
export async function getPackingList(email: string, tripId: string): Promise<PackingList | null> {
  const data = await getAccountData(email);
  return withTrips(data).trips.find((t) => t.id === tripId)?.packingList ?? null;
}

/**
 * Ask the AI for a fresh packing list and save it, replacing whatever was
 * there before. Returns null when no provider is configured or every
 * provider failed — the caller says so rather than saving an empty list
 * over a real one.
 */
export async function generatePackingList(email: string, tripId: string): Promise<PackingList | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  const summary = packingSummary(trip.itinerary);
  const suggestions = await suggestPackingList(summary);
  if (suggestions === null) return null;
  const list: PackingList = {
    items: suggestions.map((s) => ({ id: packingItemId(), label: s.label, category: s.category, checked: false })),
    generatedAt: new Date().toISOString(),
    forSignature: tripSignature(summary),
  };
  const next = trips.map((t) => (t.id === tripId ? { ...t, packingList: list, updatedAt: new Date().toISOString() } : t));
  const ok = await writeTrips(normalized, next, activeId);
  return ok ? list : null;
}

/** Check or uncheck one item — never regenerates the list. */
export async function togglePackingItem(email: string, tripId: string, itemId: string, checked: boolean): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip?.packingList) return false;
  const list: PackingList = { ...trip.packingList, items: trip.packingList.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) };
  const next = trips.map((t) => (t.id === tripId ? { ...t, packingList: list, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}

/** The trip's current signature, for the caller to check staleness against
 *  a saved list's forSignature without duplicating packingSummary's logic. */
export function currentPackingSignature(itinerary: Itinerary): string {
  return tripSignature(packingSummary(itinerary));
}


function optimizationId() {
  return randomBytes(6).toString("base64url");
}

// ---- Ported from White Glove Kosher Travel -------------------------------
//
// These belong here: reading a trip's day-by-day back, pacing it, translating
// it and listing what has happened on it are all BUILD, ORGANISE AND MANAGE
// work — this product's job. They were written on the kosher deployment first,
// which was the mistake AGENTS.md now has a rule about.

/** One trip's activity feed, most recent first. */
export async function getActivity(email: string, tripId: string): Promise<ActivityEntry[]> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return [...(trip?.activity ?? [])].reverse();
}

/**
 * The day-by-day plain-text summary handed to the AI — every day's date,
 * what's scheduled, how much free time and travel time it has, and
 * buildDays()'s own warnings. Built from the same computation the planner's
 * own itinerary builder already draws its day view from, not a second
 * reading of the raw flights/lodging/activities.
 */
function optimizationSummary(itinerary: Itinerary): string {
  const days = buildDays(itinerary);
  return days
    .map((day) => {
      const lines = [`Day ${day.index + 1} (${day.date}):`];
      for (const j of day.flightsDeparting) lines.push(`  Flight departs: ${flightRouteLabel(j)}`);
      for (const j of day.flightsArriving) lines.push(`  Flight arrives: ${flightRouteLabel(j)}`);
      if (day.lodging) lines.push(`  Sleeping at: ${day.lodging.name}`);
      for (const a of day.activities) lines.push(`  Stop: ${a.name}${a.startTime ? ` at ${a.startTime}` : ""}`);
      lines.push(`  Free hours: ${day.freeHours ?? "?"}, travel hours: ${day.travelHours.toFixed(1)}`);
      if (day.warnings.length > 0) lines.push(`  Known conflicts: ${day.warnings.join("; ")}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** The trip's current pacing/flow suggestions, or null if none generated yet. */
export async function getOptimization(email: string, tripId: string): Promise<OptimizationResult | null> {
  const data = await getAccountData(email);
  return withTrips(data).trips.find((t) => t.id === tripId)?.optimization ?? null;
}

/**
 * The itinerary's current signature, for the caller to check a saved
 * result's staleness against without duplicating optimizationSummary's
 * reasoning about what the itinerary "is".
 */
export function currentOptimizationSignature(itinerary: Itinerary): string {
  return itinerarySignature(itinerary);
}

/**
 * Ask the AI for fresh pacing suggestions and save them, replacing whatever
 * was there before. Returns null when no provider is configured or every
 * provider failed — an itinerary the model genuinely found nothing to flag
 * on still saves (as an empty list), which is a real result, not a failure.
 */
export async function generateOptimization(email: string, tripId: string): Promise<OptimizationResult | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;
  const messages = await suggestItineraryOptimizations(optimizationSummary(trip.itinerary));
  if (messages === null) return null;
  const result: OptimizationResult = {
    suggestions: messages.map((message) => ({ id: optimizationId(), message, dismissed: false })),
    generatedAt: new Date().toISOString(),
    forSignature: itinerarySignature(trip.itinerary),
  };
  const next = trips.map((t) => (t.id === tripId ? { ...t, optimization: result, updatedAt: new Date().toISOString() } : t));
  const ok = await writeTrips(normalized, next, activeId);
  return ok ? result : null;
}

/** Dismiss (or restore) one suggestion — never regenerates the list. */
export async function setOptimizationDismissed(email: string, tripId: string, suggestionId: string, dismissed: boolean): Promise<boolean> {
  if (!hasAccountStorage()) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip?.optimization) return false;
  const result = dismissSuggestion(trip.optimization, suggestionId, dismissed);
  const next = trips.map((t) => (t.id === tripId ? { ...t, optimization: result, updatedAt: new Date().toISOString() } : t));
  return Boolean(await writeTrips(normalized, next, activeId));
}


// ---- Itinerary translation ----------------------------------------------
//
// A read-out of an itinerary's free text in another language — see
// data/itinerary-translation.ts for exactly what is and is not translated.

/** Every translatable field on the itinerary, with its own id — the
 *  payload lib/itinerary-translation-ai.ts translates and hands back
 *  matched by id. */
function translatableFields(itinerary: Itinerary): TranslationField[] {
  const fields: TranslationField[] = [];
  if (itinerary.title?.trim()) fields.push({ id: "title", text: itinerary.title.trim() });
  for (const a of itinerary.activities) {
    if (a.name?.trim()) fields.push({ id: `activity:${a.id}:name`, text: a.name.trim() });
    if (a.notes?.trim()) fields.push({ id: `activity:${a.id}:notes`, text: a.notes.trim() });
  }
  for (const l of itinerary.lodging) {
    if (l.notes?.trim()) fields.push({ id: `lodging:${l.id}:notes`, text: l.notes.trim() });
  }
  for (const f of itinerary.flights) {
    if (f.notes?.trim()) fields.push({ id: `flight:${f.id}:notes`, text: f.notes.trim() });
  }
  return fields;
}

/** The trip's saved translation for one language, or null if none yet. */
export async function getTranslation(email: string, tripId: string, language: string): Promise<TranslatedItinerary | null> {
  const data = await getAccountData(email);
  const trip = withTrips(data).trips.find((t) => t.id === tripId);
  return trip?.translations?.[language] ?? null;
}

/**
 * Translate the itinerary's free text into a language and save it,
 * replacing whatever was saved for that language before. Returns null when
 * no provider is configured or every provider failed.
 */
export async function generateTranslation(email: string, tripId: string, language: string): Promise<TranslatedItinerary | null> {
  if (!hasAccountStorage()) return null;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const fields = translatableFields(trip.itinerary);
  const translated = await translateFields(language, fields);
  if (translated === null) return null;

  const result: TranslatedItinerary = { ...emptyTranslation(language), generatedAt: new Date().toISOString(), forSignature: itinerarySignature(trip.itinerary) };
  result.title = translated.get("title");
  for (const a of trip.itinerary.activities) {
    const name = translated.get(`activity:${a.id}:name`);
    const notes = translated.get(`activity:${a.id}:notes`);
    if (name || notes) result.activities[a.id] = { name, notes };
  }
  for (const l of trip.itinerary.lodging) {
    const notes = translated.get(`lodging:${l.id}:notes`);
    if (notes) result.lodging[l.id] = { notes };
  }
  for (const f of trip.itinerary.flights) {
    const notes = translated.get(`flight:${f.id}:notes`);
    if (notes) result.flights[f.id] = { notes };
  }

  const nextTranslations = { ...(trip.translations ?? {}), [language]: result };
  const next = trips.map((t) => (t.id === tripId ? { ...t, translations: nextTranslations, updatedAt: new Date().toISOString() } : t));
  const ok = await writeTrips(normalized, next, activeId);
  return ok ? result : null;
}

// ---- Readiness alerts on a phone ---------------------------------------

/**
 * Push to the account owner's own devices, and forget the endpoints the push
 * service says are gone.
 *
 * The same best-effort contract as pushToTripSubscribers: the caller has
 * already recorded whatever this announces, this never throws into it, and
 * its result never decides any bookkeeping.
 */
export async function pushToAccountSubscribers(email: string, payload: PushPayload): Promise<number> {
  try {
    const normalized = normalizeId(email);
    const data = await getAccountData(normalized);
    if (!data.pushSubscriptions?.length) return 0;

    const { sent, expired } = await sendPushToSubscriptions(data.pushSubscriptions, payload);
    if (!expired.length) return sent;

    const fresh = await getAccountData(normalized);
    if (!fresh.pushSubscriptions?.length) return sent;
    const next: AccountData = {
      ...fresh,
      pushSubscriptions: fresh.pushSubscriptions.filter((s) => !expired.includes(s.endpoint)),
      updatedAt: new Date().toISOString(),
    };
    await writeJson(dataKey(normalized), next);
    return sent;
  } catch (error) {
    console.error("[account-store] account push failed:", error);
    return 0;
  }
}

/**
 * Remember that these readiness alerts have gone to the owner's phone.
 *
 * Keys come from lib/trip-alerts.ts and are deliberately stable across days,
 * so "the Shabbos clash you already know about" does not arrive again every
 * morning. Recorded per trip rather than per account: two trips can hold the
 * same key ("leaving-soon") and mean different things.
 */
export async function markAlertsPushed(email: string, tripId: string, keys: readonly string[], day: string): Promise<boolean> {
  if (!hasAccountStorage() || !keys.length) return false;
  const normalized = normalizeId(email);
  const data = await getAccountData(normalized);
  const { trips, activeId } = withTrips(data);
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return false;
  const pushed = { ...(trip.alertsPushed ?? {}) };
  for (const key of keys) pushed[key] = day;
  const nextTrips = trips.map((t) => (t.id === tripId ? { ...t, alertsPushed: pushed } : t));
  return Boolean(await writeTrips(normalized, nextTrips, activeId));
}
