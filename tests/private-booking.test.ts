import assert from "node:assert/strict";
import { test } from "node:test";
import { duffelRefusal } from "@/lib/duffel-guard";
import { BOOKING_COOKIE, BOOKING_HOST, BOOKING_ORIGIN, bookingSignature, hasBookingAccess } from "@/lib/private-booking";

test("invited sessions can book only on the booking hostname and only through opted-in endpoints", async (t) => {
  const password = "test-password-for-invited-guests";
  t.mock.method(Date, "now", () => 1763760000000);
  const originalPassword = process.env.PRIVATE_BOOKING_PASSWORD;
  const originalSecret = process.env.PRIVATE_BOOKING_SIGNING_SECRET;
  process.env.PRIVATE_BOOKING_PASSWORD = password;
  process.env.PRIVATE_BOOKING_SIGNING_SECRET = "separate-test-only-server-signing-secret";
  t.after(() => {
    if (originalPassword === undefined) delete process.env.PRIVATE_BOOKING_PASSWORD;
    else process.env.PRIVATE_BOOKING_PASSWORD = originalPassword;
    if (originalSecret === undefined) delete process.env.PRIVATE_BOOKING_SIGNING_SECRET;
    else process.env.PRIVATE_BOOKING_SIGNING_SECRET = originalSecret;
  });

  const expires = 1763763600;
  const signature = await bookingSignature(`access:${expires}:${password}`);
  const cookie = `${expires}.${signature}`;
  const request = (host: string, origin = BOOKING_ORIGIN, value = cookie) => ({
    headers: new Headers({ host, origin, "x-forwarded-host": BOOKING_HOST }),
    cookies: { get: (name: string) => name === BOOKING_COOKIE ? { value } : undefined },
  });

  assert.equal(await hasBookingAccess(request(BOOKING_HOST)), true);
  assert.equal(await hasBookingAccess(request("www.whitegloveitineraries.com")), false);
  assert.equal(await hasBookingAccess(request(BOOKING_HOST, BOOKING_ORIGIN, "")), false);
  assert.equal(await hasBookingAccess(request(BOOKING_HOST, BOOKING_ORIGIN, `${expires + 1}.${signature}`)), false);
  assert.equal(await duffelRefusal(request(BOOKING_HOST), { privateBooking: true }), null);
  assert.equal((await duffelRefusal(request(BOOKING_HOST)))?.status, 404);
  assert.equal((await duffelRefusal(request(BOOKING_HOST, "https://example.org"), { privateBooking: true }))?.status, 403);

  process.env.PRIVATE_BOOKING_PASSWORD = "a-different-long-booking-password";
  assert.equal(await hasBookingAccess(request(BOOKING_HOST)), false);
});
