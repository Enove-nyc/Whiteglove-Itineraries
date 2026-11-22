import { NextResponse, type NextRequest } from "next/server";
import {
  BOOKING_COOKIE, BOOKING_ORIGIN, BOOKING_SESSION_SECONDS, bookingPassword,
  bookingSignature, equalBookingValue, isBookingHost,
} from "@/lib/private-booking";

export async function POST(request: NextRequest) {
  if (!isBookingHost(request.headers) || request.headers.get("origin") !== BOOKING_ORIGIN) {
    return new NextResponse(null, { status: 403 });
  }
  const password = bookingPassword();
  const form = await request.formData().catch(() => null);
  const submitted = form?.get("password");
  if (!password || typeof submitted !== "string" || !equalBookingValue(submitted, password)) {
    return NextResponse.redirect(new URL("/private-booking/access?invalid=1", BOOKING_ORIGIN), 303);
  }
  const expires = Math.floor(Date.now() / 1000) + BOOKING_SESSION_SECONDS;
  const signature = await bookingSignature(`access:${expires}:${password}`);
  if (!signature) return new NextResponse(null, { status: 503 });
  const response = NextResponse.redirect(BOOKING_ORIGIN, 303);
  response.cookies.set(BOOKING_COOKIE, `${expires}.${signature}`, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: BOOKING_SESSION_SECONDS,
  });
  return response;
}
