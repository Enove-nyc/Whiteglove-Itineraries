import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("temporary guest drafts and signed-in trip storage", () => {
  it("the planner stores guest drafts in a dedicated browser key", () => {
    const builder = withoutComments(read("components/ItineraryBuilder.tsx"));
    assert.match(builder, /localStorage\.setItem\(GUEST_DRAFT_KEY/);
    assert.match(builder, /localStorage\.removeItem\(GUEST_DRAFT_KEY/);
    assert.match(builder, /fetch\("\/api\/account\/itinerary"/);
    // The one localStorage read left is the saved Route being imported into a
    // trip, which is a different collection and mirrored to the account.
    assert.doesNotMatch(builder, /localStorage\.getItem\(LS_KEY\)/);
  });

  it("the kosher list and the booking partners write to the account too", () => {
    for (const path of ["components/KosherNearby.tsx", "components/BookPartners.tsx"]) {
      const source = withoutComments(read(path));
      assert.doesNotMatch(source, /localStorage\.setItem/, `${path} still writes a trip to the browser`);
      assert.match(source, /api\/account\/itinerary/, `${path} does not reach the account`);
    }
  });
});

describe("every trip action stands behind the same dialog", () => {
  const GATED: Array<[string, string]> = [
    ["components/ItineraryBuilder.tsx", "saving or importing a guest trip"],
    ["components/KosherNearby.tsx", "adding kosher food to a trip"],
    ["components/BookPartners.tsx", "adding a flight, stay or car"],
    ["components/AddDestinationToTrip.tsx", "adding a destination to a trip"],
    ["components/DestinationActions.tsx", "favourite, Route, itinerary"],
    ["components/DetailActionRow.tsx", "the detail action row"],
    ["components/SavePlaceButtons.tsx", "saving a place"],
    ["components/SaveTripItemButton.tsx", "adding to Route"],
    ["components/SharedItineraryActions.tsx", "copying a shared trip"],
    ["components/MyRouteDashboard.tsx", "editing the Route"],
    ["components/TripComments.tsx", "commenting on a trip"],
    ["components/reviews/ReviewSection.tsx", "writing a review"],
  ];

  for (const [path, what] of GATED) {
    it(`asks before ${what}`, () => {
      assert.match(read(path), /useRequireSignIn/, `${path} does not gate ${what}`);
    });
  }

  it("“Add {destination} to a trip” is an action, not a link to the questionnaire", () => {
    const page = read("app/destinations/[destination]/page.tsx");
    assert.match(page, /<AddDestinationToTrip/);
    // The old link went to /plan?destination=… and saved nothing.
    assert.doesNotMatch(page, /addToTripHref/);
    const button = read("components/AddDestinationToTrip.tsx");
    assert.match(button, /requireSignIn\(add,/);
    // The destination is captured before the dialog opens, so the add that
    // runs after sign-in is still the one they pressed.
    assert.match(button, /async function add\(\)/);
  });
});
