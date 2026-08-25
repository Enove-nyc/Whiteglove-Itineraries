import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { senderForBrand } from "@/lib/email";

/**
 * Which name is on the envelope.
 *
 * One RESEND_FROM_EMAIL served both domains, so every email the itineraries
 * site sent — a sign-in code, a trip note, a reminder to somebody else's
 * client — arrived from an address at whiteglovekoshertravel.com. The
 * recipient never asked about kosher travel and may never have heard of it,
 * and is being told there is another business behind the one they signed up
 * to. It is also the plainest test a brand can fail: the name on the envelope
 * is not the name on the door.
 */

const KEYS = ["RESEND_FROM_EMAIL", "RESEND_FROM_EMAIL_ITINERARIES"] as const;
const held: Record<string, string | undefined> = {};

before(() => {
  for (const key of KEYS) held[key] = process.env[key];
});
after(() => {
  for (const key of KEYS) {
    if (held[key] === undefined) delete process.env[key];
    else process.env[key] = held[key];
  }
});

function set(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("the sender follows the brand", () => {
  it("sends the itineraries brand from its own address when there is one", () => {
    set({
      RESEND_FROM_EMAIL: "White Glove Kosher Travel <no-reply@whiteglovekoshertravel.com>",
      RESEND_FROM_EMAIL_ITINERARIES: "White Glove Itineraries <no-reply@whitegloveitineraries.com>",
    });
    assert.match(senderForBrand("itineraries"), /whitegloveitineraries\.com/);
    assert.match(senderForBrand("kosher"), /whiteglovekoshertravel\.com/);
  });

  it("falls back to the shared address rather than sending nothing", () => {
    // A deployment that has not verified a second domain in Resend must keep
    // working exactly as it did. Silence would be a worse regression than the
    // wrong name.
    set({ RESEND_FROM_EMAIL: "White Glove <no-reply@whiteglovekoshertravel.com>" });
    assert.equal(senderForBrand("itineraries"), senderForBrand("kosher"));
    assert.match(senderForBrand("itineraries"), /whiteglovekoshertravel\.com/);
  });

  it("falls back to a name that is neither brand when nothing is configured", () => {
    // The fallback is read by both domains, so it cannot say "Kosher Travel"
    // without telling an itineraries visitor's inbox about another site.
    set({});
    assert.match(senderForBrand("itineraries"), /^White Glove </);
    assert.doesNotMatch(senderForBrand("itineraries"), /Kosher/);
  });

  it("trims a pasted value rather than sending a broken header", () => {
    set({ RESEND_FROM_EMAIL_ITINERARIES: "  White Glove Itineraries <a@b.com>  " });
    assert.equal(senderForBrand("itineraries"), "White Glove Itineraries <a@b.com>");
  });
});

describe("every email goes through it", () => {
  const SRC = readFileSync("lib/email.ts", "utf8");

  it("resolves the brand once, in postResend, rather than at each call site", () => {
    // Twenty senders each remembering to pass a brand is twenty chances to
    // forget one, and the one forgotten is the one somebody notices.
    assert.match(SRC, /const config = resendConfig\(senderForBrand\(await currentBrand\(\)\)\)/);
  });

  it("reads the brand from the request being served", () => {
    // currentBrand answers "kosher" when there is no request at all, so a
    // background job keeps the behaviour it always had.
    assert.match(SRC, /import \{ currentBrand \} from "@\/lib\/site-brand"/);
  });
});
