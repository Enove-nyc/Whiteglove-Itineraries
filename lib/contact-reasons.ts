/**
 * Why somebody is writing to us, and what to ask them because of it.
 *
 * ONE PAGE, THREE ERRANDS. A person reaching /contact is doing one of three
 * quite different things: telling us something on the site is wrong, asking
 * about advertising, or asking a question. A single "Message" box serves all
 * three badly — the correction arrives without the page it is about and the
 * advertising enquiry arrives without the business, so each costs a reply
 * asking for what the form should have asked for.
 *
 * THE RULE THIS FILE ENFORCES: a field belongs to a reason and appears for
 * that reason only. Somebody reporting a wrong address is never asked which
 * business they run, and vice versa. It is enforced here, as data, so the
 * page cannot drift from it.
 *
 * A FOURTH REASON — asking us to plan or book a trip — used to live here.
 * The owner removed personal trip planning from the site outright rather
 * than keep it as a quiet fourth option; see AGENTS.md, "Personal trip
 * planning has been removed". Do not add it back as a contact reason.
 */

import { type SiteBrand } from "@/lib/site-brand-core";

export type ContactReason = "correction" | "advertise" | "question" | "fault";

export type ContactField = {
  name: string;
  label: string;
  placeholder?: string;
  kind: "text" | "url" | "textarea";
  required: boolean;
  /** Under the field, when the field needs a sentence to be answerable. */
  hint?: string;
};

export type ContactReasonSpec = {
  value: ContactReason;
  /** On the button. */
  label: string;
  /** Under the label, so somebody picks the right one first time. */
  blurb: string;
  /** The heading over the fields, once chosen. */
  heading: string;
  /** What lands in the inbox, so four errands do not look alike in a list. */
  subject: string;
  /** Asked for this reason and no other. */
  fields: readonly ContactField[];
  /** The label on the message box, which is not "Message" for all four. */
  messageLabel: string;
  messagePlaceholder: string;
};

export const CONTACT_REASONS: readonly ContactReasonSpec[] = [
  {
    value: "correction",
    label: "Something here is wrong",
    blurb: "An address, a time, a hechsher, a shomer's number.",
    heading: "What is wrong, and where",
    subject: "Correction",
    fields: [
      {
        name: "page",
        label: "Which page",
        placeholder: "Paste the address, or name the town",
        kind: "text",
        required: true,
      },
      {
        name: "source",
        label: "Where you know it from (optional)",
        placeholder: "A link, a phone call, or “I was there last month”",
        kind: "text",
        required: false,
        hint: "Not required.",
      },
    ],
    messageLabel: "What it says, and what it should say",
    messagePlaceholder: "",
  },
  {
    value: "advertise",
    label: "Advertise or list a business",
    blurb: "A hotel, a programme, a caterer, a driver, a tour.",
    heading: "About the business",
    subject: "Advertising enquiry",
    fields: [
      { name: "business", label: "Business name", kind: "text", required: true },
      { name: "website", label: "Website (optional)", placeholder: "https://", kind: "url", required: false },
      {
        name: "where",
        label: "Where it operates",
        placeholder: "A city, a country, or “worldwide”",
        kind: "text",
        required: true,
      },
    ],
    messageLabel: "What you have in mind",
    messagePlaceholder: "",
  },
  {
    /**
     * THE ONE REASON THAT IS NOT ABOUT THE WORLD.
     *
     * "Something here is wrong" above and this one look alike and are not. The
     * first is a claim about a place — an address, a hechsher, a shomer's
     * number — and only a person who can ring somebody up is able to settle
     * it. This is a claim about the SITE, and the site is the one thing that
     * can be checked without leaving the code. So it is the only queue routed
     * to the bot (lib/trello.ts), and the only one that opens an issue.
     *
     * The two questions asked here are the two that decide whether a fault can
     * be reproduced at all: which page, and what happened. The device is
     * optional and is asked because half the faults ever reported on this site
     * happened at one width and nowhere else.
     */
    value: "fault",
    label: "Something on the site is broken",
    blurb: "A page, button or link that does not work.",
    heading: "What broke, and where",
    subject: "Site fault",
    fields: [
      {
        // NOT "page", which belongs to the correction above. A field name is
        // owned by exactly one reason — tests/contact-reasons enforces it —
        // so that a value typed under one reason can never be composed into
        // another's message. The label is what a person reads, and both may
        // fairly ask "Which page".
        name: "faultPage",
        label: "Which page",
        placeholder: "Paste the address you were on",
        kind: "text",
        required: true,
      },
      {
        name: "device",
        label: "Phone or computer (optional)",
        placeholder: "iPhone, Safari — or Windows, Chrome",
        kind: "text",
        required: false,
      },
    ],
    messageLabel: "What you did, and what happened instead",
    messagePlaceholder: "",
  },
  {
    value: "question",
    label: "Ask a question",
    blurb: "Anything else.",
    heading: "Your question",
    subject: "Question",
    fields: [],
    messageLabel: "Your question",
    messagePlaceholder: "",
  },
] as const;

