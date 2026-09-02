/**
 * HAS THE TRAVELLER OPENED THE LINK YET?
 *
 * The one question an advisor asks after sending a trip, and the site could
 * not answer it. A share token was write-only: it was minted, copied, sent,
 * and nothing came back — so "did they get it" was a phone call.
 *
 * WHAT IS RECORDED, AND NOTHING ELSE. Two timestamps per link: the first time
 * it was opened, and the most recent. That is the whole record. No IP address,
 * no device, no location, no user agent, no page-by-page trail, no count of
 * visits — none of it is stored, so none of it can leak, be subpoenaed, or
 * turn into a dashboard later. A traveller opening their own itinerary is not
 * a subject to be studied, and the advisor's real question is answered by two
 * dates.
 *
 * THE ADVISOR'S OWN PREVIEW IS NOT AN OPEN. Checking your own work must never
 * read as the client having seen it — that is worse than no signal at all,
 * because it is a signal pointing the wrong way. The pages that record an open
 * check the session cookie first (see recordShareOpen's callers); this module
 * only supplies the rule and the words.
 *
 * REVOKING FREEZES THE RECORD. A stopped link keeps what it had and takes
 * nothing more: `revokedAt` is set, later opens are refused here rather than
 * merely failing to arrive, and the advisor still sees that it was opened
 * twice before they stopped it.
 */

/** Everything kept about one link. Two dates and a tombstone. */
export type ShareOpens = {
  /** The first open by somebody other than the owner. */
  firstOpenedAt?: string;
  /** The most recent one. Equal to firstOpenedAt after a single open. */
  lastOpenedAt?: string;
  /** Set when the link is stopped. From then on nothing is recorded. */
  revokedAt?: string;
};

/** What the advisor is shown, in three states and never in colour alone. */
export type OpenStatus = {
  /** "Not opened yet" · "First opened 31 Aug" · "Last opened today at 9:42 AM" */
  text: string;
  /** A second line, only when there is more to say than the first line holds. */
  detail: string;
  /**
   * Which of the three states this is. Drives the icon and the tone; the TEXT
   * already carries the meaning on its own, so a reader who cannot see either
   * loses nothing.
   */
  state: "unopened" | "opened" | "revoked";
};

/**
 * Fold one open into the record.
 *
 * Pure, so the ordering rules are testable: a revoked link takes nothing, the
 * first open sets both dates, and every later open moves only the last. An
 * out-of-order timestamp (a retry, a clock skew) never drags `lastOpenedAt`
 * backwards.
 */
export function withOpen(opens: ShareOpens, at: string): ShareOpens {
  if (!at) return opens;
  if (opens.revokedAt) return opens;
  const first = opens.firstOpenedAt && opens.firstOpenedAt < at ? opens.firstOpenedAt : at;
  const last = opens.lastOpenedAt && opens.lastOpenedAt > at ? opens.lastOpenedAt : at;
  return { ...opens, firstOpenedAt: first, lastOpenedAt: last };
}

/** Stop the link. Keeps the history; refuses everything after. */
export function withRevoked(opens: ShareOpens, at: string): ShareOpens {
  return opens.revokedAt ? opens : { ...opens, revokedAt: at };
}

/** Whether another open would be recorded, asked before doing any work. */
export function accepting(opens: ShareOpens): boolean {
  return !opens.revokedAt;
}

function parts(iso: string, timeZone: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return {
    day: at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone }),
    year: at.toLocaleDateString("en-GB", { year: "numeric", timeZone }),
    clock: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }),
    stamp: at.toLocaleDateString("en-CA", { timeZone }), // YYYY-MM-DD in that zone
  };
}

/**
 * The line to show for one link.
 *
 * `now` and `timeZone` are arguments rather than read here, for two reasons
 * the codebase already settled: a component may not read a clock while it
 * renders, and the date shown has to be the date where the TRIP is, not where
 * the server happens to run. A trip in Tokyo opened at 08:00 there is not
 * "yesterday" because the advisor's server is in California.
 */
export function openStatus(opens: ShareOpens, now: string, timeZone = "UTC"): OpenStatus {
  const revoked = Boolean(opens.revokedAt);
  const last = opens.lastOpenedAt ? parts(opens.lastOpenedAt, timeZone) : null;
  const first = opens.firstOpenedAt ? parts(opens.firstOpenedAt, timeZone) : null;

  if (!last || !first) {
    return revoked
      ? { text: "Stopped — never opened", detail: "", state: "revoked" }
      : { text: "Not opened yet", detail: "", state: "unopened" };
  }

  const today = parts(now, timeZone)?.stamp ?? "";
  const sameDay = first.stamp === last.stamp;
  const lastWord = last.stamp === today ? `today at ${last.clock}` : `${last.day} at ${last.clock}`;

  // One open is one sentence. The second line only appears once first and last
  // are genuinely different days, so a link opened once does not carry a line
  // repeating itself.
  const text = sameDay ? `First opened ${first.day}` : `Last opened ${lastWord}`;
  const detail = sameDay ? "" : `First opened ${first.day}`;

  if (revoked) {
    return { text: `Stopped · ${text.charAt(0).toLowerCase()}${text.slice(1)}`, detail, state: "revoked" };
  }
  return { text, detail, state: "opened" };
}

/** The icon for each state, so the meaning is never carried by colour alone. */
export const OPEN_STATUS_ICON: Record<OpenStatus["state"], "circle" | "check" | "slash"> = {
  unopened: "circle",
  opened: "check",
  revoked: "slash",
};
