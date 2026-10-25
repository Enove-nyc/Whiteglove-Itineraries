import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shulFromInput, shulId, shulProblem, type ShulInput } from "@/lib/shuls";

const good: ShulInput = {
  name: "Bevis Marks Synagogue",
  city: "London",
  country: "United Kingdom",
  address: "4 Heneage Lane, London EC3A 5DQ",
  website: "https://www.bevismarks.org.uk/",
  phone: null,
  notes: "The oldest in the UK.",
  coordinates: "51.5144, -0.0792",
  sourceUrl: "https://en.wikipedia.org/wiki/Bevis_Marks_Synagogue",
};

describe("adding a shul from the admin", () => {
  it("accepts a complete shul", () => {
    assert.equal(shulProblem(good), null);
  });

  it("refuses one without the fields that make it a listing", () => {
    assert.match(shulProblem({ ...good, name: "  " }) ?? "", /name/i);
    assert.match(shulProblem({ ...good, city: "" }) ?? "", /city/i);
    assert.match(shulProblem({ ...good, country: "" }) ?? "", /country/i);
  });

  it("insists the source is a real, trusted web address", () => {
    assert.match(shulProblem({ ...good, sourceUrl: "bevis-marks" }) ?? "", /web address/i);
    assert.match(shulProblem({ ...good, sourceUrl: "" }) ?? "", /web address/i);
  });

  it("checks coordinates look like a coordinate, or are blank", () => {
    assert.match(shulProblem({ ...good, coordinates: "near the city" }) ?? "", /coordinates/i);
    assert.equal(shulProblem({ ...good, coordinates: "" }), null);
    assert.equal(shulProblem({ ...good, coordinates: null }), null);
  });

  it("turns input into a listing, flagged added, linking to its own row here rather than out", () => {
    const listing = shulFromInput({ ...good, name: "  Bevis Marks Synagogue  " });
    assert.equal(listing.name, "Bevis Marks Synagogue");
    assert.equal(listing.added, true);
    assert.equal(listing.fromDatabase, false);
    assert.equal(listing.href, `/shuls#${listing.id}`);
    // The website is still a field on the listing — just not what href opens.
    assert.equal(listing.website, good.website);
    assert.equal(listing.coordinates, "51.5144, -0.0792");
    assert.equal(listing.id, shulId(good));
  });

  it("still links to its own row when there is no website either", () => {
    const listing = shulFromInput({ ...good, website: null });
    assert.equal(listing.href, `/shuls#${listing.id}`);
    assert.equal(listing.sourceUrl, good.sourceUrl);
  });

  it("gives the same city and name the same id, so re-adding replaces", () => {
    assert.equal(shulId(good), shulId({ ...good, sourceUrl: "https://other.example" }));
    assert.match(shulId({ ...good, city: "Zürich" }), /^shul-added-[a-z0-9-]+$/);
  });
});
