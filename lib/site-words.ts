/**
 * The owner's words on top of the built-in ones, and where each one shows.
 *
 * The rules only — no store, no React. The point of keeping WHERE EACH ONE
 * SHOWS beside the word itself is that the previous attempt at this failed
 * precisely there: six fields were saved and none of them were read anywhere,
 * and nothing in the code connected the two ends, so nobody noticed. The list
 * below is what the screen renders and what the test checks against the source.
 */

import { BUILT_IN_WORDS, type SiteWords } from "@/data/site-words";
import { BRAND_CONTACT_EMAIL, type SiteBrand } from "@/lib/site-brand-core";

/** Only what the owner actually changed. */
export type StoredWords = Partial<SiteWords>;

export const WORD_KEYS = Object.keys(BUILT_IN_WORDS) as (keyof SiteWords)[];

/**
 * Exact obsolete strings that must not win over a corrected built-in.
 *
 * ONLY these exact lines — never a fuzzy match. An owner who deliberately
 * wrote something else keeps it. The one headline that promised site-wide
 * completeness (which destination-readiness does not grant) is dropped so a
 * Redis override saved before the rewrite cannot silently undo the fix.
 */
export const OBSOLETE_WORDINGS: Partial<Record<keyof SiteWords, readonly string[]>> = {
  // The hero-words keys themselves were retired with the "Where to?" front
  // page; the scrub machinery stays for the next wording that has to go.
  searchPlaceholder: ["Search a city, tzaddik, or country..."],
};

/** True when a stored value is a known-obsolete string we must not republish. */
export function isObsoleteWording(key: keyof SiteWords, value: string): boolean {
  const list = OBSOLETE_WORDINGS[key];
  if (!list) return false;
  const trimmed = value.trim();
  return list.some((entry) => entry === trimmed);
}

/**
 * Drop only obsolete keys from a stored partial, leaving every other edit.
 *
 * Safe to run on read and on save: it never clears a real owner decision.
 */
export function scrubObsoleteWords(stored: StoredWords | null | undefined): StoredWords {
  if (!stored || typeof stored !== "object") return {};
  const out: StoredWords = { ...stored };
  for (const key of WORD_KEYS) {
    const value = out[key];
    if (typeof value === "string" && isObsoleteWording(key, value)) delete out[key];
  }
  return out;
}

/**
 * The built-in words with the owner's on top.
 *
 * A stored value that is empty or not a string is DROPPED rather than used.
 * An empty headline is not a decision anybody makes on purpose, and a front
 * page with no words on it is worse than one with the wrong words.
 * A known-obsolete headline is also dropped — see OBSOLETE_WORDINGS.
 */
export function mergeWords(stored: StoredWords | null | undefined): SiteWords {
  const merged: SiteWords = { ...BUILT_IN_WORDS };
  const cleaned = scrubObsoleteWords(stored);
  for (const key of WORD_KEYS) {
    const value = cleaned[key];
    if (typeof value === "string" && value.trim()) merged[key] = value.trim();
  }
  return merged;
}

/**
 * The address to show a visitor, given which front door they came through.
 *
 * WHY NOT INSIDE readWords. That read is cached under one key for the whole
 * deployment and nothing about the request reaches it, so a brand resolved in
 * there would be whichever brand happened to warm the cache. The brand belongs
 * to the request, so it is applied where the page renders.
 *
 * AN ADDRESS THE OWNER TYPED HIMSELF WINS ON BOTH SITES. Only the built-in
 * one moves, because the built-in one names the kosher domain and was never a
 * decision about either brand — it is simply what shipped.
 */
export function contactEmailFor(brand: SiteBrand, words: SiteWords = BUILT_IN_WORDS): string {
  if (words.contactEmail !== BUILT_IN_WORDS.contactEmail) return words.contactEmail;
  return BRAND_CONTACT_EMAIL[brand];
}

/** Only what differs from the built-in set, so the store holds decisions. */
export function onlyChangedWords(words: SiteWords): StoredWords {
  const out: StoredWords = {};
  for (const key of WORD_KEYS) {
    if (words[key] !== BUILT_IN_WORDS[key]) Object.assign(out, { [key]: words[key] });
  }
  return out;
}

/* ---- what cannot be saved ----------------------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Why these words cannot be saved, or null.
 *
 * Deliberately few. These are words, not arithmetic — the owner is allowed to
 * write whatever he likes on his own front page, and a screen that argued with
 * him about a headline would be an insult. Refused: an empty field, an address
 * that is not an address, and the one obsolete completeness headline that the
 * site already corrected in code (so it cannot be put back through this form).
 */
