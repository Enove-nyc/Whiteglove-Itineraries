/**
 * Parse a chat upload's data URL into its base content type and base64 body,
 * or null when it is not a base64 data URL.
 *
 * The media type may carry parameters — Chromium's MediaRecorder produces
 * `audio/webm;codecs=opus`, and a phone's recorded video the same — so the type
 * portion is everything up to `;base64,`, and the content type we key on is the
 * part before the first parameter, lowercased. An earlier, stricter pattern
 * disallowed any `;` or `=` in the type and so rejected the whole data URL,
 * which quietly broke every voice note on Chrome and Android.
 */
export function parseChatDataUrl(dataUrl: string): { contentType: string; base64: string } | null {
  const match = /^data:([^,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1].split(";")[0].trim().toLowerCase();
  if (!contentType) return null;
  return { contentType, base64: match[2] };
}
