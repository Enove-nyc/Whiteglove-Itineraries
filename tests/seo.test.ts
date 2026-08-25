import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { CANONICAL_ORIGIN, siteOrigin } from "@/lib/seo";
import { breadcrumbs, cemeteryPlace, collectionPage, touristAttraction } from "@/lib/structured-data";

// Every page used to share one title and one description, so a search result
// for Uman and one for Lizhensk were indistinguishable and neither said what
// the page was. The structured data is the machine-readable half of the fix,
// and the thing that matters about it is that it never claims more than the
// page actually contains.

const ENV = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ENV;
});

describe("breadcrumbs", () => {
  it("numbers the trail from one", () => {
    const data = breadcrumbs([
      { name: "Home", path: "/" },
      { name: "Cemeteries", path: "/cemeteries" },
      { name: "Lizhensk", path: "/cemeteries/lizhensk" },
    ]) as { itemListElement: Array<{ position: number; name: string }> };
    assert.deepEqual(data.itemListElement.map((c) => c.position), [1, 2, 3]);
    assert.equal(data.itemListElement[2].name, "Lizhensk");
  });
});

describe("a place", () => {
  it("carries coordinates when the page has them", () => {
    const data = touristAttraction({
      name: "Lizhensk",
      description: "…",
      path: "/lizensk",
      coordinates: "50.251139, 22.422611",
    }) as { geo?: { latitude: number; longitude: number } };
    assert.equal(data.geo?.latitude, 50.251139);
    assert.equal(data.geo?.longitude, 22.422611);
  });

  it("omits coordinates rather than inventing them", () => {
    // Marking up a location the page does not actually have is how a site
    // gets its rich results taken away.
    for (const coordinates of [undefined, null, "", "somewhere near the river", "50.25"]) {
      const data = touristAttraction({ name: "X", description: "…", path: "/x", coordinates }) as { geo?: unknown };
      assert.equal(data.geo, undefined, `${JSON.stringify(coordinates)} should not produce a geo block`);
    }
  });

  it("keeps the Yiddish name as an alternate, and drops empty ones", () => {
    const data = touristAttraction({
      name: "Lizhensk",
      description: "…",
      path: "/lizensk",
      alternateNames: ["ליזענסק", undefined, "  ", "Leżajsk"],
    }) as { alternateName?: string[] };
    assert.deepEqual(data.alternateName, ["ליזענסק", "Leżajsk"]);
  });

  it("calls a beis hachaim a cemetery, not an attraction", () => {
    const data = cemeteryPlace({ name: "Lizhensk Jewish Cemetery", description: "…", path: "/cemeteries/lizhensk" }) as { "@type": string };
    assert.equal(data["@type"], "Cemetery");
  });
});

describe("absolute URLs", () => {
  it("uses the site's own address when it has one", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const data = collectionPage({ name: "Cemeteries", description: "…", path: "/cemeteries" }) as { url: string };
    assert.equal(data.url, "https://example.com/cemeteries");
  });

  it("falls back to the path rather than to a wrong domain", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    const data = collectionPage({ name: "Cemeteries", description: "…", path: "/cemeteries" }) as { url: string };
    assert.equal(data.url, "/cemeteries");
  });
});

describe("a directory", () => {
  it("says how many things it lists", () => {
    const data = collectionPage({ name: "Destinations", description: "…", path: "/stops", count: 297 }) as { mainEntity?: { numberOfItems: number } };
    assert.equal(data.mainEntity?.numberOfItems, 297);
  });

  it("leaves the count out when there isn't one, rather than claiming zero", () => {
    const data = collectionPage({ name: "Destinations", description: "…", path: "/stops" }) as { mainEntity?: unknown };
    assert.equal(data.mainEntity, undefined);
  });
});

describe("the canonical host", () => {
  const restore = () => {
    if (ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = ENV;
  };

  it("PUTS THE WWW BACK ON, SO THE TWO HOSTS CONSOLIDATE ON ONE", () => {
    // whitegloveitineraries.com and www.whitegloveitineraries.com are both
    // attached to this service and both answer 200 — neither redirects to the
    // other. So the same pages really are served on two hosts, and the
    // canonical tag is the only thing telling a search engine which to index.
    // Set the variable to the bare host and every canonical tag, every <loc>
    // in the sitemap and the Sitemap: line in robots.txt would name the other
    // one, and the site would compete with itself.
    for (const configured of [
      "https://whitegloveitineraries.com",
      "http://whitegloveitineraries.com",
      "whitegloveitineraries.com",
      "https://WhiteGloveItineraries.com/",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = configured;
      try {
        assert.equal(siteOrigin()?.origin, CANONICAL_ORIGIN, `${configured} should canonicalise to the www host`);
      } finally {
        restore();
      }
    }
  });

  it("leaves it alone when it is already right", () => {
    process.env.NEXT_PUBLIC_SITE_URL = CANONICAL_ORIGIN;
    try {
      assert.equal(siteOrigin()?.origin, CANONICAL_ORIGIN);
    } finally {
      restore();
    }
  });

  it("does not touch a preview, a local machine, or anybody else's domain", () => {
    // Only the live domain is corrected. A preview deployment saying it is a
    // preview deployment is right, and rewriting it would point every preview
    // canonical at production.
    // The kosher domain is in this list DELIBERATELY. This deployment is not
    // that site any more — it was forked from it — so its host is somebody
    // else's as far as this build is concerned, and rewriting it would be the
    // old bug in reverse.
    for (const configured of [
      "https://white-glove-abc123.vercel.app",
      "http://localhost:3000",
      "https://example.com",
      "https://www.whiteglovekoshertravel.com",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = configured;
      try {
        assert.equal(siteOrigin()?.origin, new URL(configured).origin, `${configured} should be left as it is`);
      } finally {
        restore();
      }
    }
  });

  it("is the same host the alert emails link back to", () => {
    // Two hardcoded fallbacks for the same feature disagreed with each other —
    // the composer preview used the www host and the send action used the bare
    // one — so a test blast and a real blast could carry different links.
    const sendPage = readFileSync("app/admin/alerts/send/page.tsx", "utf8");
    const sendAction = readFileSync("app/admin/alerts/send/actions.ts", "utf8");
    for (const [name, source] of [["the composer", sendPage], ["the send action", sendAction]] as const) {
      assert.doesNotMatch(source, /"https:\/\/(www\.)?whiteglovekoshertravel\.com"/, `${name} still hardcodes a host of its own`);
      assert.match(source, /CANONICAL_ORIGIN/, `${name} should fall back to the one named host`);
    }
  });
});
