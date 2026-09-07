// An enquiry — somebody who has asked about a trip that does not exist yet.
// Pure data model and pure transforms, the same discipline data/clients.ts and
// data/trip-pipeline.ts keep.
//
// WHY THIS IS NOT A TRIP. data/trip-pipeline.ts already has an "Inquiry"
// stage, but it is a stage OF A TRIP: to record that somebody rang up about
// Italy, an advisor had to first create a trip — a title, dates, an itinerary
// with nothing in it — for a conversation that may never become a booking.
// That is the wrong shape twice over. It makes the cheapest possible act, a
// note after a phone call, cost the most, so it does not get done; and it
// fills the pipeline with empty trips that look like work in progress.
//
// So an enquiry is its own small record, and it holds only what is ACTUALLY
// KNOWN after that call. Every field except the contact is optional, because
// on the phone almost everything is: "the Cohens, Italy, sometime in the
// summer, maybe six of them" is a complete enquiry, and the advisor should be
// able to save it and get on with their day.
//
// IT STOPS AT CONVERSION. When the enquiry becomes real the advisor starts a
// trip from it, the enquiry records which trip that is, and the trip's own
// stage takes over from there (data/trip-pipeline.ts). Nothing is copied twice
// and nothing is kept in sync: after conversion this record is history, not a
// second status to maintain.
//
// LEAD SOURCE IS OPTIONAL AND STAYS OPTIONAL. It is recorded when the advisor
// happens to know it, never asked for. An advisor who has to interrogate a
// caller about how they heard of them before the software will save the call
// has been handed a marketing form instead of a CRM.

/** Where an enquiry came from, when the advisor already knows. Never asked. */
export const LEAD_SOURCES = [
  "Referral",
  "Repeat client",
  "Website",
  "WhatsApp",
  "Phone",
  "Social",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * How far an enquiry has got, and no further.
 *
 * These are deliberately NOT the trip stages. An enquiry has one question —
 * is this going to become a trip — and four honest answers to it. Everything
 * after "converted" is the trip's business, and duplicating the trip stages
 * here would give a converted enquiry a status that silently went stale the
 * moment the trip moved on.
 */
export const INQUIRY_STATUSES = ["new", "working", "quoted", "converted", "lost"] as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "New enquiry",
  working: "Working on it",
  quoted: "Quote sent",
  converted: "Became a trip",
  lost: "Didn't go ahead",
};

/** The two that are finished. Everything else is live work. */
const CLOSED_STATUSES: readonly InquiryStatus[] = ["converted", "lost"];

export type Inquiry = {
  id: string;
  /** Who asked. The only field that is genuinely required. */
  contact: string;
  /** Free text on purpose — "Italy, maybe Rome and the lakes" is the answer. */
  destination?: string;
  /** Equally approximate: "August", "school holidays", "2027-06-14". */
  dates?: string;
  travelers?: number;
  /** Whole units of the advisor's own currency. Approximate by nature. */
  budget?: number;
  notes?: string;
  source?: LeadSource;
  /** ISO date. The one field that makes this list useful tomorrow. */
  followUpOn?: string;
  /** Which advisor owns it, for an agency. Their own account identity. */
  assignedTo?: string;
  status: InquiryStatus;
  /** Set once, when an advisor starts a trip from this enquiry. */
  tripId?: string;
  createdAt: string;
  updatedAt: string;
};

export function emptyInquiry(id: string, contact: string, now = new Date().toISOString()): Inquiry {
  return { id, contact: contact.trim(), status: "new", createdAt: now, updatedAt: now };
}

const MAX_TEXT = 2000;
const MAX_SHORT = 200;

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, limit);
  return trimmed || undefined;
}

function wholeNumber(value: unknown, max: number): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), max);
}

/** An ISO calendar date and nothing else, so a follow-up cannot be a sentence. */
function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return undefined;
  const trimmed = value.trim();
  return Number.isFinite(new Date(`${trimmed}T00:00:00Z`).getTime()) ? trimmed : undefined;
}

