import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import nextConfig from "@/next.config";
import VersionPage, { generateMetadata as versionMetadata } from "@/app/version/page";
import { STARTING_POINTS } from "@/lib/starting-points";

describe("the old planning address", () => {
  it("redirects permanently to the current recommendations flow", async () => {
    const redirects = (await nextConfig.redirects!()) as Array<{
      source: string;
      destination: string;
      permanent: boolean;
    }>;
    const planning = redirects.find((entry) => entry.source === "/planning");

    assert.deepEqual(planning, { source: "/planning", destination: "/plan", permanent: true });
    assert.ok(
      STARTING_POINTS.some((point) => point.href === planning.destination),
      "the planning redirect does not land on a current starting point",
    );
  });
});

describe("the version route", () => {
  it("is no longer the Railway health check — readiness replaced it", () => {
    // /version stays as the human-readable "is the site up" page, and stays
    // reachable behind the site lock. What it is NOT any more is what Railway
    // waits on: it renders whether or not this build can do its job. See
    // tests/readiness.test.ts.
    const config = JSON.parse(readFileSync("railway.json", "utf8"));
    assert.notEqual(config.deploy?.healthcheckPath, "/version");
  });

  it("SHOWS ONLY A SIMPLE CUSTOMER-SAFE STATUS PAGE TO A STRANGER", async () => {
    // The page reads the admin cookie now, which makes it async — the commit
    // is back on this route but only for somebody signed in as the owner. It
    // is the only way to answer "did that deploy land?", and without it the
    // honest failure is watching an unchanged page and concluding the code is
    // broken. See tests/version-page.test.ts for the divide itself.
    //
    // With no cookie there is no admin, so this renders exactly what a
    // customer reaching the health check would see.
    const html = renderToStaticMarkup(await VersionPage());

    assert.match(html, /Site status/);
    assert.match(html, /White Glove is available\./);
    assert.match(html, /href="\/"/);
    assert.doesNotMatch(html, /Vercel|deployment|developer|build|commit|branch|environment|troubleshoot/i);
    assert.deepEqual((await versionMetadata()).robots, { index: false, follow: false });
  });
});
