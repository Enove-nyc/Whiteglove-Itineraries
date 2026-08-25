import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { describeHechsher, hechsherLabel, matchHechsher, UNVERIFIED } from "../data/hechsherim";
import { hechsherOf } from "../lib/use-hechsherim";

describe("what the badge says", () => {
  test("a listing with no recorded status has no public hechsher label", () => {
    assert.equal(hechsherLabel(UNVERIFIED), "");
  });

  test("a source-backed hechsher is named without claiming certification", () => {
    const label = hechsherLabel({ state: "reported", hechsherId: "ou", source: "Community directory" });
    assert.equal(label, "Hechsher: Orthodox Union");
  });

  test("a confirmed hechsher reads as itself", () => {
    const label = hechsherLabel({ state: "certified", hechsherId: "badatz-eda", source: "Saw the teudah" });
    assert.equal(label, "Hechsher: Badatz Eda HaChareidis");
  });

  test("confirmed-as-none is said plainly rather than left blank", () => {
    assert.equal(hechsherLabel({ state: "none", source: "Asked the manager" }), "No hechsher");
  });

  test("the spoken description distinguishes source-backed from confirmed", () => {
    assert.match(describeHechsher({ state: "reported", hechsherId: "ou", source: "Community directory" }), /confirm directly/i);
    assert.match(describeHechsher({ state: "certified", hechsherId: "ou" }), /^Confirmed/);
    assert.match(describeHechsher(UNVERIFIED), /confirm supervision directly/i);
  });
});

describe("reading one curated listing's hechsher", () => {
  const place = { id: "eatery:example" };
  /**
   * The same listing carrying an extra field of the kind a map tag or an
   * external feed brings with it. Widened rather than written inline at the
   * call, so it is passed the way real data arrives — and so the assertion
   * proves the field is ignored rather than proving the compiler rejects it.
   */
  const tagged: { id: string; [key: string]: unknown } = { ...place, reportedHechsher: "OU" };

  test("a listing with nothing recorded returns the neutral default", () => {
    assert.equal(hechsherOf({}, place).state, "unverified");
  });

  test("does not derive a status from map tags or external data", () => {
    assert.equal(hechsherOf({}, tagged).state, "unverified");
  });

  test("the owner's saved status is returned", () => {
    const confirmed = { [place.id]: { state: "none" as const, source: "Spoke to the owner" } };
    assert.equal(hechsherOf(confirmed, place).state, "none");
  });
});

describe("naming an agency from free text", () => {
  test("finds a known agency from editorial source text", () => {
    assert.equal(matchHechsher("Badatz Eda HaChareidis")?.id, "badatz-eda");
    assert.equal(matchHechsher("star-k")?.id, "star-k");
    assert.equal(matchHechsher("Certified by the London Beth Din")?.id, "klbd");
  });

  test("leaves text it does not recognise alone rather than guessing", () => {
    assert.equal(matchHechsher("Rav Shmuel's hashgocho"), undefined);
    assert.equal(matchHechsher(""), undefined);
    assert.equal(matchHechsher(undefined), undefined);
  });

  test("does not match a two-letter mark inside an unrelated word", () => {
    assert.equal(matchHechsher("famous soup house"), undefined);
  });
});
