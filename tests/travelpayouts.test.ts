import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  describeLinks,
  describeSlot,
  forwardsTo,
  linkProblem,
  markerIn,
  markerProblem,
  SLOTS,
  throughTravelpayouts,
} from "@/lib/travelpayouts";
import { carUrl, flightUrl, hostBelongsTo, partnerFor, TRAVEL_PARTNERS } from "@/lib/travel-partners";

/**
 * Routing the searches so they earn.
 *
 * THIS EXISTS BECAUSE A MARKER WAS SET AND EARNED NOTHING. TRAVELPAYOUTS_MARKER
 * was read from the environment, carried into the booking page, typed into the
 * Affiliate object — and applied to no link at all. Every check here is a way
 * that can happen again, and every one of them is invisible from the outside:
 * the search opens, the search works, and no money arrives.
 */

const MARKER = "761677";
const booking = (u = "https://www.booking.com/searchresults.html?ss=Krakow") =>
  `https://tp.media/r?marker=${MARKER}&trs=123&p=4115&campaign_id=101&u=${encodeURIComponent(u)}`;
const kayak = (u = "https://www.kayak.com/flights/JFK-KRK/2026-09-01") =>
  `https://tp.media/r?marker=${MARKER}&trs=123&p=4114&campaign_id=100&u=${encodeURIComponent(u)}`;
/** A link for the flight programme this account is actually approved for. */
const aviasales = (u = "https://search.aviasales.com/flights/?origin_iata=JFK&destination_iata=KRK") =>
  `https://tp.media/r?marker=${MARKER}&trs=123&p=4114&campaign_id=100&u=${encodeURIComponent(u)}`;
const economy = (u = "https://www.economybookings.com/en?idpick=Krakow") =>
  `https://tp.media/r?marker=${MARKER}&trs=123&p=4114&campaign_id=100&u=${encodeURIComponent(u)}`;
/** Both searches pinned to Kayak, for the tests that are about Kayak. */
const onKayak = { flights: "kayak", cars: "kayak" } as const;
/** Explicit pin for fixtures that still exercise Aviasales / EconomyBookings. */
const onTravelpayoutsDefaults = { flights: "aviasales", cars: "economybookings" } as const;

describe("the marker itself", () => {
  it("takes a plain number", () => {
    assert.equal(markerProblem(MARKER), null);
  });

  it("refuses the script tag somebody will paste instead", () => {
    // The dashboard hands out an Emerald <script> tag as well as an ID, and
    // they look equally official to somebody who has just signed up.
    const said = markerProblem('<script src="https://emrldco.com/NTU5Nzcx.js?t=559771">');
    assert.match(said!, /plain number/);
  });

  it("refuses the base64 blob out of that script", () => {
    assert.match(markerProblem("NTU5Nzcx")!, /digits only/);
  });

  it("says nothing about an empty box", () => {
    // Not set is not an error; it is the state the site has always been in.
    assert.equal(markerProblem(""), null);
  });
});