/**
 * Which errands exist on each front door.
 *
 * TWO OF THE FOUR ARE ABOUT A DIRECTORY THIS BRAND DOES NOT HAVE. "Something
 * here is wrong" asks which listing carries the wrong address or hechsher, and
 * "Advertise or list a business" offers a place in that same directory. Neither
 * exists on whitegloveitineraries.com, which sells an itinerary tool — so
 * offering them there invites a message nobody can act on, and names kosher
 * listings to a visitor who came for something else.
 *
 * The two that remain apply to any website: it is broken, or I have a question.
 */
export const BRAND_REASONS: Record<SiteBrand, readonly ContactReason[]> = {
  kosher: ["correction", "advertise", "fault", "question"],
  itineraries: ["fault", "question"],
};

/** The reasons to put on the page, in the order they are declared above. */
export function reasonsForBrand(brand: SiteBrand): readonly ContactReasonSpec[] {
  const allowed = BRAND_REASONS[brand];
  return CONTACT_REASONS.filter((reason) => allowed.includes(reason.value));
}

export const DEFAULT_CONTACT_REASON: ContactReason = "question";

/** A reason from a query string. Anything unrecognised is not a reason. */
export function readReason(value: string | string[] | undefined): ContactReason | "" {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase() ?? "";
  return CONTACT_REASONS.some((reason) => reason.value === raw) ? (raw as ContactReason) : "";
}

/**
 * The same, but a reason this brand does not offer is not a reason either.
 *
 * /contact?reason=advertise is a link that can be sent, bookmarked or indexed,
 * so the query string has to be filtered as well as the buttons — otherwise the
 * form the page will not offer is still one address away.
 */
export function readReasonForBrand(
  value: string | string[] | undefined,
  brand: SiteBrand,
): ContactReason | "" {
  const reason = readReason(value);
  return reason && BRAND_REASONS[brand].includes(reason) ? reason : "";
}

export function reasonSpec(value: ContactReason): ContactReasonSpec {
  const found = CONTACT_REASONS.find((reason) => reason.value === value);
  // Not reachable through readReason, and a thrown error in a form is worse
  // than the question box.
  return found ?? CONTACT_REASONS[CONTACT_REASONS.length - 1];
}

/**
 * The message that reaches the inbox.
 *
 * The extra answers go ABOVE what was typed, because the person reading this
 * needs to know which page and which business before they read the complaint
 * about it. An unanswered optional field is left out rather than printed
 * empty — a list of blank labels reads as a broken form.
 */
export function composeMessage(
  reason: ContactReason,
  answers: Readonly<Record<string, string>>,
  message: string,
): string {
  const spec = reasonSpec(reason);
  const lines = spec.fields
    .map((field) => [field.label.replace(/\s*\(optional\)$/i, ""), (answers[field.name] ?? "").trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}: ${value}`);
  const body = message.trim();
  return lines.length > 0 ? `${lines.join("\n")}\n\n${body}` : body;
}

/** What is missing, in the order the fields are asked. Empty means send it. */
export function missingFields(
  reason: ContactReason,
  answers: Readonly<Record<string, string>>,
): ContactField[] {
  return reasonSpec(reason).fields.filter((field) => field.required && !(answers[field.name] ?? "").trim());
}
