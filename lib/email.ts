import { recordEmailAttempt, emailLogAvailable, readEmailLog } from "@/lib/email-log";
import type { BlastBlock } from "@/lib/email-blast";
import { renderBlastHtml, renderBlastText } from "@/lib/email-template";
import { BRAND_DOMAIN, BRAND_NAME, type SiteBrand } from "@/lib/site-brand-core";

const RESEND_API_URL = "https://api.resend.com/emails";

// Resend's shared sandbox sender. It can ONLY deliver to the email address that
// owns the Resend account — anything else is rejected. A real domain sender
// (e.g. no-reply@whiteglovekoshertravel.com, once the domain is verified in
// Resend) is required for mail to reach the edits@/contact@ inboxes.
//
// Named "White Glove", not either brand's full name: this is the fallback for
// EVERY email this file sends, from both brands, whenever RESEND_FROM_EMAIL is
// unset — so it cannot say "Kosher Travel" without telling an itineraries
// visitor's inbox which other site this one is.
import { currentBrand } from "@/lib/site-brand";

const TEST_SENDER = "White Glove <onboarding@resend.dev>";

/**
 * WHO THE MAIL COMES FROM, PER BRAND.
 *
 * One RESEND_FROM_EMAIL served both sites, so every email this one sent — a
 * sign-in code, a trip note, a reminder to somebody else's client — arrived
 * from an address at whiteglovekoshertravel.com. The recipient never asked
 * about kosher travel, may never have heard of it, and is being told there is
 * another business behind the one they signed up to. It also fails the
 * plainest test a brand can fail: the name on the envelope is not the name on
 * the door.
 *
 * NAMED ONE BY ONE, never process.env[someVariable]. Next substitutes these by
 * literal name at build time, so an indexed read is not the same thing.
 *
 * Falls back to the shared address when no itineraries sender is configured —
 * a deployment that has not verified a second domain in Resend keeps working
 * exactly as it did, because silence would be a worse regression than the
 * wrong name.
 */
export function senderForBrand(brand: SiteBrand): string {
  const shared = process.env.RESEND_FROM_EMAIL?.trim();
  const own = brand === "itineraries" ? process.env.RESEND_FROM_EMAIL_ITINERARIES?.trim() : shared;
  return own || shared || TEST_SENDER;
}

function resendConfig(from?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? { apiKey, from: from || process.env.RESEND_FROM_EMAIL?.trim() || TEST_SENDER } : null;
}

// Where notifications are delivered.
//
// Two inboxes, because they are two different jobs. Somebody writing in about a
// trip needs an answer; somebody correcting a shomer's number or sending in a
// kever is a queue of work to check against a source. Mixing them buries the
// corrections under the enquiries.
//
//   edit suggestions, submitted entries, business listings → edits@
//   contact-form messages                                  → contact@, per brand
//
// EDITS ARE ONE INBOX FOR THE WHOLE DEPLOYMENT — correcting a kever or a
// hechsher is a Kosher Travel content job regardless of which domain the
// report came in from, so OWNER_NOTIFICATION_EMAIL is not brand-split.
//
// CONTACT IS SPLIT, ON PURPOSE. The two brands are two companies, so someone
// writing in through whitegloveitineraries.com must land in that company's
// own inbox, never Kosher Travel's — CONTACT_NOTIFICATION_EMAIL overrides the
// kosher default and CONTACT_NOTIFICATION_EMAIL_ITINERARIES overrides the
// itineraries one; each is independent of the other.
const DEFAULT_EDITS_INBOX = "edits@whiteglovekoshertravel.com";
const DEFAULT_CONTACT_INBOX: Record<SiteBrand, string> = {
  kosher: "contact@whiteglovekoshertravel.com",
  itineraries: "contact@whitegloveitineraries.com",
};

function editsInbox() {
  return process.env.OWNER_NOTIFICATION_EMAIL?.trim() || DEFAULT_EDITS_INBOX;
}