describe("a pasted link has to be able to earn", () => {
  it("accepts a redirect link for the partner that search opens", () => {
    assert.equal(linkProblem(booking(), "hotels"), null);
    // Aviasales when that partner is chosen; Kayak is the code default.
    assert.equal(linkProblem(aviasales(), "flights", onTravelpayoutsDefaults), null);
    assert.equal(linkProblem(kayak(), "flights", onKayak), null);
  });

  it("REFUSES A LINK FOR THE WRONG PARTNER", () => {
    // The one mistake with no symptom. A Booking.com link in the flights row
    // produces a working search that credits nobody.
    const said = linkProblem(booking(), "flights", onTravelpayoutsDefaults);
    assert.match(said!, /www\.booking\.com/);
    assert.match(said!, /Aviasales/);
    assert.match(said!, /does not track another/);
  });

  it("REFUSES A LINK FOR A PARTNER THAT IS NO LONGER THE ONE CHOSEN", () => {
    // The new way to get this wrong: a perfectly good Kayak link, pasted while
    // the search is set to Aviasales. Both are real programmes and the link is
    // not malformed — it simply does not track the search this site builds.
    const said = linkProblem(kayak(), "flights", { flights: "aviasales" } as never);
    assert.match(said!, /www\.kayak\.com/);
    assert.match(said!, /Aviasales/);
    // And it says which knob to turn, because either fix is legitimate.
    assert.match(said!, /change the partner/i);
  });

  it("refuses a link that never goes through Travelpayouts", () => {
    const said = linkProblem("https://www.booking.com/searchresults.html?aid=123", "hotels");
    assert.match(said!, /nothing is credited/);
  });

  it("refuses a link carrying no marker", () => {
    const said = linkProblem(`https://tp.media/r?trs=1&p=2&u=${encodeURIComponent("https://www.kayak.com/x")}`, "flights");
    assert.match(said!, /not be credited to you/);
  });

  it("refuses a short link, because there is nothing to swap the search into", () => {
    const said = linkProblem(`https://tp.st/abc123?marker=${MARKER}`, "hotels");
    assert.match(said!, /short link/);
  });

  it("refuses something that is not a link at all", () => {
    assert.match(linkProblem("761677", "hotels")!, /not a link/);
  });

  it("says nothing about an empty box", () => {
    for (const { slot } of SLOTS) assert.equal(linkProblem("", slot), null);
  });

  it("reads the marker and the destination back out", () => {
    assert.equal(markerIn(booking()), MARKER);
    assert.equal(forwardsTo(booking()), "www.booking.com");
  });
});

describe("what the traveller's browser actually opens", () => {
  const search = "https://www.booking.com/searchresults.html?ss=Krakow&checkin=2026-09-01";

  it("sends the search through Travelpayouts, keeping the account numbers", () => {
    const out = new URL(throughTravelpayouts(search, booking(), "hotels"));
    assert.equal(out.host, "tp.media");
    assert.equal(out.searchParams.get("marker"), MARKER);
    assert.equal(out.searchParams.get("trs"), "123");
    assert.equal(out.searchParams.get("p"), "4115");
    assert.equal(out.searchParams.get("campaign_id"), "101");
    // And the traveller still ends up at the search they built, not the
    // example address the link was generated from.
    assert.equal(out.searchParams.get("u"), search);
  });

  it("NEVER BREAKS A SEARCH over a bad setting", () => {
    // A wrong link costs a commission. A search that fails costs a customer.
    for (const bad of ["", "   ", "not a url", booking(), `https://tp.st/x?marker=${MARKER}`]) {
      assert.equal(throughTravelpayouts(search, bad, "flights"), search, bad);
    }
    assert.equal(throughTravelpayouts(search, undefined, "hotels"), search);
  });

  it("leaves the search exactly as built when nothing is configured", () => {
    const flight = "https://www.kayak.com/flights/JFK-KRK/2026-09-01?sort=bestflight_a";
    assert.equal(throughTravelpayouts(flight, undefined, "flights"), flight);
  });
});

describe("what the screen says is happening", () => {
  it("says plainly that an unrouted search earns nothing, and names who it opens", () => {
    const said = describeSlot("cars", "");
    assert.match(said, /earns nothing/);
    // Code default is Kayak; EconomyBookings remains available when chosen.
    assert.match(said, /Kayak/);
    assert.match(describeSlot("cars", "", onTravelpayoutsDefaults), /EconomyBookings/);
  });

  it("names the marker once a search is routed", () => {
    assert.match(describeSlot("hotels", booking()), new RegExp(MARKER));
  });

  it("does not call a wrong link working", () => {
    assert.match(describeSlot("flights", booking()), /^Not in use/);
  });

  it("counts how many of the three earn", () => {
    assert.match(describeLinks({}), /none of them earns/);
    assert.match(describeLinks({ hotels: booking() }), /Hotels go through Travelpayouts/);
    assert.match(describeLinks({ hotels: booking() }), /earn nothing/);
    assert.match(
      describeLinks({ hotels: booking(), flights: aviasales(), cars: economy() }, onTravelpayoutsDefaults),
      /All three/,
    );
    // The same three links, judged against Kayak, are the wrong partner and
    // stop counting — which is the guard doing its job, not a regression.
    assert.doesNotMatch(
      describeLinks({ hotels: booking(), flights: aviasales(), cars: economy() }, onKayak),
      /All three/,
    );
  });

  it("counts Stay22 Kayak flights and cars from the ID, without a pasted wrap", () => {
    const stay22 = { aid: "whiteglove", provider: "roam" as const };
    const said = describeLinks({}, onKayak, stay22);
    assert.match(said, /Stay22/);
    assert.match(said, /All three/);
    assert.doesNotMatch(said, /none of them earns/);
  });

  it("always says something for every search", () => {
    for (const { slot } of SLOTS) assert.ok(describeSlot(slot, "").length > 30, slot);
  });
});