export function wordProblem(words: SiteWords): string | null {
  for (const key of WORD_KEYS) {
    if (!words[key]?.trim()) {
      const field = FIELDS.find((f) => f.key === key);
      return `${field?.label ?? key} cannot be empty — it would leave a blank ${field?.where ?? "on the site"}.`;
    }
  }
  if (!EMAIL.test(words.contactEmail.trim())) {
    return "That is not an email address. Every form on the site tells people to write to it, so a typo here means mail going nowhere.";
  }
  for (const key of WORD_KEYS) {
    if (isObsoleteWording(key, words[key])) {
      const field = FIELDS.find((f) => f.key === key);
      return `${field?.label ?? key} uses wording the site no longer stands behind. Use the built-in wording, or write something current.`;
    }
  }
  return null;
}

/* ---- what each word is, and where it shows ------------------------------ */

// "footer" was retired as a group along with footerBlurb and footerStrapline
// — the redesigned footer is five fixed links, a logo and a copyright line,
// none of it owner-editable text any more. See components/Footer.tsx.
export type WordGroup = "front" | "contact" | "booking" | "affiliate";

export const WORD_GROUPS: Array<{ id: WordGroup; title: string; note: string }> = [
  { id: "front", title: "The front page", note: "What the search box invites people to type." },
  {
    id: "contact",
    title: "Getting in touch",
    note: "Shown wherever the site asks somebody to write in. This is the address VISITORS ARE TOLD, and it is not the same setting as the inbox the site delivers its own forms to — that is CONTACT_INBOX, on the connections screen. Changing this one changes what is printed on the page; make sure somebody reads whatever you put here.",
  },
  { id: "booking", title: "The booking page", note: "Under the heading on /book." },
  {
    id: "affiliate",
    title: "The commission disclosure",
    note: "Shown beside every booking button on the site — hotels, flights, cars, and anything else that goes out to a partner. It is a legal requirement in the US, the UK and the EU, and it has to be next to the action rather than only in the footer. Change it here and it changes in every one of those places at once.",
  },
];

export type WordField = {
  key: keyof SiteWords;
  group: WordGroup;
  label: string;
  /** The place on the site this appears. Named, so it can be gone and looked at. */
  where: string;
  /** The page it is on, so the screen can link straight to it. */
  href: string;
  long?: boolean;
  /** Owner must decide before this can be a real public answer. Shown in Admin → Words as an amber badge. Nothing sets this today. */
  needsOwnerDecision?: boolean;
  /** Short example of a defendable answer — guidance, never published as fact. */
  example?: string;
  /** One-line guidance under the field. */
  guidance?: string;
};

export const FIELDS: WordField[] = [
  { key: "searchPlaceholder", group: "front", label: "What the search box says", where: "inside the search box until somebody types", href: "/" },
  {
    key: "contactEmail",
    group: "contact",
    label: "The address people are told to write to",
    // Named exhaustively because it is the one word here that is load-bearing:
    // getting it wrong loses mail rather than looking wrong.
    where: "on every form, in the terms, in the privacy policy, and on the Lizhensk page",
    href: "/contact",
  },
  { key: "replyPromise", group: "contact", label: "What a form says once it is sent", where: "after somebody presses send", href: "/contact" },
  { key: "bookingNotice", group: "booking", label: "The paragraph under the heading", where: "on the booking page", href: "/book", long: true },
  { key: "affiliateDisclosure", group: "affiliate", label: "What is said beside a booking button", where: "beside every commercial action on the site", href: "/book", long: true },
];

/** Which words are no longer the ones the site ships with. */
export function changedWords(words: SiteWords): WordField[] {
  return FIELDS.filter((f) => words[f.key] !== BUILT_IN_WORDS[f.key]);
}

/**
 * What the OLD settings screen had saved, worth showing him.
 *
 * Six fields were saved there and read nowhere, so whatever he typed has been
 * sitting in the database doing nothing — possibly for a long time. Merging it
 * in silently would change his front page without him asking today; throwing it
 * away would discard something he did ask for. So it is shown, and he chooses.
 *
 * Only the ones that actually differ from what the site says now, and only the
 * four that have a home here — the old `publicNotice` had no place on the site
 * at all, which is part of why none of this worked.
 */
export type OldSetting = { key: keyof SiteWords; label: string; theirs: string; nowShowing: string };

export function whatTheOldScreenSaved(old: Partial<Record<string, string>> | null | undefined, now: SiteWords): OldSetting[] {
  if (!old) return [];
  const pairs: Array<[string, keyof SiteWords]> = [
    ["searchPlaceholder", "searchPlaceholder"],
    ["footerEmail", "contactEmail"],
    ["bookingNotice", "bookingNotice"],
  ];
  const out: OldSetting[] = [];
  for (const [from, to] of pairs) {
    const theirs = old[from]?.trim();
    if (!theirs || theirs === now[to]) continue;
    out.push({ key: to, label: FIELDS.find((f) => f.key === to)?.label ?? to, theirs, nowShowing: now[to] });
  }
  return out;
}
