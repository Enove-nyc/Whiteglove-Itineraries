/**
 * A boarding pass, a ticket, a booking confirmation — kept with the stop it
 * belongs to.
 *
 * The planner could say a flight leaves at 07:15 and a kever opens at nine,
 * and then the traveller stood at the gate looking through their email for the
 * pass. Everything about the trip was in one place except the pieces of paper
 * the trip actually needs.
 *
 * WHAT THIS IS NOT FOR, and the rule is enforced rather than requested: this
 * is not somewhere to put a passport, an identity card, or a photograph of
 * either. The owner's standing instruction on this site is that no identity
 * document is stored anywhere in it, and a box that accepts files is exactly
 * where one would end up. The upload says so, and the kinds on offer are the
 * things a traveller genuinely needs to hand: a pass, a ticket, a booking.
 *
 * A BOARDING PASS IS STILL SENSITIVE. It carries the traveller's full name and
 * a booking reference, which between them are enough to change or cancel a
 * flight on most airlines. So:
 *
 *   • It is served only to the account that uploaded it, checked against the
 *     stored owner — never "the id is unguessable, so it is private".
 *   • It is never in the print, never in a search result, and never cached by
 *     anything in between.
 *   • Uploading needs an account. Without one there is nowhere to put it that
 *     is not the visitor's own browser, and a 600KB pass in localStorage
 *     breaks the trip it was meant to help.
 *
 * ONE EXCEPTION, AND THE ADVISER MAKES IT FILE BY FILE. The rule used to be
 * that a pass never left the account at all — which was safe, and meant the
 * person actually boarding could not open their own boarding pass. An adviser
 * plans the trip; the client flies it. So an attachment can now be marked
 * `shared`, and only then does the traveler holding that trip's code see it,
 * through a route scoped to that one trip (app/api/trip-file/[shareId]).
 *
 * ABSENT MEANS NO. Nothing already uploaded became visible, and nothing
 * becomes visible by accident: the adviser turns each file on deliberately.
 * A boarding pass is for the person boarding; a supplier invoice with the
 * commission on it is not, and both live in the same list.
 */

export const ATTACHMENT_KINDS = ["boarding-pass", "ticket", "booking", "other"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const KIND_LABELS: Record<AttachmentKind, { label: string; hint: string }> = {
  "boarding-pass": { label: "Boarding pass", hint: "The pass itself, or the PDF the airline sent." },
  ticket: { label: "Ticket", hint: "An attraction, a museum, a train." },
  booking: { label: "Booking confirmation", hint: "A hotel, a car, a transfer." },
  other: { label: "Something else", hint: "Anything else worth having on your phone." },
};

/**
 * How big one file may be.
 *
 * A boarding pass PDF is tens of kilobytes; an airline's is rarely past two
 * hundred. This is generous for what it is for and small enough that a whole
 * trip's worth still fits in the account. A photograph of a screen straight
 * off a phone is what pushes past it, and the message says to use the PDF.
 */
export const MAX_ATTACHMENT_BYTES = 600 * 1024;

/** How many one stop may carry, so a trip cannot grow without bound. */
export const MAX_PER_ITEM = 6;

/**
 * What may be uploaded.
 *
 * Raster and PDF only, and deliberately no SVG: an SVG is a document that can
 * carry script and fetch from elsewhere, and "just show the file somebody
 * uploaded" stops being a small decision. The same rule the hechsher marks
 * follow.
 */
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};

export type Attachment = {
  id: string;
  kind: AttachmentKind;
  /** The file's own name, as the traveller will recognise it. */
  name: string;
  contentType: string;
  bytes: number;
  /** ISO timestamp. */
  addedAt: string;
  /** A note to themselves — "Yankel's, seat 14C". */
  note?: string;
};

