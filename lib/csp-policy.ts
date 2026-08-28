/**
 * The Content-Security-Policy, in one place. It enforces now.
 *
 * HOW IT GOT HERE SAFELY. Every directive below was first run as
 * Content-Security-Policy-Report-Only — blocking nothing, only reporting what
 * an enforcing version would have stopped — through real use of the maps, the
 * booking search and the card form. When those reports went silent (see the
 * host list below for the few surprises they turned up), the header in
 * next.config.ts dropped "-Report-Only" and this policy began to enforce. It
 * still carries report-uri, so a block is reported as well as made.
 *
 * WHAT IS ALLOWED, AND WHY EACH IS HERE. The list was built by reading every
 * script, iframe, image source and browser fetch in the app (not the citation
 * links or the server-side API calls, which a browser policy does not govern):
 *
 *   - 'self' everywhere: the site's own code, styles, photos (/api/media) and
 *     every /api call.
 *   - 'unsafe-inline' on script and style: Next's App Router ships an inline
 *     bootstrap script on every page, and inline style attributes are
 *     everywhere in the markup and injected by Google Maps and Leaflet.
 *     Tightening this to nonces is a later, separate pass — it needs the
 *     middleware to stamp a nonce per request and is not free to get wrong.
 *   - emrldco.com: the Travelpayouts verification snippet in the root layout.
 *   - tp.media: the Travelpayouts search-form script injected on /embed/*.
 *   - maps.googleapis.com + the Google static hosts: the map script and the
 *     tiles, imagery and fonts it pulls at runtime.
 *   - *.tile.openstreetmap.org: the Leaflet area map's tiles.
 *   - photon.komoot.io: the address box's autocomplete, called from the browser.
 *   - the Duffel / Stripe / Evervault / Mapbox hosts: the admin card-entry
 *     form (/admin/duffel/review) tokenises a card through them. This is the
 *     hand-off the old next.config note warned a careless policy would break,
 *     and the single strongest reason to learn from Report-Only first.
 *
 * 'unsafe-eval' IS DELIBERATELY ABSENT. Google Maps has historically wanted it
 * and may still; leaving it out is not an oversight but the question this phase
 * exists to answer — if the reports show script-src blocking eval on a map
 * page, it goes in before enforcing, and if they do not, it never does.
 *
 * The two unknowns — the exact hosts the Travelpayouts widget and the Duffel
 * form open once running — carry best guesses here. A report naming a host not
 * in this list is the signal; that is what we are here to collect.
 */

const GOOGLE_STATIC = [
  "https://maps.gstatic.com",
  "https://*.gstatic.com",
  "https://*.googleapis.com",
  "https://*.google.com",
  "https://*.ggpht.com",
  "https://khms0.googleapis.com",
  "https://khms1.googleapis.com",
  "https://streetviewpixels-pa.googleapis.com",
];

const TRAVELPAYOUTS = [
  "https://tp.media",
  "https://*.travelpayouts.com",
  "https://*.aviasales.com",
  "https://*.aviasales.ru",
  "https://*.localrent.com",
];

/**
 * What the Report-Only pass caught the Travelpayouts widget actually doing.
 *
 * These were not in the source and could only be watched: the Emerald
 * verification snippet (emrldco.com) phones home with a background request,
 * the Aviasales flight widget reports its own errors to Sentry (sentry.avs.io)
 * and carries Google's ad network with it (doubleclick, googlesyndication).
 * None of it is White Glove's — it is the partner's widget behaviour, and it
 * is allowed so that switching the policy to enforcing does not break the
 * search the widget is there to provide. It rides only on the booking flow;
 * nothing on the rest of the site calls these.
 */
const WIDGET_RUNTIME = [
  "https://emrldco.com",
  "https://sentry.avs.io",
  "https://*.doubleclick.net",
  "https://*.googlesyndication.com",
];

const DUFFEL_CARD = [
  "https://api.duffel.com",
  "https://api.duffel.cards",
  "https://assets.duffel.com",
  "https://js.stripe.com",
  "https://api.stripe.com",
  "https://js.evervault.com",
  "https://api.evervault.com",
  "https://*.evervault.com",
  "https://api.mapbox.com",
];

const dedupe = (values: string[]) => [...new Set(values)];

/**
 * Build the policy string. `reportPath` is where violations are posted.
 *
 * report-uri is the widely supported one; report-to names a group that the
 * Reporting-Endpoints header (set beside this one) defines, for the newer
 * browsers that have dropped report-uri. Both point at the same endpoint.
 */
export function contentSecurityPolicy(reportPath: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "form-action": ["'self'", ...TRAVELPAYOUTS, ...DUFFEL_CARD],
    "script-src": dedupe([
      "'self'",
      "'unsafe-inline'",
      "https://emrldco.com",
      "https://tp.media",
      "https://maps.googleapis.com",
      ...GOOGLE_STATIC,
      ...DUFFEL_CARD,
    ]),
    // A third-party component — the card form or the widget — pulls a Google
    // Fonts stylesheet (reported as style-src-elem). The font files it names
    // live on fonts.gstatic.com, allowed under font-src below.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": dedupe([
      "'self'",
      "data:",
      "blob:",
      "https://*.tile.openstreetmap.org",
      "https://maps.googleapis.com",
      ...GOOGLE_STATIC,
      ...TRAVELPAYOUTS,
      "https://api.mapbox.com",
    ]),
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": dedupe([
      "'self'",
      "https://photon.komoot.io",
      "https://maps.googleapis.com",
      ...GOOGLE_STATIC,
      ...TRAVELPAYOUTS,
      ...WIDGET_RUNTIME,
      ...DUFFEL_CARD,
    ]),
    "frame-src": dedupe([
      "'self'",
      ...TRAVELPAYOUTS,
      "https://js.stripe.com",
      "https://*.evervault.com",
      "https://api.duffel.cards",
    ]),
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const body = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

  /**
   * A VALUELESS DIRECTIVE THAT FIXES A REAL BLOCK.
   *
   * The Travelpayouts verification snippet loads from https://emrldco.com,
   * which the policy allows — and that script then asks for a second file of
   * its own over PLAIN http, from the same host. A browser blocks an insecure
   * script on a secure page whatever the policy says, so this was failing for
   * every visitor and reported to the sink as a script-src violation against a
   * host the policy already trusts, which reads as a misconfiguration here and
   * is not one.
   *
   * upgrade-insecure-requests rewrites http to https before the source is
   * checked, so the partner's own second file loads from the host already
   * allowed. It takes no argument and widens nothing: every host in the lists
   * above is https already, and this cannot admit one that is not.
   */
  return `${body}; upgrade-insecure-requests; report-uri ${reportPath}; report-to csp`;
}

/** The report group named by the policy's report-to, declared in its own header. */
export function reportingEndpointsHeader(reportPath: string): string {
  return `csp="${reportPath}"`;
}
