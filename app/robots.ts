import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";
import { PRIVATE_PATHS } from "@/lib/private-paths";

/**
 * What a crawler may and may not read.
 *
 * THERE WAS NO robots.txt. The address returned the "Destination not found"
 * page, because it fell through to the [city] route and was treated as a town.
 *
 * The disallow list is the SAME list the sitemap refuses to include, from
 * lib/private-paths.ts (also used by lib/site-map.ts). Two lists let a page end up submitted in
 * one and forbidden in the other, which Google reports as an error against the
 * whole site.
 *
 * NOT A SECURITY MEASURE, and it must not be mistaken for one. robots.txt is a
 * request that well-behaved crawlers honour; it is also a public list of where
 * the interesting things are. Everything under /admin and /account is behind a
 * real check of its own, and would be with or without this file.
 */
/**
 * Both lines a private address needs.
 *
 * A TRAILING SLASH ALONE IS NOT ENOUGH, and this is easy to get wrong: robots.txt
 * matches on prefix, so `Disallow: /admin/` covers /admin/settings and leaves
 * `/admin` ITSELF crawlable. Dropping the slash instead over-corrects — a bare
 * `Disallow: /account` would also block a future /accountants, which
 * isPrivatePath deliberately treats as public.
 *
 * So: `$` for the address exactly, the slash for everything beneath it,
 * and `?` for the same address with a query (robots matches the query too).
 * That is the same whole-segment rule isPrivatePath applies, said in the syntax
 * robots.txt has for it.
 */
function disallowFor(path: string): string[] {
  if (path.endsWith("/")) return [path];
  return [`${path}$`, `${path}/`, `${path}?`];
}

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_PATHS.flatMap(disallowFor),
    },
    // Only when there is a real address. A relative sitemap line is invalid and
    // would make the whole file suspect.
    ...(origin ? { sitemap: new URL("/sitemap.xml", origin).toString(), host: origin.host } : {}),
  };
}
