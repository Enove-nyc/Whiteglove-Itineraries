import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import robots from "@/app/robots";
import nextConfig from "../next.config";
import { ITINERARIES_TITLE, ITINERARIES_DESCRIPTION, itinerariesStructuredData } from "@/lib/itineraries-discovery";
import { pageMetadata } from "@/lib/seo";
import { prefersMarkdown } from "@/lib/markdown-request";
import { GET as markdownOverview } from "@/app/site-overview.md/route";
import { isPrivatePath, PRIVATE_PATHS } from "@/lib/private-paths";

/** Robots path matching includes the query; `$` anchors the end of the URL. */
function matches(rule: string, path: string) {
  const end = rule.endsWith("$");
  const pattern = (end ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${pattern}${end ? "$" : ""}`).test(path);
}

describe("public discovery and private crawler boundaries", () => {
  it("negotiates explicit Markdown preferences while preserving HTML and q=0 exclusions", () => {
    for (const accept of [null, "*/*", "text/html,application/xhtml+xml,*/*;q=0.8", "text/markdown;q=0", "text/html;q=1,text/markdown;q=0.2"]) assert.equal(prefersMarkdown(accept), false, accept ?? "missing");
    for (const accept of ["text/markdown", "text/markdown,*/*;q=0.5", "text/html;q=0.4,text/markdown;q=0.9"]) assert.equal(prefersMarkdown(accept), true, accept);
  });

  it("serves exactly the public guide as Markdown with a canonical link and cache variation", async () => {
    const response = markdownOverview();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/markdown/);
    assert.equal(response.headers.get("vary"), "Accept");
    assert.match(response.headers.get("link") ?? "", /whitegloveitineraries\.com/);
    assert.equal(await response.text(), readFileSync("public/llms.txt", "utf8"));
  });

  it("offers public pages and assets to every crawler without a special access grant", () => {
    const policy = robots();
    assert.ok(!Array.isArray(policy.rules));
    const rules = policy.rules as { userAgent: string; allow: string; disallow: string[] };
    assert.equal(rules.userAgent, "*");
    assert.equal(rules.allow, "/");
    for (const path of ["/", "/about", "/contact", "/pricing", "/sample-itinerary", "/privacy", "/terms", "/llms.txt", "/sitemap.xml", "/_next/static/app.js", "/application"]) {
      assert.ok(!rules.disallow.some((rule) => matches(rule, path)), `${path} should be crawlable`);
    }
  });

  it("excludes newer trip, document, conversation and invitation paths, including queries", () => {
    const rules = robots().rules as { disallow: string[] };
    for (const path of ["/app", "/app?enter=1", "/app/preview", "/advisor", "/agency/join", "/join?invite=placeholder", "/i/placeholder/app", "/t/placeholder/app", "/f/placeholder", "/p/placeholder", "/form/placeholder", "/payments", "/clients/placeholder", "/api/companion/chat", "/account?next=1", "/admin?next=1"]) {
      assert.ok(isPrivatePath(path), path);
      assert.ok(rules.disallow.some((rule) => matches(rule, path)), `${path} must not be discovered by crawling`);
    }
    for (const path of ["/application", "/forms-guide", "/travel-guide", "/about"]) assert.equal(isPrivatePath(path), false, path);
  });

  it("also marks non-HTML private responses and redirects noindex, without disabling API caches", async () => {
    const headers = await nextConfig.headers!();
    for (const path of PRIVATE_PATHS) {
      const rule = headers.find((rule) => rule.source === `${path.replace(/\/$/, "")}/:path*`);
      assert.ok(rule, path);
      assert.ok(rule.headers.some((header) => header.key === "X-Robots-Tag" && header.value.includes("noindex") && header.value.includes("noarchive")), path);
      assert.ok(!rule.headers.some((header) => header.key.toLowerCase() === "cache-control"), path);
    }
  });

  it("identifies only this company, with public facts and no invented prices or ratings", () => {
    const graph = itinerariesStructuredData()["@graph"];
    assert.equal(graph[0].name, "White Glove Itineraries");
    assert.equal(graph[1].url, "https://www.whitegloveitineraries.com/");
    assert.equal(graph[1].publisher?.["@id"], graph[0]["@id"]);
    assert.doesNotMatch(JSON.stringify(graph), /Kosher|aggregateRating|offers|price|address/);
    const metadata = pageMetadata({ title: ITINERARIES_TITLE, description: ITINERARIES_DESCRIPTION, path: "/" });
    assert.doesNotMatch(JSON.stringify(metadata), /Kosher/);
    assert.equal(metadata.openGraph?.siteName, "White Glove Itineraries");
  });

  it("gives AI readers real public sources and accurate access and sample limitations", () => {
    const guide = readFileSync("public/llms.txt", "utf8");
    for (const path of ["about", "sample-itinerary", "pricing", "contact", "privacy", "terms", "sitemap.xml"]) assert.ok(guide.includes(`https://www.whitegloveitineraries.com/${path}`));
    assert.match(guide, /fictional/);
    assert.match(guide, /invitation/);
    assert.match(guide, /Purchases are currently unavailable/);
    assert.match(guide, /not cloud-synced/);
    assert.doesNotMatch(guide, /https:\/\/[^\s)]+\/(?:i|t|f|p|form)\//);
  });
});
