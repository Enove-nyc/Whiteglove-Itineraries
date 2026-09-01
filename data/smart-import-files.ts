/**
 * WHAT A CONFIRMATION CAN ARRIVE AS.
 *
 * It used to be one thing: a PDF. But a confirmation reaches a traveller in
 * whatever form the supplier chose — and reaches a planner in whatever form
 * the traveller could get it into a message. A screenshot of a booking app, a
 * photo of a printed voucher held under a desk lamp, the PDF the airline sent.
 * Refusing the first two meant the planner retyped them.
 *
 * The list is deliberately short and matches what the site already accepts
 * elsewhere (lib/attachments.ts): PDF, PNG, JPEG, WebP. No HEIC — every phone
 * that shoots it will hand over a JPEG when asked for one through a file
 * picker, and adding a converter for a format the browser already converts is
 * a dependency for nothing. No SVG, for the same reason attachments refuse it:
 * it is a script that looks like a picture.
 *
 * Pure, so what is accepted can be tested without a request.
 */

export const IMPORT_TYPES = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
} as const;

export type ImportMediaType = keyof typeof IMPORT_TYPES;

/**
 * A confirmation, large enough for a phone photo and small enough that nobody
 * is uploading a scanned book. Both models take this inline comfortably.
 */
export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;

/** What the file picker offers, and what a screen reader hears it offer. */
export const IMPORT_ACCEPT = Object.keys(IMPORT_TYPES).join(",");

export function isImportMediaType(value: string): value is ImportMediaType {
  return Object.prototype.hasOwnProperty.call(IMPORT_TYPES, value);
}

export type ImportFile = { base64: string; mediaType: ImportMediaType };

/** Bytes behind a base64 payload, worked out from the data rather than trusted. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * Read a data URL into something the extractor can use, or say what is wrong
 * with it in the words the planner will read.
 *
 * The size is measured from the payload itself, never from a number the
 * browser sent — the same rule lib/attachments.ts states and for the same
 * reason.
 */
export function readImportDataUrl(dataUrl: string): { file: ImportFile } | { error: string } {
  const match = /^data:([a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { error: "That file could not be read. Attach a PDF, a photo or a screenshot." };
  const [, mediaType, base64] = match;
  if (!isImportMediaType(mediaType)) {
    return { error: `That is not a kind of file this can read. Attach a ${Object.values(IMPORT_TYPES).join(", ")}.` };
  }
  if (base64Bytes(base64) > MAX_IMPORT_BYTES) {
    return { error: "That file is too large — try a smaller one, or a screenshot of just the confirmation." };
  }
  return { file: { base64, mediaType } };
}

/**
 * A fingerprint of what was submitted, used ONLY to notice the same thing
 * being imported twice in a row.
 *
 * Deliberately not a cryptographic hash and deliberately not stored on the
 * server: it lives in the panel's own memory for the length of one sitting,
 * which is exactly as long as the mistake it prevents. Somebody who pastes the
 * same confirmation, adds it, then pastes it again by accident gets told; a
 * week later, nothing remembers them at all.
 */
export function importFingerprint(input: { text?: string; base64?: string }): string {
  const source = input.text?.trim() || input.base64 || "";
  if (!source) return "";
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  return `${source.length}:${hash}`;
}