function contactInbox(brand: SiteBrand) {
  const override = brand === "itineraries" ? process.env.CONTACT_NOTIFICATION_EMAIL_ITINERARIES : process.env.CONTACT_NOTIFICATION_EMAIL;
  return override?.trim() || DEFAULT_CONTACT_INBOX[brand];
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- Delivery plumbing -------------------------------------------------

export type SendResult = {
  ok: boolean;
  status?: number;
  id?: string;
  error?: string;
  /** True when the failure is Resend refusing the sandbox sender. */
  sandboxRestricted?: boolean;
};

/** The last delivery failure, so the admin panel can show what actually broke. */
let lastFailure: (SendResult & { at: string; to: string }) | null = null;
export function lastEmailFailure() {
  return lastFailure;
}

/** POST one email to Resend and report exactly what happened. Never throws. */
async function postResend(payload: Record<string, unknown>, to: string, kind = "email"): Promise<SendResult> {
  // Resolved here rather than threaded through twenty call sites: currentBrand
  // reads the request being served and answers "kosher" when there is no
  // request at all, so a background job keeps the behaviour it always had.
  const config = resendConfig(senderForBrand(await currentBrand()));
  if (!config) {
    const result: SendResult = { ok: false, error: "RESEND_API_KEY is not set on the deployment, so no email can be sent." };
    lastFailure = { ...result, at: new Date().toISOString(), to };
    console.error("[email]", result.error);
    await recordEmailAttempt({ at: new Date().toISOString(), kind, to, ok: false, error: result.error });
    return result;
  }
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      // `from` inside the payload wins, so a caller can send as a different
      // address on the same verified domain. Nobody but the blast does; see
      // the note on senderForBlast below for why it is only that one.
      body: JSON.stringify({ from: config.from, ...payload }),
    });
    const bodyText = await response.text().catch(() => "");
    if (!response.ok) {
      // Resend rejects the sandbox sender for any recipient other than the
      // account owner — the most common reason owner mail never arrives.
      const sandboxRestricted =
        config.from === TEST_SENDER && /own email address|testing emails|not verified|verify a domain/i.test(bodyText);
      const result: SendResult = {
        ok: false,
        status: response.status,
        error: bodyText || `Resend returned HTTP ${response.status}.`,
        sandboxRestricted,
      };
      lastFailure = { ...result, at: new Date().toISOString(), to };
      console.error("[email] send failed:", response.status, bodyText);
      await recordEmailAttempt({ at: new Date().toISOString(), kind, to, ok: false, status: response.status, error: result.error, sandboxRestricted });
      return result;
    }
    let id: string | undefined;
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id;
    } catch {
      /* body isn't JSON — fine */
    }
    await recordEmailAttempt({ at: new Date().toISOString(), kind, to, ok: true, status: response.status });
    return { ok: true, status: response.status, id };
  } catch (error) {
    const result: SendResult = { ok: false, error: error instanceof Error ? error.message : String(error) };
    lastFailure = { ...result, at: new Date().toISOString(), to };
    console.error("[email] send threw:", error);
    await recordEmailAttempt({ at: new Date().toISOString(), kind, to, ok: false, error: result.error });
    return result;
  }
}

