/**
 * The few questions worth asking before the itinerary editor.
 *
 * WHY THERE IS A STEP BEFORE THE PLANNER. The planner is a good tool and it is
 * a terrible front door. It opens on an empty trip with a name field, two
 * dates, a day-start time, and eleven buttons — flights, hotels, stops, saved
 * routes, borders, documents, sharing — and somebody who has decided they
 * would like to go away this summer has no idea which of those to press first.
 * The site's most capable feature was also the one most likely to be closed
 * within ten seconds.
 *
 * So: three steps, in the order a person actually decides. What kind of trip.
 * Then where, when, from where, and who is coming. Then open the planner with
 * all of it already in — or say they are not sure yet and browse destinations
 * first.
 *
 * THREE SHORT STEPS, NOT THREE QUESTIONS, and the difference cost the flow its
 * credibility for a while. Step two used to carry nine questions — pace,
 * interests, kashrus, Shabbos, notes — under a heading that had just promised
 * three, with a counter underneath reading "1 of 10 questions answered". Every
 * one of those questions is worth asking and none of them is worth asking
 * BEFORE somebody can reach the planner, so they moved into a "Personalize my
 * recommendations" section that opens after step three, which nobody has to
 * open.
 *
 * EVERY QUESTION IS SKIPPABLE AND EVERY ONE HAS "I DON'T KNOW YET". That is
 * not politeness; it is the point. The visitor this flow exists for is
 * precisely the one who does not know where they are going — a form that
 * demands a destination before it will help sends them away, and they were the
 * customer.
 *
 * WHAT THE ANSWERS BECOME. A seeded trip in the planner, so the name, the
 * dates and the travelers are already in it — nobody types anything twice.
 * There used to be a second path here, a structured message to a
 * personal-planning request form; that service was removed from the site
 * outright, so `method` now has one real value ("myself") and one way of
 * saying "not yet" ("unsure").
 *
 * All of it is pure. The browser storage and the React are in the component;
 * what a well-formed set of answers is, and what it turns into, is here where
 * it can be tested.
 */

import type { TripTheme } from "@/data/vacation-destinations";

/* ---- step one: what are you planning ------------------------------------ */

export type TripKind =
  | "relaxing"
  | "city-break"
  | "family"
  | "honeymoon"
  | "group"
  | "heritage"
  | "unsure";

export const TRIP_KINDS: ReadonlyArray<{
  value: TripKind;
  label: string;
  blurb: string;
  /** Which vacation category to recommend from. Absent for the two that have none. */
  theme?: TripTheme;
  /**
   * What this reads on whitegloveitineraries.com, where a blurb names the
   * kosher world. Only "group" needs one — "a school, a shul or a simcha" is a
   * Jewish group trip, and that site sells general travel to advisers with
   * clients of any kind. Heritage is filtered out there entirely rather than
   * reworded, because the category itself is the guide's.
   */
  itinerariesBlurb?: string;
}> = [
  { value: "relaxing", label: "Relaxing vacation", blurb: "Sea, mountains or a quiet hotel.", theme: "beach" },
  { value: "city-break", label: "City break", blurb: "Streets, food and things to see.", theme: "city" },
  { value: "family", label: "Family trip", blurb: "Enough for the children and enough for you.", theme: "family" },
  { value: "honeymoon", label: "Honeymoon", blurb: "Private and unhurried.", theme: "couples" },
  {
    value: "group",
    label: "Group trip",
    blurb: "Several families, a school, a shul or a simcha.",
    itinerariesBlurb: "Friends, families, schools, teams or an organized group.",
  },
  // The VALUE stays "heritage" — data, tests and query strings reference it.
  { value: "heritage", label: "Heritage", blurb: "Kevarim, batei hachaim and the towns they are in." },
  { value: "unsure", label: "Not sure yet", blurb: "A normal place to start." },
] as const;

export function tripKind(value: string): (typeof TRIP_KINDS)[number] | undefined {
  return TRIP_KINDS.find((kind) => kind.value === value);
}

/* ---- step two: the shape of it ------------------------------------------ */

export type DateMode = "exact" | "approximate" | "unknown";
export type Pace = "slow" | "balanced" | "full" | "unknown";
export type PlanningMethod = "myself" | "unsure";

