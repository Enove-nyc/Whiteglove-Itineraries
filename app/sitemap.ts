import type { MetadataRoute } from "next";
import { caseStudiesPageShouldExist } from "@/data/case-studies";
import { isGuidePath } from "@/lib/guide-paths";
import { readPublicCaseStudies } from "@/lib/case-studies-store";
import { siteOrigin } from "@/lib/seo";
import { publicPaths } from "@/lib/site-map";

/**
 * The list of this site's pages, for search engines.
 *
 * THERE WAS NOT ONE. /sitemap.xml fell through to the [city] route and returned
 * the "Destination not found" page, so Google had no list of the three
 * hundred-odd towns, batei hachaim, tzaddikim and guides here — every one had
 * to be stumbled across from a link.
 *
 * ONLY THIS DOMAIN'S OWN PAGES. lib/site-map.ts is shared with the kosher
 * repository and lists the whole guide, so this sitemap offered Google 783
 * URLs of which 760 were kosher pages the middleware immediately redirects
 * away from — 370 kevarim, 242 batei hachaim, 106 heritage towns. A sitemap of
 * redirects is worse than no sitemap: it spends the domain's crawl budget on
 * pages it does not have, and tells a search engine the site does not know
 * what it is. The guide's paths are filtered out through the same
 * lib/guide-paths.ts the middleware routes by, so the two cannot disagree.
 *
 * `lastModified` IS THE DEPLOY, and that is the honest answer available. A date
 * per page would need a real "when did this change" on every record, and there
 * is not one; putting today's date on all of them instead would tell a crawler
 * the whole site changed every morning, which is worse than saying nothing.
 * A deploy is a genuine moment at which any of these could have changed.
 *
 * WHICH IS WHY THE DATE IS NOT COMPUTED IN THE HANDLER. Reading Redis for the
 * case studies makes this route dynamic, so a date on the handler's first line
 * runs per request and stamps every URL with the second the crawler asked. At
 * module scope it is the moment the server started, which on this host is the
 * deploy.
 *
 * With no site address configured this returns nothing rather than a list of
 * relative URLs. A sitemap of paths without a host is not a sitemap — every
 * line would be rejected — and an empty one at least fails visibly.
 *
 * /case-studies is added only when enough approved studies exist — an empty
 * public page must not be advertised to crawlers.
 */
const lastModified = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];

  // Through the view, so a destination the owner added is offered to
  // crawlers rather than sitting unlisted until the next deploy.
  const { getVacationDestinations } = await import("@/lib/vacation-destinations-view");
  const entries: MetadataRoute.Sitemap = publicPaths(await getVacationDestinations())
    .filter(({ path }) => !isGuidePath(path))
    .map(({ path, priority, changeFrequency }) => ({
      url: new URL(path, origin).toString(),
      lastModified,
      changeFrequency,
      priority,
    }));

  const studies = await readPublicCaseStudies();
  if (caseStudiesPageShouldExist(studies)) {
    entries.push({
      url: new URL("/case-studies", origin).toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  return entries;
}
