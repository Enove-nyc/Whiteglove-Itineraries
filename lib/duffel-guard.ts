import { isValidAccessToken, sameOrigin } from "@/lib/secure-access";
import { BOOKING_ORIGIN, hasBookingAccess, isBookingHost } from "@/lib/private-booking";

type GuardedRequest = {
  cookies: { get(name: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
};

/** The shared booking session can reach only the routes that explicitly opt in. */
export async function duffelRefusal(
  request: GuardedRequest,
  { write = true, privateBooking = false } = {},
): Promise<{ error: string; status: number } | null> {
  if (isBookingHost(request.headers)) {
    if (!privateBooking || !(await hasBookingAccess(request))) {
      return { error: "Flight booking is not available here.", status: 404 };
    }
    if (write && request.headers.get("origin") !== BOOKING_ORIGIN) {
      return { error: "That request did not come from this site.", status: 403 };
    }
    return null;
  }
  if (!isValidAccessToken("admin", request.cookies.get("white_glove_admin")?.value)) {
    return { error: "Flight booking is not available here.", status: 404 };
  }
  if (write && !sameOrigin(request)) {
    return { error: "That request did not come from this site.", status: 403 };
  }
  return null;
}