export const PACES: ReadonlyArray<{ value: Pace; label: string; blurb: string }> = [
  { value: "slow", label: "Slow", blurb: "One thing a day, and time to sit." },
  { value: "balanced", label: "Balanced", blurb: "Something in the morning, something after." },
  { value: "full", label: "Full", blurb: "See as much as the days will hold." },
  { value: "unknown", label: "I don’t know yet", blurb: "We will suggest something and you can change it." },
] as const;

export const INTERESTS: readonly string[] = [
  "Sightseeing and landmarks",
  "Nature and walking",
  "Beach and water",
  "Museums and history",
  "Jewish heritage",
  "Food",
  "Shopping",
  "Doing very little",
  "Things for children",
] as const;

/**
 * Kosher requirements, in the terms people actually use for them.
 *
 * Written as standards rather than as a slider from "less" to "more", because
 * that is not what these are — a family that keeps cholov yisroel is not
 * "stricter" on a scale, they need a different shop. "I don't know yet" is
 * here for somebody planning for guests, or a first trip abroad.
 */
export const KOSHER_REQUIREMENTS: readonly string[] = [
  "Glatt / Beis Yosef meat",
  "Cholov Yisroel",
  "Pas Yisroel",
  "Bishul Yisroel",
  "We will bring our own food",
  "A kitchen or kitchenette where we stay",
  "I don’t know yet",
] as const;

export const SHABBOS_REQUIREMENTS: readonly string[] = [
  "Walking distance to a minyan",
  "Shabbos meals arranged",
  "An eruv",
  "Hotel Shabbos arrangements — keys, lift, urn",
  "A mikvah within reach",
  "We will manage on our own",
  "I don’t know yet",
] as const;

/**
 * Access needs, asked once rather than discovered on the third day.
 *
 * WHY THIS IS A LIST AND NOT LEFT TO "anything else we should know". It was
 * left to that, and the free-text box is where a real constraint goes to be
 * skimmed past. Every item here changes which hotel, which quarter and which
 * day plan is even possible — a walk-up apartment in a Jewish quarter is a
 * lovely recommendation and the wrong one for somebody with a wheelchair.
 *
 * Phrased as the practical thing rather than as a category of person: nobody
 * is asked to declare a condition, they are asked what the trip has to do.
 */
export const ACCESSIBILITY_NEEDS: readonly string[] = [
  "Step-free access where we stay",
  "A lift rather than stairs",
  "Short walking distances",
  "Room for a wheelchair or a pushchair",
  "A car rather than public transport",
  "Somewhere quiet",
  "None of these",
] as const;

export type TripPlanAnswers = {
  /**
   * WHEN THEY WERE ANSWERED, AND WHY THAT MATTERS.
   *
   * These live in the browser so /plan can hand them to the planner, and the
   * planner offered them back under the words "You answered these a moment
   * ago" — which was hardcoded. Somebody came back a week later, on a machine
   * where they were not signed in, and was told they had just typed their
   * family's travel dates. The sentence was wrong and the keeping was worse.
   *
   * ISO, stamped when they are saved. Absent on anything written before this
   * existed, which is treated as old rather than as new.
   */
  savedAt?: string;
  kind: TripKind | "";
  /** A place, or empty. Free text: somebody may type "somewhere warm". */
  destination: string;
  /** "Help me choose" — a real answer, not a missing one. */
  helpMeChoose: boolean;
  /**
   * "" is nobody has said, which is not the same as "unknown".
   *
   * "I don't know yet" is a decision to tell us the dates are open, and it
   * belongs in the request. An untouched question belongs nowhere — printing
   * "Dates: not decided yet" for somebody who never reached that part of the
   * form puts words in their mouth.
   */
  dateMode: DateMode | "";
  /** Set when dateMode is "exact". */
  startDate: string;
  endDate: string;
  /** Set when dateMode is "approximate": "July", "after Pesach", "the winter". */
  approximateWhen: string;
  /** Where they are flying from. */
  from: string;
  adults: string;
  children: string;
  /** Free text — "4, 7 and 11". Ages decide more than the number does. */
  childAges: string;
  /* ---- the optional half ------------------------------------------------
   *
   * Everything below is asked AFTER the three steps, in a "Personalize my
   * recommendations" section that is closed by default. It used to be the
   * whole of step two: nine questions in one screen, in front of somebody who
   * had just been promised "three questions". Pace, interests, kashrus and
   * Shabbos genuinely change what we would suggest — and none of them is worth
   * making a person answer before they can reach the planner. */
  pace: Pace;
  interests: string[];
  kosher: string[];
  kosherNotes: string;
  shabbos: string[];
  /** What the trip has to be able to do. See ACCESSIBILITY_NEEDS. */
  accessibility: string[];
  method: PlanningMethod | "";
  /** Only asked when the trip kind is a heritage journey. */
  kevarim: string;
  notes: string;
};

