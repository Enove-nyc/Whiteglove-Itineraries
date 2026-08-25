import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * A page's HEAD must not name the other brand while its body names this one.
 *
 * THE TRAP, twice over. resolvePage() hands back the BUILT-IN page when the
 * owner has written nothing in /admin/pages, and every built-in seoTitle was
 * written for the kosher site — "About White Glove Kosher Travel — who we are
 * and how we work". A page reading `page?.seoTitle ?? fallback` therefore never
 * reaches its fallback: it treats the shipped kosher title as the owner's
 * choice. /contact did this and /about did this, and on /about it also settled
 * og:site_name, because pageMetadata reads the brand back out of the title.
 *
 * The body of both pages had been brand-aware for a while. The head had not,
 * and the head is what a search result, a link preview and the browser tab show.
 *
 * GUIDE-ONLY PAGES ARE EXEMPT, and the list is read from middleware.ts rather
 * than repeated here so the two cannot drift. Those paths 307 off the
 * itineraries domain, so their kosher titles are the right titles and the only
 * brand that ever sees them is the one they name.
 */

function guideOnlyPrefixes(): string[] {
  const source = readFileSync("middleware.ts", "utf8");
  const block = source.match(/const GUIDE_ONLY_PREFIXES = \[([\s\S]*?)\];/);
  assert.ok(block, "middleware.ts no longer declares GUIDE_ONLY_PREFIXES the way this test reads it");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Every app-router page file, with the route it serves. */
function pages(dir = "app", route = ""): Array<{ file: string; route: string }> {
  const out: Array<{ file: string; route: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups — "(hub)" — and private folders add no path segment.
      const segment = /^[(_]/.test(entry.name) ? "" : `/${entry.name}`;
      out.push(...pages(full, route + segment));
    } else if (entry.name === "page.tsx") {
      out.push({ file: full, route: route || "/" });
    }
  }
  return out;
}

describe("a page's metadata never inherits the other brand's built-in title", () => {
  const guideOnly = guideOnlyPrefixes();
  const isGuideOnly = (route: string) =>
    guideOnly.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));

  const shared = pages()
    .filter(({ route }) => !isGuideOnly(route) && !route.startsWith("/admin"))
    .map((entry) => ({ ...entry, source: readFileSync(entry.file, "utf8") }))
    .filter(({ source }) => source.includes("resolvePage(") && source.includes("generateMetadata"));

  it("finds the pages this rule is about", () => {
    // If this ever drops to zero the assertions below pass vacuously, which is
    // the failure mode of every source-scanning test.
    assert.ok(shared.length > 0, "no brand-shared page reads resolvePage in its metadata");
  });

  for (const { file, route } of shared) {
    it(`${route} (${file}) reads a title only the owner wrote`, () => {
      const source = readFileSync(file, "utf8");
      assert.ok(
        !/page\?\.seoTitle/.test(source),
        `${file} reads the built-in seoTitle as though the owner had chosen it`,
      );
      assert.ok(
        !/page\?\.seoDescription/.test(source),
        `${file} reads the built-in seoDescription as though the owner had chosen it`,
      );
      assert.ok(source.includes("page?.edited"), `${file} does not check whether the page was edited`);
    });
  }
});