describe("the slots match the searches the site really builds", () => {
  it("covers exactly the three hand-offs on /book", () => {
    assert.deepEqual(SLOTS.map((s) => s.slot), ["flights", "hotels", "cars"]);
  });

  it("defaults flights and cars to Kayak, hotels to Booking.com", () => {
    assert.equal(partnerFor("flights", {}).key, "kayak");
    assert.equal(partnerFor("cars", {}).key, "kayak");
    assert.equal(partnerFor("hotels", {}).key, "booking");
  });

  it("THE ADDRESS BUILT IS ON THE DOMAIN THE LINK IS CHECKED AGAINST", () => {
    // The invariant this file has always guarded, now per partner. If a
    // builder and its domain drift apart, the paste-a-link check stops being a
    // guard and starts refusing correct links.
    for (const partner of TRAVEL_PARTNERS) {
      const built =
        partner.slot === "flights"
          ? flightUrl(partner, { shape: { trip: "one-way", legs: [{ from: "JFK", to: "KRK", date: "2026-09-01" }] } })
          : partner.slot === "cars"
            ? carUrl(partner, { where: "Krakow", pickup: "2026-09-01", dropoff: "2026-09-05" })
            : null;
      // Hotels are built in lib/affiliate/partners.ts, and Kayak flights keep
      // their own builder in lib/kayak-search.ts — both covered elsewhere.
      if (!built) continue;
      assert.ok(hostBelongsTo(new URL(built).host, partner.domain), `${partner.key}: ${built}`);
    }
  });
});

describe("the links the owner actually has in his hand", () => {
  // BOTH OF THESE ARE REAL LINKS FROM HIS OWN DASHBOARDS, and both were
  // refused with advice that did not fit — "use the link builder" to somebody
  // who had just used the link builder. He concluded the admin was broken and
  // left flights pointing at a partner that sends travellers to a Russian
  // page. A refusal that does not say what to do next costs more than the
  // paste it prevented.

  it("names the shortened link for what it is, and says where the long one is", () => {
    const said = String(linkProblem("https://kiwi.tpx.lv/QdvmP1KC", "flights"));
    assert.match(said, /short/i, `does not say it is the short link: ${said}`);
    assert.match(said, /u=/, `does not say what the full link looks like: ${said}`);
    // The old message sent him back to the builder he had already used.
    assert.doesNotMatch(said, /goes straight to/i, said);
  });

  it("still refuses it, because a code cannot carry a route or a date", () => {
    // The point of the better message is not to start accepting these.
    assert.ok(linkProblem("https://kiwi.tpx.lv/QdvmP1KC", "flights"));
    assert.equal(
      throughTravelpayouts("https://example.com/search", "https://kiwi.tpx.lv/QdvmP1KC", "flights"),
      "https://example.com/search",
      "a short link was used and the traveller's search was thrown away",
    );
  });

  it("takes his Stay22 link rather than turning it away", () => {
    // This used to be refused outright, on the reasoning that Stay22 was the
    // hotel network and this box was Travelpayouts'. That was wrong, and it
    // was refusing the one link that solves the flights problem: Stay22 has a
    // Kayak desk, and it carries a route and dates. See lib/stay22.ts for the
    // redirect chain this was checked against.
    const KAYAK = { flights: "kayak" } as never;
    assert.equal(linkProblem("https://kayak.stay22.com/whitegloveitinerarie/Te_B-47Q2I", "flights", KAYAK), null);
  });

  it("has not started accepting anything it used to refuse", () => {
    // The full link is still the only shape that works, and a link that goes
    // straight to the partner is still refused by the same rule as before.
    const direct = String(linkProblem("https://www.kiwi.com/en/search", "flights"));
    assert.match(direct, /goes straight to www\.kiwi\.com/, direct);
  });
});

