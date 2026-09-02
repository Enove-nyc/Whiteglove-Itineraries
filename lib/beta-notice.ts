/**
 * The site notice: one line, said once, before anybody relies on a detail.
 *
 * WHAT IT SAYS — the whole of it: "Travel details change. Confirm opening
 * hours and booking details before you travel." Earlier versions led with the
 * site being unfinished, explained the checking labels, and carried a feedback
 * paragraph — each cut in its own rewrite. What remains is the one instruction
 * a traveller can act on. The history of why lives in git; the rule it settled
 * on is in tests/beta-notice.test.ts.
 *
 * ITS WORDING IS THIS PRODUCT'S OWN, and that is not cosmetic. Both
 * deployments read one shared store, so the notice the owner writes for the
 * kosher site — "confirm kashrus, hours and Shabbos arrangements" — was
 * arriving here and putting kosher wording on every page of a general travel
 * product, including the home page and the pricing page. The switch and the
 * version still come from the shared record, so turning the notice off still
 * turns it off everywhere; the WORDS are this product's, because this product
 * is not that one.
 *
 * TWO ACTIONS: Verification (how the site checks what it prints) and Close.
 *
 * NOT SHOWN ON ARRIVAL. It waits for the same settling-in signal as
 * SitePromotions — a while on the page, or the first real scroll — so the
 * first thing a visitor reads is the site, not a dialog over it.
 *
 * SHOWN ONCE PER WORDING. A dismissal is per version: bumping the version
 * brings it back, because somebody who dismissed the old wording has not seen
 * the new one.
 *
 * SWITCHED OFF WITHOUT A DEPLOY. The words and the switch are in the admin
 * settings; the fallbacks below are what an unconfigured site says.
 */

export type BetaNotice = {
  /** Off entirely. The state this should end up in. */
  on: boolean;
  heading: string;
  /** The one line. */
  body: string;
  /**
   * Changing this makes everybody see the notice again.
   *
   * A version rather than a date, so it moves when the owner decides it should
   * and not merely because time has passed. Somebody who dismissed the old
   * wording has not agreed to the new wording.
   */
  version: string;
};

/**
 * What it says when nobody has set anything. Shippable as-is.
 */
export const DEFAULT_NOTICE: BetaNotice = {
  on: true,
  heading: "Before you travel",
  body: "Travel details change. Confirm opening hours and booking details before you travel.",
  // BUMPED: version 5 carried three paragraphs and three actions; version 6
  // is the one line. A dismissal is per version, so everybody meets this one.
  version: "6",
};

/** Where a dismissal is remembered, per version. */
export const DISMISS_KEY = "whiteGloveBetaNotice";

/**
 * Where "this wording has been shown once" is remembered, per version.
 *
 * WHY A SECOND KEY. The dismissal above is written only when the visitor
 * closes the notice. Without this, a visitor who read it but navigated away
 * without pressing Close met it again on the next fresh page load, and again
 * on the one after — "it pops up more than once", in the owner's words. This
 * marks the wording as seen the first time it is revealed, so it appears once
 * and does not return. Bumping the version clears both, because a new wording
 * has not been seen. Kept separate from DISMISS_KEY so recording "seen" cannot
 * be mistaken for the visitor having answered it.
 */
export const SHOWN_KEY = "whiteGloveBetaNoticeShown";

/**
 * Should this visitor see it?
 *
 * Four noes, and each is a place a notice would be wrong rather than merely
 * unnecessary: switched off; nothing to say; already answered THIS wording;
 * or one of the owner's own screens.
 */
export function shouldShow(
  notice: BetaNotice,
  { dismissedVersion, path }: { dismissedVersion: string | null; path: string },
): boolean {
  if (!notice.on) return false;
  if (!notice.heading.trim() || !notice.body.trim()) return false;
  if (dismissedVersion === notice.version) return false;
  return !isOwnersOwnScreen(path);
}

/**
 * Screens where the notice is not for the person looking.
 *
 * The admin is the owner's workshop. The login and access pages are where
 * somebody is trying to get in, and a modal over a password box is an obstacle
 * rather than a courtesy. /embed is the partner search form iframed from /book.
 */
export function isOwnersOwnScreen(path: string): boolean {
  return /^\/(admin|login|access|embed)(\/|$)/.test(path);
}

/**
 * What was stored, or null.
 *
 * Anything unreadable reads as "not dismissed", so the worst a corrupted value
 * can do is show the notice one more time.
 */
export function readDismissed(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/**
 * The notice as it will actually be shown.
 *
 * Every field falls back on its own, so the owner clearing one line does not
 * leave a gap under a heading.
 */
export function noticeFrom(stored: Partial<BetaNotice> | null | undefined): BetaNotice {
  const pick = (value: unknown, fallback: string) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
  };
  return {
    // The switch and the version are the owner's, and shared: turning the
    // notice off must turn it off on both sites at once.
    on: typeof stored?.on === "boolean" ? stored.on : DEFAULT_NOTICE.on,
    version: pick(stored?.version, DEFAULT_NOTICE.version),
    // THE WORDS ARE NOT SHARED. A notice written for a kosher travel guide is
    // wrong on a general travel product, and the shared store would otherwise
    // put it on every page here. See the note at the top of this file.
    heading: DEFAULT_NOTICE.heading,
    body: DEFAULT_NOTICE.body,
  };
}

/**
 * Why this wording would not do its job, or null.
 *
 * Checked when the owner saves, because the failure here is silent: a heading
 * over nothing looks finished and warns nobody of anything.
 */
export function noticeProblem(notice: BetaNotice): string | null {
  if (!notice.on) return null;
  if (!notice.heading.trim()) return "Give it a heading.";
  if (notice.body.trim().length < 20) return "Say what to confirm before travelling. A line is enough.";
  return null;
}
