/**
 * THE ONE ADDRESS THIS SITE SAYS IT IS — and it has a "www." on it.
 *
 * THIS DEPLOYMENT SERVES whitegloveitineraries.com. The constant named the
 * kosher domain, which is the site this one was forked from and is not the
 * site this one is.
 *
 * BOTH HOSTS ANSWER, AND NEITHER REDIRECTS. whitegloveitineraries.com and
 * www.whitegloveitineraries.com are both attached to the same service and both
 * return 200 — verified, not assumed. So the two hosts really do serve the same
 * pages, and the canonical tag is the only thing telling a search engine which
 * of them to index. Both hosts now name this one, which is what consolidates
 * them; without it the site competes with itself.
 *
 * WWW RATHER THAN THE BARE DOMAIN, DELIBERATELY. Either would do if the site
 * said the same thing everywhere, and www is the more flexible host long run —
 * it can be a CNAME, and a cookie set on it does not leak to every subdomain.
 * If that is ever reversed, change this and change the DNS in the same breath.
 * They are one decision, not two.
 *
 * MOST CALLERS TREAT THIS AS A FALLBACK — siteOrigin() wins wherever
 * NEXT_PUBLIC_SITE_URL is set. Two do not, and those were printing kosher
 * addresses on an itineraries screen: the admin shell's link back to the site,
 * and the share link beside a flight itinerary, which is a URL somebody hands
 * to a traveller. It also decides which apex canonicalise() rewrites to its www
 * form, so with the old value a bare NEXT_PUBLIC_SITE_URL for this domain was
 * left alone while the other domain's was corrected.
 *
 * IT LIVES IN ITS OWN FILE so the admin shell — a client component — can name
 * the host without pulling lib/seo, and its build-time warning, into the
 * browser bundle. Nothing here has a side effect.
 */
export const CANONICAL_ORIGIN = "https://www.whitegloveitineraries.com";
