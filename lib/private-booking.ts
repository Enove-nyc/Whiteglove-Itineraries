export const BOOKING_HOST = "book.whitegloveitineraries.com";
export const BOOKING_ORIGIN = `https://${BOOKING_HOST}`;
export const BOOKING_COOKIE = "__Host-wg-booking";
export const BOOKING_SESSION_SECONDS = 12 * 60 * 60;

type HeadersLike = { get(name: string): string | null };
type BookingRequest = {
  headers: HeadersLike;
  cookies: { get(name: string): { value: string } | undefined };
};

export function isBookingHost(headers: HeadersLike) {
  return headers.get("host")?.toLowerCase() === BOOKING_HOST;
}

export function bookingPassword() {
  const password = process.env.PRIVATE_BOOKING_PASSWORD;
  return password && password.length >= 20 && signingSecret() ? password : null;
}

function signingSecret() {
  const secret = process.env.PRIVATE_BOOKING_SIGNING_SECRET || process.env.WHITE_GLOVE_SESSION_SECRET;
  return secret && secret.length >= 24 && secret !== process.env.PRIVATE_BOOKING_PASSWORD ? secret : null;
}

export async function bookingSignature(value: string) {
  const password = signingSecret();
  if (!password) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function equalBookingValue(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let differences = a.length ^ b.length;
  for (let index = 0; index < b.length; index++) differences |= (a[index] ?? 0) ^ b[index];
  return differences === 0;
}

export async function hasBookingAccess(request: BookingRequest) {
  if (!isBookingHost(request.headers) || !bookingPassword()) return false;
  const cookie = request.cookies.get(BOOKING_COOKIE)?.value ?? "";
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(cookie);
  if (!match || Number(match[1]) <= Date.now() / 1000) return false;
  const signature = await bookingSignature(`access:${match[1]}:${bookingPassword()}`);
  return signature !== null && equalBookingValue(match[2], signature);
}