/** Bytes behind a `data:` URL, without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** The content type a `data:` URL declares, lowercased. */
export function dataUrlType(dataUrl: string): string {
  const match = /^data:([^;,]+)/i.exec(dataUrl.trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * Why this file cannot be attached, or null when it can.
 *
 * The size is checked from the data itself rather than from a number the
 * browser sent alongside it, because the number is the part somebody could
 * change and the data is the part that has to fit.
 */
export function attachmentProblem(input: {
  name?: string;
  dataUrl?: string;
  kind?: string;
  existingCount?: number;
}): string | null {
  const name = input.name?.trim() ?? "";
  if (!name) return "That file has no name.";
  if (!input.dataUrl) return "Choose a file first.";
  if ((input.existingCount ?? 0) >= MAX_PER_ITEM) {
    return `That stop already has ${MAX_PER_ITEM} things attached. Take one off first.`;
  }

  const type = dataUrlType(input.dataUrl);
  if (!ALLOWED_TYPES[type]) {
    return /svg/i.test(type)
      ? "SVG files are not accepted. Save it as a PDF or a picture."
      : "That has to be a PDF or a picture — PDF, PNG, JPEG or WebP.";
  }

  const bytes = dataUrlBytes(input.dataUrl);
  if (bytes <= 0) return "That file came through empty.";
  if (bytes > MAX_ATTACHMENT_BYTES) {
    return `That file is ${describeSize(bytes)} — too big. The PDF the airline sent is usually a tenth of that.`;
  }

  if (input.kind && !(ATTACHMENT_KINDS as readonly string[]).includes(input.kind)) {
    return "Say what kind of thing that is.";
  }
  return null;
}

/** "182 KB", "1.2 MB". */
export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** How the row reads: "Boarding pass · KRK–TLV.pdf · 182 KB". */
export function describeAttachment(attachment: Attachment): string {
  return [KIND_LABELS[attachment.kind]?.label ?? "File", attachment.name, describeSize(attachment.bytes)]
    .filter(Boolean)
    .join(" · ");
}

/** True for the ones a browser will show inline rather than download. */
export function opensInTheBrowser(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}

/**
 * A copy of an itinerary with every attachment removed.
 *
 * Used wherever the trip leaves the traveller's own account — a share link,
 * the printable copy, anything handed to somebody else. The reference alone
 * would not fetch the file, because serving checks the owner; stripping it as
 * well means the person on the other end is not even told that a pass exists.
 * Two answers to the same question, because this is the one that costs
 * somebody their flight if it is wrong.
 */
export function withoutAttachments<T extends { flights?: unknown[]; lodging?: unknown[]; activities?: unknown[] }>(
  itinerary: T,
): T {
  const strip = <R,>(rows: R[] | undefined): R[] | undefined =>
    rows?.map((row) => {
      if (!row || typeof row !== "object" || !("attachments" in row)) return row;
      const rest = { ...(row as Record<string, unknown>) };
      delete rest.attachments;
      return rest as R;
    });

  return {
    ...itinerary,
    ...(itinerary.flights ? { flights: strip(itinerary.flights) } : {}),
    ...(itinerary.lodging ? { lodging: strip(itinerary.lodging) } : {}),
    ...(itinerary.activities ? { activities: strip(itinerary.activities) } : {}),
  };
}

/**
 * The itinerary as the traveler may see it: every attachment they were not
 * given is gone, rather than present and refused.
 *
 * NOT A FILTER ON THE SERVING ROUTE, though that checks too. A reference left
 * in the payload would tell the person holding the link that a document exists
 * and is being withheld, which is a worse answer than silence — and it is the
 * mistake withoutAttachments was written to avoid. Same reasoning, one step
 * finer: what was shared stays, what was not is not mentioned.
 */
export function travelerAttachments<
  T extends { flights?: unknown[]; lodging?: unknown[]; activities?: unknown[] },
>(itinerary: T): T {
  const keep = <R,>(rows: R[] | undefined): R[] | undefined =>
    rows?.map((row) => {
      if (!row || typeof row !== "object" || !("attachments" in row)) return row;
      const rest = { ...(row as Record<string, unknown>) };
      const shared = Array.isArray(rest.attachments)
        ? (rest.attachments as Array<{ shared?: boolean }>).filter((a) => a?.shared === true)
        : [];
      if (shared.length) rest.attachments = shared;
      else delete rest.attachments;
      return rest as R;
    });

  return {
    ...itinerary,
    ...(itinerary.flights ? { flights: keep(itinerary.flights) } : {}),
    ...(itinerary.lodging ? { lodging: keep(itinerary.lodging) } : {}),
    ...(itinerary.activities ? { activities: keep(itinerary.activities) } : {}),
  };
}

/** Every attachment id on a trip that the traveler was given. */
type RowWithFiles = { id?: string; attachments?: Array<{ id?: string; shared?: boolean }> };

export function sharedAttachmentIds(itinerary: {
  flights?: RowWithFiles[];
  lodging?: RowWithFiles[];
  activities?: RowWithFiles[];
}): Set<string> {
  const ids = new Set<string>();
  for (const rows of [itinerary.flights, itinerary.lodging, itinerary.activities]) {
    for (const row of rows ?? []) {
      for (const attachment of row?.attachments ?? []) {
        if (attachment?.shared === true && typeof attachment.id === "string") ids.add(attachment.id);
      }
    }
  }
  return ids;
}

/** How many things the whole trip has attached, for a one-line summary. */
export function countAttachments(itinerary: {
  flights?: Array<{ attachments?: Attachment[] }>;
  lodging?: Array<{ attachments?: Attachment[] }>;
  activities?: Array<{ attachments?: Attachment[] }>;
}): number {
  const rows = [...(itinerary.flights ?? []), ...(itinerary.lodging ?? []), ...(itinerary.activities ?? [])];
  return rows.reduce((sum, row) => sum + (row.attachments?.length ?? 0), 0);
}