export function emptyAnswers(): TripPlanAnswers {
  return {
    kind: "",
    destination: "",
    helpMeChoose: false,
    dateMode: "",
    startDate: "",
    endDate: "",
    approximateWhen: "",
    from: "",
    adults: "",
    children: "",
    childAges: "",
    pace: "unknown",
    interests: [],
    kosher: [],
    kosherNotes: "",
    shabbos: [],
    accessibility: [],
    method: "",
    kevarim: "",
    notes: "",
  };
}

/** Where the answers are kept between the flow, the planner and the request form. */
export const TRIP_PLAN_KEY = "whiteGloveTripPlan";

/**
 * Read what was stored, dropping anything that is not the right shape.
 *
 * Storage is an outside thing — another tab, an extension, or an older version
 * of this code put it there — so it is filtered on the way in rather than
 * trusted because we usually write it ourselves. Same rule as lib/drafts.ts.
 */
export function readAnswers(raw: string | null | undefined): TripPlanAnswers | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TripPlanAnswers>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = emptyAnswers();
    const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 400) : "");
    const list = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
    return {
      ...base,
      kind: TRIP_KINDS.some((k) => k.value === parsed.kind) ? (parsed.kind as TripKind) : "",
      destination: text(parsed.destination),
      helpMeChoose: parsed.helpMeChoose === true,
      dateMode: (["exact", "approximate", "unknown"] as const).find((m) => m === parsed.dateMode) ?? "",
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.startDate ?? "")) ? String(parsed.startDate) : "",
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.endDate ?? "")) ? String(parsed.endDate) : "",
      approximateWhen: text(parsed.approximateWhen),
      from: text(parsed.from),
      adults: text(parsed.adults),
      children: text(parsed.children),
      childAges: text(parsed.childAges),
      pace: (["slow", "balanced", "full", "unknown"] as const).find((p) => p === parsed.pace) ?? "unknown",
      interests: list(parsed.interests),
      kosher: list(parsed.kosher),
      kosherNotes: text(parsed.kosherNotes),
      shabbos: list(parsed.shabbos),
      accessibility: list(parsed.accessibility),
      method: (["myself", "unsure"] as const).find((m) => m === parsed.method) ?? "",
      kevarim: text(parsed.kevarim),
      notes: text(parsed.notes),
      ...(typeof parsed.savedAt === "string" ? { savedAt: parsed.savedAt } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * How long answers kept in a browser may be offered back.
 *
 * A day. They exist to carry somebody from /plan to the planner in one
 * sitting, and past that they are a week-old note about a family's travel
 * plans sitting on a machine that may not be theirs. Anything older is not
 * shown and not used.
 */
export const ANSWERS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function answersAreFresh(answers: TripPlanAnswers | null, now = Date.now()): boolean {
  if (!answers) return false;
  // No stamp means written before stamping existed, which is at least as old
  // as this code. Old.
  const at = answers.savedAt ? Date.parse(answers.savedAt) : NaN;
  if (!Number.isFinite(at)) return false;
  return at <= now && now - at <= ANSWERS_MAX_AGE_MS;
}

/** "a few minutes ago", "yesterday" — what was actually true. */
export function describeAnswered(answers: TripPlanAnswers, now = Date.now()): string {
  const at = answers.savedAt ? Date.parse(answers.savedAt) : NaN;
  if (!Number.isFinite(at)) return "earlier";
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "a moment ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "yesterday";
}

/** Has anybody actually answered anything? Decides whether to offer them back. */
export function hasAnswers(answers: TripPlanAnswers | null): boolean {
  if (!answers) return false;
  const base = emptyAnswers();
  // Compared against the untouched set rather than tested for truthiness. Some
  // fields do not start empty — `pace` starts at "unknown" — and a truthiness
  // test would report a form nobody has touched as full of answers, which is
  // how "filled in from your planning answers" appears over nothing.
  return (Object.keys(base) as Array<keyof TripPlanAnswers>).some((key) => {
    const value = answers[key];
    const original = base[key];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value !== original;
    return String(value ?? "").trim() !== String(original ?? "");
  });
}

/* ---- the steps ----------------------------------------------------------- */

export type StepId = "kind" | "shape" | "how";

export const STEPS: ReadonlyArray<{ id: StepId; number: number; title: string; blurb: string }> = [
  { id: "kind", number: 1, title: "The trip", blurb: "" },
  { id: "shape", number: 2, title: "Where, when, and who is coming", blurb: "" },
  { id: "how", number: 3, title: "Ready when you are", blurb: "Open the planner, or browse destinations first." },
] as const;

/**
 * How far through they are.
 *
 * COUNTED IN STEPS, and this is a correction. It used to count the ten
 * individual questions, so a page that promised "three questions" showed
 * "1 of 10 questions answered" under it — and step two really did hold nine of
 * them, which is what the counter was honestly reporting. The fix is not a
 * better counter: it is that steps two's pace, interests, kashrus, Shabbos and
 * access questions are no longer in the way of getting to the planner. They
 * are offered afterwards, and counted separately below, so the number under a
 * three-step flow is out of three.
 *
 * A step counts as answered when ANY of its fields has been touched, because
 * every one of them is optional and a step nobody needed to answer is still a
 * step they got past.
 */
export type TripPlanProgress = {
  answered: number;
  total: number;
  percent: number;
  /** How many of the optional personalisation questions have been answered. */
  personalized: number;
  personalizeTotal: number;
};

/** Whether each of the three steps has anything in it. Order matches STEPS. */
export function stepsAnswered(answers: TripPlanAnswers): [boolean, boolean, boolean] {
  return [
    answers.kind !== "",
    answers.destination.trim() !== "" ||
      answers.helpMeChoose ||
      answers.dateMode !== "" ||
      answers.from.trim() !== "" ||
      answers.adults.trim() !== "" ||
      answers.children.trim() !== "",
    answers.method !== "",
  ];
}

/**
 * The optional questions, and whether each has been answered.
 *
 * `kevarim` is not here: it is only ever shown for a heritage journey, so
 * counting it would make the same flow read "0 of 7" for one visitor and
 * "0 of 6" for the next, for a question most of them will never see.
 */
export function personalizeAnswered(answers: TripPlanAnswers): boolean[] {
  return [
    answers.pace !== "unknown",
    answers.interests.length > 0,
    answers.kosher.length > 0 || answers.kosherNotes.trim() !== "",
    answers.shabbos.length > 0,
    answers.accessibility.length > 0,
    answers.notes.trim() !== "",
  ];
}

export function progressOf(answers: TripPlanAnswers): TripPlanProgress {
  const steps = stepsAnswered(answers);
  const answered = steps.filter(Boolean).length;
  const optional = personalizeAnswered(answers);
  return {
    answered,
    total: steps.length,
    percent: Math.round((answered / steps.length) * 100),
    personalized: optional.filter(Boolean).length,
    personalizeTotal: optional.length,
  };
}

/* ---- what the answers turn into ------------------------------------------ */

function peopleLine(answers: TripPlanAnswers): string | null {
  const adults = answers.adults.trim();
  const children = answers.children.trim();
  if (!adults && !children) return null;
  const parts: string[] = [];
  if (adults) parts.push(`${adults} adult${adults === "1" ? "" : "s"}`);
  if (children) parts.push(`${children} child${children === "1" ? "" : "ren"}`);
  const ages = answers.childAges.trim();
  return parts.join(", ") + (ages ? ` (ages ${ages})` : "");
}

function datesLine(answers: TripPlanAnswers): string | null {
  if (answers.dateMode === "exact" && answers.startDate) {
    return answers.endDate ? `${answers.startDate} to ${answers.endDate}` : `from ${answers.startDate}`;
  }
  if (answers.dateMode === "approximate" && answers.approximateWhen.trim()) {
    return `${answers.approximateWhen.trim()} (approximate)`;
  }
  // Only when they said so. An untouched question says nothing.
  return answers.dateMode === "unknown" ? "Not decided yet" : null;
}

/**
 * The answers as a list of labelled lines.
 *
 * One function, read by the review panel at the end of the flow AND by the
 * message the planning request sends — so what somebody was shown and what we
 * receive are the same words, and a question they skipped is simply absent
 * from both rather than arriving as "undefined".
 */
export function summarize(answers: TripPlanAnswers): Array<[string, string]> {
  const lines: Array<[string, string]> = [];
  const kind = tripKind(answers.kind);
  if (kind) lines.push(["Kind of trip", kind.label]);
  if (answers.helpMeChoose) lines.push(["Destination", "Help me choose"]);
  else if (answers.destination.trim()) lines.push(["Destination", answers.destination.trim()]);
  const dates = datesLine(answers);
  if (dates) lines.push(["Dates", dates]);
  if (answers.from.trim()) lines.push(["Travelling from", answers.from.trim()]);
  const people = peopleLine(answers);
  if (people) lines.push(["Travelers", people]);
  if (answers.pace !== "unknown") {
    lines.push(["Pace", PACES.find((p) => p.value === answers.pace)?.label ?? answers.pace]);
  }
  if (answers.interests.length) lines.push(["Interests", answers.interests.join(", ")]);
  if (answers.kosher.length) lines.push(["Kosher requirements", answers.kosher.join(", ")]);
  if (answers.kosherNotes.trim()) lines.push(["Kosher notes", answers.kosherNotes.trim()]);
  if (answers.shabbos.length) lines.push(["Shabbos", answers.shabbos.join(", ")]);
  if (answers.accessibility.length) lines.push(["Access needs", answers.accessibility.join(", ")]);
  // Asked only for a heritage journey, and therefore only ever present for one.
  if (answers.kevarim.trim()) lines.push(["Kevarim or towns", answers.kevarim.trim()]);
  if (answers.notes.trim()) lines.push(["Anything else", answers.notes.trim()]);
  return lines;
}


/**
 * What the planner should open with.
 *
 * Only the things the planner has a field for. An approximate "July" is
 * deliberately NOT turned into a start date: guessing the 1st of the month
 * would put a wrong date in a trip and look like the traveler's own answer.
 * It goes into the notes instead, where it reads as what it is.
 */
export type PlannerSeed = {
  title: string;
  startDate: string;
  endDate: string;
  travelers: Array<{ name: string; kind: "adult" | "child" }>;
  notes: string;
};

export function plannerSeed(answers: TripPlanAnswers): PlannerSeed {
  const where = answers.destination.trim();
  const kind = tripKind(answers.kind);
  const title = where ? `${where} trip` : kind && kind.value !== "unsure" ? kind.label : "My trip";

  const adults = Math.max(0, Math.min(20, Number.parseInt(answers.adults, 10) || 0));
  const children = Math.max(0, Math.min(20, Number.parseInt(answers.children, 10) || 0));
  const travelers = [
    ...Array.from({ length: adults }, () => ({ name: "", kind: "adult" as const })),
    ...Array.from({ length: children }, () => ({ name: "", kind: "child" as const })),
  ];

  // Everything the planner has nowhere to put, written where the traveler will
  // see it — rather than silently dropped, which is how somebody discovers
  // their answers went nowhere.
  // Everything except what the planner has its own field for. The dates are
  // only excluded when they went INTO those fields — a rough "July" has
  // nowhere else to live and must not be silently dropped.
  const carried = summarize(answers).filter(
    ([label]) => label !== "Travelers" && !(label === "Dates" && answers.dateMode === "exact"),
  );
  const notes = carried.length ? `From your planning answers:\n${carried.map(([l, v]) => `• ${l}: ${v}`).join("\n")}` : "";

  return {
    title,
    startDate: answers.dateMode === "exact" ? answers.startDate : "",
    endDate: answers.dateMode === "exact" ? answers.endDate : "",
    travelers,
    notes,
  };
}

/**
 * Which vacation category to recommend from, given what they said.
 *
 * Null for the two kinds that have no category behind them — a group trip and
 * a heritage journey are not a filter on the vacation list, and pretending
 * otherwise would show somebody planning a kevarim route a page of beaches.
 */
export function suggestedTheme(answers: TripPlanAnswers): TripTheme | null {
  return tripKind(answers.kind)?.theme ?? null;
}

/** Where step three sends them. */
export function nextStepHref(answers: TripPlanAnswers): string {
  if (answers.method === "myself") return "/itinerary?from=plan";
  return "/destinations";
}