/** Current delivery configuration, for the admin diagnostic panel. */
export async function emailConfigStatus() {
  const apiKeySet = Boolean(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || TEST_SENDER;
  const edits = editsInbox();
  const contactKosher = contactInbox("kosher");
  const contactItineraries = contactInbox("itineraries");
  return {
    apiKeySet,
    from,
    usingTestSender: from === TEST_SENDER,
    editsInbox: edits,
    contactInboxKosher: contactKosher,
    contactInboxItineraries: contactItineraries,
    /** True in the normal case: every queue stays apart from the others. */
    inboxesSplit: new Set([edits, contactKosher, contactItineraries]).size === 3,
    editsInboxFromEnv: Boolean(process.env.OWNER_NOTIFICATION_EMAIL?.trim()),
    contactInboxKosherFromEnv: Boolean(process.env.CONTACT_NOTIFICATION_EMAIL?.trim()),
    contactInboxItinerariesFromEnv: Boolean(process.env.CONTACT_NOTIFICATION_EMAIL_ITINERARIES?.trim()),
    lastFailure,
    /** Real sends from every route, not just this instance's tests. */
    log: await readEmailLog(),
    logAvailable: emailLogAvailable(),
  };
}

/** Send a test message to one of the owner inboxes and report the outcome. */
export async function sendTestEmail(which: "edits" | "contact-kosher" | "contact-itineraries"): Promise<SendResult & { to: string }> {
  const to = which === "edits" ? editsInbox() : contactInbox(which === "contact-itineraries" ? "itineraries" : "kosher");
  const when = new Date().toISOString();
  const result = await postResend(
    {
      to,
      subject: `White Glove test email (${which})`,
      html: `<p>This is a test from your White Glove admin dashboard.</p><p>If you are reading this, mail to <strong>${escapeHtml(to)}</strong> is working.</p><p style="color:#999;font-size:12px;">Sent ${escapeHtml(when)}</p>`,
      text: `Test from your White Glove admin dashboard. If you are reading this, mail to ${to} is working. Sent ${when}`,
    },
    to,
    "test",
  );
  return { ...result, to };
}

// ---- Messages ----------------------------------------------------------

export type SubmissionNotification = {
  kind: string; // e.g. "Edit suggestion", "Business listing"
  targetType?: string;
  targetId?: string;
  title?: string;
  name: string;
  email: string;
  issue?: string;
  currentInfo?: string;
  suggestedInfo?: string;
  source?: string;
};

function table(rows: Array<[string, string | undefined]>) {
  const visible = rows.filter(([, v]) => v && String(v).trim());
  const html =
    `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">` +
    visible
      .map(
        ([k, v]) =>
          `<tr><td style="vertical-align:top;color:#8a7a52;font-weight:bold;white-space:nowrap;">${escapeHtml(k)}</td>` +
          `<td style="vertical-align:top;color:#333;">${escapeHtml(String(v)).replace(/\n/g, "<br>")}</td></tr>`,
      )
      .join("") +
    `</table>`;
  return { html, text: visible.map(([k, v]) => `${k}: ${v}`).join("\n") };
}

/**
 * Emails the owner whenever a visitor submits something (edit suggestion,
 * business listing, new-entry request). Returns true if Resend accepted it.
 */
export async function sendSubmissionNotification(sub: SubmissionNotification): Promise<boolean> {
  const { html, text } = table([
    ["Type", sub.kind],
    ["About", sub.title],
    ["Page / target", sub.targetId ? `${sub.targetType ?? ""} — ${sub.targetId}` : sub.targetType],
    ["From", `${sub.name} <${sub.email}>`],
    ["Issue / request", sub.issue],
    ["Current info", sub.currentInfo],
    ["Suggested info", sub.suggestedInfo],
    ["Source", sub.source],
  ]);
  const to = editsInbox();
  const result = await postResend(
    {
      to,
      reply_to: sub.email,
      subject: `White Glove: new ${sub.kind}${sub.title ? ` — ${sub.title}` : ""}`,
      html: `<h2 style="font-family:Georgia,serif;color:#1e2a44;">New ${escapeHtml(sub.kind)} on White Glove</h2>${html}<p style="font-family:Arial,sans-serif;font-size:12px;color:#999;">Reply directly to this email to respond to ${escapeHtml(sub.name)}.</p>`,
      text,
    },
    to,
    `submission: ${sub.kind}`,
  );
  return result.ok;
}

/**
 * Somebody has asked about a Gold or Business account.
 *
 * THE REQUEST USED TO ARRIVE IN SILENCE. It was written to the store and shown
 * on /admin/accounts, and nothing anywhere told the owner it had happened — so
 * the only way to find one was to open that page and look. Meanwhile the person
 * who asked was told "we have it, and we will be in touch", which is a promise
 * the site had no way to keep.
 *
 * Goes to the same inbox as the other things visitors send in, because it is
 * the same job: somebody is waiting on an answer from a person.
 *
 * NO CARD, NO SUBSCRIPTION, NOTHING CHARGED — and the email says so, so that
 * reading it at speed cannot leave the impression that money has moved.
 */
export type PlanRequestNotification = {
  /** What they sign in with — an email address or a phone number. */
  account: string;
  /** "Advisor Starter" or "Advisor Pro", already spelled for a person. */
  wanted: string;
  currentPlan: string;
  note?: string;
};

export async function sendPlanRequestNotification(request: PlanRequestNotification): Promise<boolean> {
  const { html, text } = table([
    ["Who", request.account],
    ["Asked about", request.wanted],
    ["On now", request.currentPlan],
    ["They wrote", request.note],
  ]);
  const to = editsInbox();
  const result = await postResend(
    {
      to,
      // Replying lands on them when it is an email address. A phone account has
      // no inbox, so no reply-to is set rather than one that bounces.
      ...(request.account.includes("@") ? { reply_to: request.account } : {}),
      subject: `White Glove: ${request.account} asked about ${request.wanted}`,
      html:
        `<h2 style="font-family:Georgia,serif;color:#1e2a44;">Somebody asked about ${escapeHtml(request.wanted)}</h2>${html}` +
        `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">Nothing has been charged and no card was taken — this is a request for you to answer.</p>` +
        `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">Grant or decline it under <strong>Admin &rarr; Visitor accounts</strong>.</p>`,
      text: `${text}\n\nNothing has been charged. Grant or decline under Admin > Visitor accounts.`,
    },
    to,
    `plan request: ${request.wanted}`,
  );
  return result.ok;
}

export async function sendVerificationEmail(email: string, code: string) {
  const result = await postResend(
    {
      to: email,
      subject: "Your White Glove verification code",
      html: `<p>Your verification code is:</p><h2 style="letter-spacing:4px;">${escapeHtml(code)}</h2><p>This code expires in 30 minutes.</p>`,
    },
    email,
    "verification code",
  );
  return result.ok;
}

export type ContactMessage = {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  /** Which company's form this came in through — decides which contact@ it lands in. */
  siteBrand?: SiteBrand;
};

/**
 * Delivers a public contact-form message to that brand's own contact inbox.
 * Never throws.
 *
 * `siteBrand` decides the inbox, not just the wording — see contactInbox
 * above. Somebody writing in through whitegloveitineraries.com must never
 * land in Kosher Travel's mailbox; the two are separate companies.
 */
export async function sendContactMessage(msg: ContactMessage): Promise<boolean> {
  const { html, text } = table([
    ["From", `${msg.name} <${msg.email}>`],
    ["Phone", msg.phone],
    ["Subject", msg.subject],
    ["Message", msg.message],
  ]);
  const brand = msg.siteBrand ?? "kosher";
  const siteName = BRAND_NAME[brand];
  const to = contactInbox(brand);
  const result = await postResend(
    {
      to,
      reply_to: msg.email,
      subject: `${siteName} contact${msg.subject ? `: ${msg.subject}` : " form message"}`,
      html: `<h2 style="font-family:Georgia,serif;color:#1e2a44;">New message from the ${siteName} contact form</h2>${html}<p style="font-family:Arial,sans-serif;font-size:12px;color:#999;">Reply directly to this email to respond to ${escapeHtml(msg.name)}.</p>`,
      text,
    },
    to,
    "contact form",
  );
  return result.ok;
}

/**
 * Emails a person a link to an itinerary that was shared with them. Never
 * throws; returns true when Resend accepts it.
 */
export async function sendItineraryShareEmail(
  to: string,
  opts: { fromName: string; url: string; title: string; siteBrand?: SiteBrand },
): Promise<boolean> {
  const who = escapeHtml(opts.fromName || "A fellow traveler");
  const title = escapeHtml(opts.title || "their trip");
  const url = escapeHtml(opts.url);
  // Reachable from both brands — whoever shared the trip did it from one site
  // or the other, and this email must say that one, never the other.
  const siteName = BRAND_NAME[opts.siteBrand ?? "kosher"];
  const result = await postResend(
    {
      to,
      subject: `${opts.fromName || "A traveler"} shared "${opts.title}" with you`,
      html:
        `<h2 style="font-family:Georgia,serif;color:#1e2a44;">${who} shared a trip with you</h2>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">You've been added to <strong>${title}</strong> on ${siteName}.</p>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;"><a href="${url}" style="display:inline-block;background:#1e2a44;color:#fff;text-decoration:none;padding:12px 20px;font-weight:bold;">View the itinerary →</a></p>` +
        `<p style="font-family:Arial,sans-serif;font-size:12px;color:#999;">Or open this link: ${url}</p>`,
      text: `${opts.fromName || "A fellow traveler"} shared "${opts.title}" with you on ${siteName}.\n\nView it here: ${opts.url}`,
    },
    to,
    "itinerary share",
  );
  return result.ok;
}

/**
 * "So-and-so invited you to their agency."
 *
 * NOTHING ABOUT MONEY IS IN THIS EMAIL. The invited advisor is not the one
 * paying — the owner's card is — so there is nothing here to reassure them
 * about a charge, unlike sendPlanRequestNotification. What they need is who
 * asked and a link that says plainly what accepting does.
 */
export async function sendAgencyInviteEmail(
  to: string,
  opts: { ownerName: string; url: string; siteBrand?: SiteBrand },
): Promise<boolean> {
  const who = escapeHtml(opts.ownerName || "A colleague");
  const url = escapeHtml(opts.url);
  const siteName = BRAND_NAME[opts.siteBrand ?? "kosher"];
  const result = await postResend(
    {
      to,
      subject: `${opts.ownerName || "Somebody"} invited you to their agency on ${siteName}`,
      html:
        `<h2 style="font-family:Georgia,serif;color:#1e2a44;">${who} invited you to their agency</h2>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">Accepting puts you on Advisor Pro, sharing ${who}&rsquo;s subscription and letterhead. Your own trips stay your own.</p>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;"><a href="${url}" style="display:inline-block;background:#1e2a44;color:#fff;text-decoration:none;padding:12px 20px;font-weight:bold;">See the invitation →</a></p>` +
        `<p style="font-family:Arial,sans-serif;font-size:12px;color:#999;">Or open this link: ${url}</p>`,
      text: `${opts.ownerName || "Somebody"} invited you to their agency on ${siteName}.\n\nAccepting puts you on Advisor Pro, sharing their subscription and letterhead. Your own trips stay your own.\n\nSee the invitation: ${opts.url}`,
    },
    to,
    "agency invite",
  );
  return result.ok;
}

/**
 * "Somebody left a note on your trip."
 *
 * WHY THIS EXISTS. Notes shipped with nothing to tell anybody about them: a
 * person could leave a question on a trip and the only way the owner would
 * find it was by happening to open the trip. That makes the whole thing a
 * suggestion box nobody empties.
 *
 * BEST EFFORT, ALWAYS. The note is saved before this is called and stays saved
 * whether or not it sends. Losing somebody's question because an email
 * provider was down would be the worst possible trade.
 *
 * The note's own words are in the email, because "you have a new note" makes
 * somebody open a page to find out something that would have fitted in the
 * sentence they just read.
 */
export async function sendTripNoteEmail(
  to: string,
  opts: { fromName: string; tripTitle: string; note: string; about?: string; url: string },
): Promise<boolean> {
  const who = escapeHtml(opts.fromName || "Somebody");
  const title = escapeHtml(opts.tripTitle || "your trip");
  const note = escapeHtml(opts.note);
  const url = escapeHtml(opts.url);
  const on = opts.about ? ` on ${escapeHtml(opts.about)}` : "";
  const result = await postResend(
    {
      to,
      subject: `${opts.fromName || "Somebody"} left a note on "${opts.tripTitle}"`,
      html:
        `<h2 style="font-family:Georgia,serif;color:#1e2a44;">${who} left a note${on}</h2>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;color:#333;">On <strong>${title}</strong>:</p>` +
        `<blockquote style="font-family:Arial,sans-serif;font-size:14px;color:#333;border-left:4px solid #aa8b52;margin:0;padding:8px 16px;">${note}</blockquote>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;"><a href="${url}" style="display:inline-block;background:#1e2a44;color:#fff;text-decoration:none;padding:12px 20px;font-weight:bold;">Open the trip →</a></p>`,
      text: `${opts.fromName || "Somebody"} left a note${opts.about ? ` on ${opts.about}` : ""} on "${opts.tripTitle}":\n\n${opts.note}\n\nOpen the trip: ${opts.url}`,
    },
    to,
    "trip note",
  );
  return result.ok;
}

export async function sendPasswordResetEmail(email: string, code: string) {
  const result = await postResend(
    {
      to: email,
      subject: "Reset your White Glove password",
      html: `<p>Your password reset code is:</p><h2 style="letter-spacing:4px;">${escapeHtml(code)}</h2><p>This code expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    },
    email,
    "password reset",
  );
  return result.ok;
}

/**
 * Money moved, or stopped moving.
 *
 * SAME REASON THE PLAN REQUEST GOT ONE. A subscription that starts and ends in
 * silence means the only way the owner learns he has a paying customer — or has
 * lost one — is by opening a screen and looking. Stripe emails him too, in
 * Stripe's words about a customer id; this says which account, on which plan,
 * in the words the rest of the site uses.
 */
export type SubscriptionNotification = {
  /** What they sign in with. */
  account: string;
  /** "One Trip", "Advisor Starter" or "Advisor Pro", already spelled for a person. */
  plan: string;
  event: "started" | "ended";
};

export async function sendSubscriptionNotification(note: SubscriptionNotification): Promise<boolean> {
  const started = note.event === "started";
  const { html, text } = table([
    ["Who", note.account],
    ["Plan", note.plan],
    ["What happened", started ? "Subscription started" : "Subscription ended — the account is back with no plan"],
  ]);
  const to = editsInbox();
  const result = await postResend(
    {
      to,
      ...(note.account.includes("@") ? { reply_to: note.account } : {}),
      subject: started
        ? `White Glove: ${note.account} is now on ${note.plan}`
        : `White Glove: ${note.account}'s ${note.plan} subscription ended`,
      html:
        `<h2 style="font-family:Georgia,serif;color:#1e2a44;">${started ? "New subscription" : "Subscription ended"}</h2>${html}` +
        `<p style="font-family:Arial,sans-serif;font-size:13px;color:#555;">Stripe handled the payment. The account was moved ${started ? "onto" : "off"} the plan automatically — there is nothing for you to do.</p>`,
      text: `${text}\n\nStripe handled the payment. The account was moved automatically.`,
    },
    to,
    `subscription ${note.event}`,
  );
  return result.ok;
}

/* ---- the blast ---------------------------------------------------------- */

/**
 * One message to one person on the alert list.
 *
 * THE UNSUBSCRIBE LINK IS NOT OPTIONAL AND IS NOT A PARAMETER. It is built here
 * from the token the signup already carries, and every message this function
 * sends has it in the body and in the `List-Unsubscribe` header. That header is
 * what Gmail and Outlook read to draw their own one-click unsubscribe, and mail
 * sent without it is treated as more likely to be spam — so leaving it out
 * hurts delivery to the people who DO want the mail, quite apart from being the
 * thing the law requires.
 *
 * ONE PERSON PER CALL, ON PURPOSE. Resend can take up to 50 recipients in one
 * request, but every one of them would then need the same unsubscribe link —
 * which is to say, the wrong one for 49 of them. The caller paces these.
 */
/**
 * Who an update comes FROM, which is not who a verification code comes from.
 *
 * TWO KINDS OF MAIL, TWO ADDRESSES, AND THE DIFFERENCE MATTERS. A six-digit
 * code is from `noreply@` because there is nothing to reply to and a reply
 * would sit unread in a mailbox nobody opens. An update about a Pesach
 * programme is a letter: somebody WILL reply to it, to ask whether the hotel
 * takes a family of six, and that reply has to land somewhere a person reads.
 *
 * So the blast sender is its own setting. Blank means "whatever the rest of the
 * site uses", which is what it was before this existed.
 *
 * IT MUST BE ON THE VERIFIED DOMAIN. Resend will only send as a domain it has
 * been shown control of; anything else is refused at the API, or worse,
 * accepted and dropped into spam by the receiving server for failing DKIM. The
 * check lives in lib/email-blast.ts so the admin screen can refuse it at the
 * moment it is typed rather than at the moment 200 messages fail.
 */
export function blastSender(configured: string): string {
  const clean = configured.trim();
  if (!clean) return resendConfig()?.from ?? "";
  // Named, so it arrives as "White Glove Kosher Travel" rather than a bare
  // address — which is most of the difference between a letter and a circular.
  return clean.includes("<") ? clean : `White Glove Kosher Travel <${clean}>`;
}

export async function sendBlastEmail(input: {
  to: string;
  subject: string;
  /** The address to send as. Blank uses the site-wide sender. */
  from?: string;
  /** The message, as blocks. A pre-blocks draft still renders through blocksOf. */
  blast: { blocks?: BlastBlock[]; body?: string; subject?: string };
  /** This deployment's address, so the crest and any picture can be absolute. */
  origin: string;
  unsubscribeUrl: string;
  /** Shown under the message, above the unsubscribe line. Why they are getting this. */
  becauseLine: string;
}): Promise<SendResult> {
  const render = {
    blast: input.blast,
    origin: input.origin,
    becauseLine: input.becauseLine,
    unsubscribeUrl: input.unsubscribeUrl,
  };
  const from = blastSender(input.from ?? "");
  return postResend(
    {
      to: input.to,
      subject: input.subject,
      ...(from ? { from } : {}),
      // Replies go back to the same address it came from. An update somebody
      // answers is the point of sending it from a mailbox rather than noreply@.
      ...(from ? { reply_to: from } : {}),
      headers: {
        // One-click unsubscribe, the way the mail clients want it offered.
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      html: renderBlastHtml(render),
      // Both parts, always. Some corporate clients show the text one, and a
      // message with no text part scores worse with spam filters.
      text: renderBlastText(render),
    },
    input.to,
    "blast",
  );
}

/**
 * A Business account sending a finished itinerary to the person it was planned
 * for.
 *
 * WHY THIS IS NOT THE COLLABORATOR INVITATION. That one adds somebody to a trip
 * so they can open it, comment on it and see it in their own account — it is an
 * invitation to work on something together. This is a delivery: an agent has
 * finished, and the client gets a link to read and print. Nobody is added to
 * anything, and the client needs no account.
 *
 * IT GOES OUT AS THE BUSINESS, NOT AS US. The subject and the body say the
 * business's name, because the client has never heard of White Glove and an
 * email from a stranger about their holiday is an email they delete. The From
 * address is still this site's — sending as somebody else's domain is what
 * every spam filter in the world exists to catch — and their own address is set
 * as the reply-to, so pressing reply reaches the person they think they are
 * talking to.
 */
export async function sendItineraryToClient(input: {
  to: string;
  /** The business's name, from their branding. */
  from: string;
  /** Where to reply. The account's own address. */
  replyTo?: string;
  tripTitle: string;
  /** Anything the agent wanted to say. Optional. */
  note?: string;
  url: string;
  /** Which site the agent's account is actually on. Defaults to kosher. */
  siteBrand?: SiteBrand;
}): Promise<SendResult> {
  const business = escapeHtml(input.from);
  const title = escapeHtml(input.tripTitle || "your trip");
  const url = escapeHtml(input.url);
  const note = input.note?.trim();
  // Like the printed document's own credit line (components/PrintableItinerary.tsx):
  // the business's own branding replaces everything except this, and this
  // names whichever site actually produced the document.
  const domain = BRAND_DOMAIN[input.siteBrand ?? "kosher"];
  return postResend(
    {
      to: input.to,
      ...(input.replyTo?.includes("@") ? { reply_to: input.replyTo } : {}),
      subject: `${input.from}: your itinerary for ${input.tripTitle || "your trip"}`,
      html:
        `<div style="max-width:560px;margin:0 auto;padding:8px 4px;">` +
        `<h2 style="font-family:Georgia,serif;color:#1e2a44;margin:0 0 16px;">Your itinerary from ${business}</h2>` +
        (note
          ? `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#333;">${escapeHtml(note).replace(/\n/g, "<br>")}</p>`
          : "") +
        `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#333;">` +
        `<strong>${title}</strong> is ready. Open it to see every day, and print it or save it as a PDF to take with you.</p>` +
        `<p style="font-family:Arial,sans-serif;font-size:14px;"><a href="${url}" style="display:inline-block;background:#1e2a44;color:#fff;text-decoration:none;padding:12px 20px;font-weight:bold;">Open your itinerary →</a></p>` +
        `<p style="font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a8a8a;margin-top:24px;">` +
        `Sent by ${business}. Reply to this email to reach them.<br>` +
        `Planned with ${domain}.</p></div>`,
      text:
        `Your itinerary from ${input.from}\n\n` +
        (note ? `${note}\n\n` : "") +
        `${input.tripTitle || "Your trip"} is ready. Open it to see every day, and print it or save it as a PDF:\n${input.url}\n\n` +
        `Sent by ${input.from}. Reply to this email to reach them.\nPlanned with ${domain}.`,
    },
    input.to,
    "itinerary to client",
  );
}
