import assert from "node:assert/strict";
import { test } from "node:test";
import { senderDomain, senderMismatch } from "@/lib/email";

/**
 * EACH FRONT DOOR SENDS FROM ITS OWN DOMAIN.
 *
 * Somebody who signs up on White Glove Itineraries must get their verification
 * code from an itineraries address, and somebody who signs up on Kosher Travel
 * from a kosher one. The failure this guards is silent in every other way: the
 * mail sends, Resend answers 200, the delivery log shows a success, and the
 * only person who learns that one site is sending as the other is a customer
 * reading the wrong company's name in their inbox.
 */

test("the domain comes out of either shape a sender takes", () => {
  assert.equal(senderDomain("White Glove <no-reply@whitegloveitineraries.com>"), "whitegloveitineraries.com");
  assert.equal(senderDomain("no-reply@whitegloveitineraries.com"), "whitegloveitineraries.com");
  assert.equal(senderDomain("  No Reply <No-Reply@WhiteGloveItineraries.com>  "), "whitegloveitineraries.com");
});

test("nothing usable gives nothing back, rather than a guess", () => {
  for (const bad of ["", "White Glove", "not an address", "<>"]) {
    assert.equal(senderDomain(bad), "");
  }
});

test("each brand sending from its own domain is fine", () => {
  assert.equal(senderMismatch("kosher", "WG <no-reply@whiteglovekoshertravel.com>"), null);
  assert.equal(senderMismatch("itineraries", "WG <no-reply@whitegloveitineraries.com>"), null);
});

test("a subdomain is the same business, not a mismatch", () => {
  // Mail is very often sent from send.example.com with the apex left to the
  // real inbox. String equality would raise a false alarm on a good setup.
  assert.equal(senderMismatch("itineraries", "WG <no-reply@send.whitegloveitineraries.com>"), null);
  assert.equal(senderMismatch("kosher", "WG <no-reply@mail.whiteglovekoshertravel.com>"), null);
});

test("ONE BRAND SENDING AS THE OTHER IS CAUGHT — the whole point", () => {
  const wrong = senderMismatch("itineraries", "WG <no-reply@whiteglovekoshertravel.com>");
  assert.ok(wrong, "itineraries sending from the kosher domain was not caught");
  assert.match(wrong!, /whiteglovekoshertravel\.com/);
  assert.match(wrong!, /whitegloveitineraries\.com/);

  assert.ok(senderMismatch("kosher", "WG <no-reply@whitegloveitineraries.com>"));
});

test("a lookalike domain does not pass as a subdomain", () => {
  // "notwhitegloveitineraries.com" ends with the brand domain as a substring
  // but is somebody else entirely. The dot is what makes it a subdomain.
  assert.ok(senderMismatch("itineraries", "WG <a@notwhitegloveitineraries.com>"));
});

test("an unconfigured deployment is not reported as a mismatch", () => {
  // The sandbox sender means nothing is set up at all, which the panel already
  // says on its own line. Saying it twice helps nobody.
  assert.equal(senderMismatch("kosher", "White Glove <onboarding@resend.dev>"), null);
  assert.equal(senderMismatch("kosher", ""), null);
});
