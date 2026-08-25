/**
 * Which front door a request came through — the pure, header-free half.
 *
 * THIS FILE IMPORTS NOTHING. It holds the brand facts and the host test that a
 * client component (Navbar, Footer), the edge middleware, and the server all
 * need. lib/site-brand.ts adds the request-time reads (headers, the proxy
 * brand header) on top, and re-exports everything here — so anything wanting
 * the header-based helpers still imports "@/lib/site-brand" as before, and only
 * the two callers that may NOT pull in next/headers (a "use client" component,
 * and middleware) import this core directly.
 */

export type SiteBrand = "kosher" | "itineraries";

/** The host fragment that marks the itineraries front door. */
export const ITINERARIES_HOST = "whitegloveitineraries";

export const BRAND_ORIGIN: Record<SiteBrand, string> = {
  kosher: "https://www.whiteglovekoshertravel.com",
  itineraries: "https://www.whitegloveitineraries.com",
};

/**
 * Every real hostname a brand is actually reached on — the bare domain and
 * its "www." form, both pointed at the same app. Compile-time constants, not
 * read from any request, so lib/secure-access.ts can compare an untamperable
 * Origin header against them without trusting anything a proxy forwarded.
 */
export const BRAND_HOSTS: Record<SiteBrand, readonly string[]> = {
  kosher: ["www.whiteglovekoshertravel.com", "whiteglovekoshertravel.com"],
  itineraries: ["www.whitegloveitineraries.com", "whitegloveitineraries.com"],
};

/**
 * The brand this DEPLOYMENT serves, when it only ever serves one.
 *
 * WHY THIS EXISTS. The navigation rendered as kosher and corrected itself from
 * the hostname after mount, on the stated grounds that reading the host on the
 * server would turn every static page dynamic. That was a real trade when one
 * deployment answered both domains. This one answers exactly one — it is the
 * service behind whitegloveitineraries.com — so it can simply be told which,
 * and be right in the markup it sends rather than a frame later.
 *
 * A visitor here was served White Glove Kosher Travel and shown it change.
 * Anything reading the HTML — a search engine, a link preview — never saw it
 * change at all.
 *
 * Unset means "work it out from the host", which is what happened before, so a
 * deployment that does not set it is no worse off than it was.
 */
export function configuredBrand(): SiteBrand | null {
  const value = process.env.NEXT_PUBLIC_SITE_BRAND?.trim().toLowerCase();
  return value === "itineraries" || value === "kosher" ? value : null;
}

export const BRAND_NAME: Record<SiteBrand, string> = {
  kosher: "White Glove Kosher Travel",
  itineraries: "White Glove Itineraries",
};

/** The bare domain a brand is credited by, on printed and shared documents. */
export const BRAND_DOMAIN: Record<SiteBrand, string> = {
  kosher: "whiteglovekoshertravel.com",
  itineraries: "whitegloveitineraries.com",
};

/** The brand a host belongs to. Anything unrecognised is the kosher default. */
export function brandForHost(host?: string | null): SiteBrand {
  return host && host.toLowerCase().includes(ITINERARIES_HOST) ? "itineraries" : "kosher";
}

export function isItinerariesHost(host?: string | null): boolean {
  return brandForHost(host) === "itineraries";
}

/**
 * The header a front proxy sets to name the brand when it has had to rewrite the
 * Host to route the request. Kept here so the code, the middleware and the proxy
 * rule agree on the spelling.
 */
export const BRAND_HEADER = "x-wg-brand";

/** A brand named outright by the proxy header, or null when it says nothing we know. */
function brandFromHeader(value?: string | null): SiteBrand | null {
  const v = value?.trim().toLowerCase();
  return v === "itineraries" || v === "kosher" ? v : null;
}

type HeaderBag = { get(name: string): string | null };

/**
 * The brand for a request, from its headers: the explicit proxy header first,
 * then the Host. The header is only consulted when it names a brand we know, so
 * an absent or garbled one falls straight through to the Host as before. Header
 * bag only (no next/headers), so the edge middleware can call it too.
 */
export function brandFromRequestHeaders(h: HeaderBag): SiteBrand {
  return brandFromHeader(h.get(BRAND_HEADER)) ?? brandForHost(h.get("host"));
}
