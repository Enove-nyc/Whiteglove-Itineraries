// An independent, public Mainstream tool temporarily hosted by White Glove.
// This path is deliberately absent from navigation and the sitemap.
export const MAINSTREAM_PATH = "/m-7k4m9q2x8p";

export function isMainstreamPath(pathname: string): boolean {
  return pathname === MAINSTREAM_PATH || pathname.startsWith(`${MAINSTREAM_PATH}/`);
}

// Only this standalone page needs GeoSearch; the travel site's policy is unchanged.
export const MAINSTREAM_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://geosearch.planninglabs.nyc",
  "font-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join("; ");