describe("a Stay22 link is a second way for a search to earn", () => {
  const SHORT = "https://kayak.stay22.com/whitegloveitinerarie/Te_B-47Q2I";
  const KAYAK = { flights: "kayak", cars: "kayak" } as never;

  // VERIFIED AGAINST THE LIVE ENDPOINT, not inferred, because the failure mode
  // is silent — a wrong deep link opens a front page and the referral is lost
  // without an error anywhere:
  //   allez/kayak?aid=…&link=<search>
  //     → kayak.com/in?a=kan_249623&enc_cid=<aid>-<campaign>&url=/flights/JFK-FCO/2026-09-01/2026-09-08
  //     → /flights/JFK-FCO/2026-09-01/2026-09-08

  it("accepts the short link, which is the one the dashboard hands out", () => {
    // He could not get a full link out of either dashboard. Reading the ID and
    // the desk out of the short one is what makes that not matter.
    assert.equal(linkProblem(SHORT, "flights", KAYAK), null);
  });

  it("puts the traveller's own route and dates into it", () => {
    const search = "https://www.kayak.com/flights/JFK-FCO/2026-09-01/2026-09-08";
    const out = throughTravelpayouts(search, SHORT, "flights", KAYAK);
    const url = new URL(out);
    assert.equal(url.host, "www.stay22.com");
    assert.equal(url.pathname, "/allez/kayak");
    assert.equal(url.searchParams.get("aid"), "whitegloveitinerarie");
    assert.equal(url.searchParams.get("link"), search, "the search did not survive");
  });

  it("builds the link fresh rather than appending to the short one", () => {
    // The short link already carries a link= of its own. Appending a second
    // leaves Stay22 to choose between them, and it chooses the front page.
    const out = throughTravelpayouts("https://www.kayak.com/flights/JFK-FCO/2026-09-01", SHORT, "flights", KAYAK);
    assert.equal([...new URL(out).searchParams.getAll("link")].length, 1, "link= appears twice");
    assert.doesNotMatch(out, /Te_B-47Q2I/, "the short code was carried into the built link");
  });

  it("refuses a Stay22 link for a partner the search is not set to", () => {
    const said = String(linkProblem(SHORT, "flights", { flights: "aviasales" } as never));
    assert.match(said, /kayak/i, said);
  });

  it("does not offer a second place to configure hotels", () => {
    // Hotels take a Stay22 ID a few boxes up. Two places to set one thing is
    // how they end up disagreeing.
    const said = String(linkProblem(SHORT, "hotels", KAYAK));
    assert.match(said, /already go through Stay22|by ID/i, said);
  });

  it("says which network is carrying the search, rather than assuming", () => {
    const said = describeSlot("flights", SHORT, KAYAK);
    assert.match(said, /Stay22/, said);
    assert.doesNotMatch(said, /Travelpayouts/, `named the wrong network: ${said}`);
  });
});

describe("the Emerald verification snippet stays off the admin dashboard", () => {
  // It loaded on every page, /admin included, from the root layout — a
  // private dashboard handed a look to a third-party affiliate script that
  // has nothing to verify there. The affiliate programme only needs it on
  // the public pages it is confirming ownership of.
  const src = readFileSync("components/TravelpayoutsScript.tsx", "utf8");

  it("checks the path before rendering the script", () => {
    assert.match(src, /usePathname/);
    assert.match(src, /pathname\?\.startsWith\("\/admin"\)/);
  });

  it("bails out before the script tag it would otherwise render", () => {
    const guard = src.indexOf('startsWith("/admin")');
    const script = src.indexOf("emrldco.com");
    assert.ok(guard > -1 && script > -1 && guard < script);
  });
});