/**
 * The boundary. Anything arriving from a browser passes through here.
 *
 * Two of these fields are closed vocabularies (source, status) and are dropped
 * rather than corrected when they are not one of the known values — there is
 * no legitimate way for a browser to send another one. The free-text fields
 * are the advisor's own words about their own client and are kept, capped, so
 * a paste of an entire email thread cannot become the record.
 */
export function cleanInquiry(input: unknown, id: string, now = new Date().toISOString()): Inquiry | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const contact = text(raw.contact, MAX_SHORT);
  // No contact, no enquiry: a record nobody can be rung back about is a note.
  if (!contact) return null;
  const status =
    typeof raw.status === "string" && (INQUIRY_STATUSES as readonly string[]).includes(raw.status)
      ? (raw.status as InquiryStatus)
      : "new";
  const source =
    typeof raw.source === "string" && (LEAD_SOURCES as readonly string[]).includes(raw.source)
      ? (raw.source as LeadSource)
      : undefined;
  const createdAt = typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : now;
  return {
    id,
    contact,
    destination: text(raw.destination, MAX_SHORT),
    dates: text(raw.dates, MAX_SHORT),
    travelers: wholeNumber(raw.travelers, 999),
    budget: wholeNumber(raw.budget, 100_000_000),
    notes: text(raw.notes, MAX_TEXT),
    source,
    followUpOn: isoDate(raw.followUpOn),
    assignedTo: text(raw.assignedTo, MAX_SHORT),
    status,
    tripId: text(raw.tripId, MAX_SHORT),
    createdAt,
    updatedAt: now,
  };
}

export function isOpen(inquiry: Inquiry): boolean {
  return !CLOSED_STATUSES.includes(inquiry.status);
}

/**
 * An enquiry that wants the advisor today.
 *
 * Only open enquiries: a follow-up date left behind on one that converted is
 * not a job, and reminding somebody to chase a trip they already started is
 * how a "needs attention" list teaches people to ignore it.
 */
export function followUpDue(inquiry: Inquiry, today: string): boolean {
  return isOpen(inquiry) && Boolean(inquiry.followUpOn) && inquiry.followUpOn! <= today;
}

/**
 * Open enquiries, most pressing first.
 *
 * Anything with a follow-up that has come due leads, oldest first, because a
 * chase that is a fortnight late matters more than one due this morning.
 * Then everything else by when it arrived, so nothing quietly sinks.
 */
export function openInquiries(inquiries: readonly Inquiry[], today: string): Inquiry[] {
  return inquiries
    .filter(isOpen)
    .slice()
    .sort((a, b) => {
      const dueA = followUpDue(a, today);
      const dueB = followUpDue(b, today);
      if (dueA !== dueB) return dueA ? -1 : 1;
      if (dueA && dueB) return (a.followUpOn ?? "").localeCompare(b.followUpOn ?? "");
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/** The finished ones, newest first — reference, not work. */
export function closedInquiries(inquiries: readonly Inquiry[]): Inquiry[] {
  return inquiries
    .filter((inquiry) => !isOpen(inquiry))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * One line an advisor can read at a glance, built only from what is known.
 *
 * Absent fields leave no trace — no "destination: unknown", no empty brackets.
 * A record that mostly says what it does not know reads as a broken form.
 */
export function summariseInquiry(inquiry: Inquiry): string {
  const parts = [inquiry.destination, inquiry.dates];
  if (inquiry.travelers) parts.push(`${inquiry.travelers} ${inquiry.travelers === 1 ? "traveler" : "travelers"}`);
  return parts.filter(Boolean).join(" · ");
}

/**
 * What a trip started from this enquiry begins life knowing.
 *
 * Deliberately thin. The destination and dates here are the advisor's shorthand
 * from a phone call — "the lakes, sometime in August" — which is not a title
 * and not a date range, so nothing is guessed into structured fields that
 * would then be wrong. The advisor fills those in on the trip itself; what
 * carries over is who it is for and everything that was said.
 */
export function tripSeedFromInquiry(inquiry: Inquiry): { client: string; notes: string } {
  const said = [summariseInquiry(inquiry), inquiry.notes].filter(Boolean).join("\n");
  return { client: inquiry.contact, notes: said };
}
