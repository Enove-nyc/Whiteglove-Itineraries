/**
 * Who is behind White Glove — structured fields the owner fills in.
 *
 * The About page used to ship only a generic “small independent travel outfit”
 * intro. Personal facts (name, photo, where, experience, languages, why it
 * exists) belong to the owner and must not be invented in code. Empty fields
 * stay off the public page; the generic fallback remains until something real
 * is saved at /admin/settings/about.
 */

export type AboutProfile = {
  /** Planner / owner name as visitors should see it. */
  name: string;
  /** Same-origin media URL from /api/admin/media (`/api/media?id=…`), or empty. */
  photoUrl: string;
  /** Accessible description of the photograph. Required when a photo is set. */
  photoAlt: string;
  /** City / region / service area. */
  location: string;
  /** Travel and kosher-planning experience, in their own words. */
  experience: string;
  /** Languages spoken with clients. */
  languages: string;
  /** Why White Glove was created — personal half of the About story. */
  whyCreated: string;
};

/** Empty profile — nothing personal is published until the owner fills it in. */
export const EMPTY_ABOUT_PROFILE: AboutProfile = {
  name: "",
  photoUrl: "",
  photoAlt: "",
  location: "",
  experience: "",
  languages: "",
  whyCreated: "",
};

/**
 * What the About page opens with, whoever is reading it.
 *
 * THIS IS THE PAGE NOW, not a placeholder waiting for a biography. The owner
 * has decided it carries no personal facts at all — no name, no background,
 * and no location, because White Glove is not based anywhere: it is a website.
 * So what used to be a stopgap line apologising for being "a small independent
 * travel outfit" has to do the whole job instead, and does.
 *
 * It says what the site is for and what its information is worth, because that
 * is what a family deciding whether to trust it actually wants to know. Not
 * one word of it is a personal claim, a credential, a team size or a number of
 * years, so nothing here can go stale or turn out to be untrue.
 *
 * It also does not sell the planning service. That is the bottom option and
 * not what this website offers — see AGENTS.md.
 */
/**
 * The About page's opening, per brand.
 *
 * WHY TWO. This app serves two sites, and the About page was one page: on
 * whitegloveitineraries.com it opened "White Glove Kosher Travel is built
 * around the questions that decide a Jewish family's trip. Where the kosher
 * food is..." — to a visitor who came for an itinerary tool, has quite
 * possibly never heard of the other site, and is now reading about a business
 * they did not come to. Substituting the NAME would not have fixed it: the
 * sentences underneath are about a kosher travel guide, and they are not true
 * of a planner.
 *
 * So the itineraries brand gets its own three paragraphs, saying what that
 * site is for and what its information is worth. Same voice, same restraint:
 * no personal facts, nobody's name, nowhere it is based, and no offer to plan
 * anybody's trip for them.
 */
export const ABOUT_INTRO_ITINERARIES: readonly string[] = [
  "White Glove Itineraries is for the part of a trip that happens after the planning. A day laid out properly — the flight, where everybody sleeps, what happens and when — handed over so the person travelling has it in their pocket rather than in an email they have to find at an airport.",
  "What it shows is what you put in, worked out rather than guessed: how long the drive between two real places takes, what a border adds to it, what time a day actually ends once the driving is counted. Where a figure comes from somewhere else — a flight's status, a government advisory — it says so, and says when it was last true.",
  "An adviser builds a trip once and sends it to their client as a link that opens like an app, under their own name. Somebody planning their own trip uses the same thing for themselves.",
];

export const ABOUT_INTRO: readonly string[] = [
  "White Glove Kosher Travel is built around the questions that decide a Jewish family's trip. Where the kosher food is, and who stands behind it. Which quarter keeps you within walking distance on Shabbos. How long the drive between two places really takes, and what Friday afternoon looks like when the clock is against you.",
  "Answers like those are only worth having if they hold up. So every listing here names its source, nothing is shown as checked unless somebody checked it, and where we cannot yet stand behind something we leave it out — better an honest gap than a phone number that stopped working two years ago.",
  "Everything on this site is free to use: ask for recommendations, build the trip day by day yourself, or search our booking partners once the dates are settled.",
];

/**
 * The single line kept for anywhere that wants one sentence rather than three.
 * Same voice, same promise, no personal claim.
 */
export const ABOUT_FALLBACK_INTRO = ABOUT_INTRO[0];

/** The heading above each, so neither page opens with the other's promise. */
export const ABOUT_HEADING: Record<"kosher" | "itineraries", string> = {
  kosher: "Travel information you can plan around.",
  itineraries: "The trip you plan, in your client's pocket.",
};

/** Which opening a brand gets. */
export function aboutIntroFor(brand: "kosher" | "itineraries"): readonly string[] {
  return brand === "itineraries" ? ABOUT_INTRO_ITINERARIES : ABOUT_INTRO;
}
