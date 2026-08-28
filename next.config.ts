import type { NextConfig } from "next";
import { contentSecurityPolicy, reportingEndpointsHeader } from "./lib/csp-policy";

const nextConfig: NextConfig = {
  // The site advertised its framework and version on every response, for no
  // reason a visitor benefits from.
  poweredByHeader: false,

  /**
   * The response headers a browser needs to be told, since it assumes the
   * unsafe answer for every one of them by default. The site sent none.
   *
   * DELIBERATELY NOT A CONTENT-SECURITY-POLICY. That is the valuable one and
   * it is the one that breaks things: the booking pages load partner scripts
   * (Travelpayouts, Stay22, Localrent, Aviasales) and the map loads Google and
   * OpenStreetMap, and a policy written without testing every one of those
   * hand-offs takes the booking flow down quietly. CSP is its own piece of
   * work, with its own testing pass. Deferred, not dropped.
   *
   * SAMEORIGIN RATHER THAN DENY, and this matters: /book shows the partner
   * search forms by iframing our own /embed, /embed/cars and /embed/flights
   * (components/PartnerSearchWidget). DENY would blank those three panels and
   * the failure would look like a broken partner rather than a header.
   *
   * The permissions list ALLOWS microphone, camera and geolocation for this
   * origin only (`=(self)`), and switches nothing off blanketly. All three are
   * things the companion app's chat now does: a voice note records the mic, the
   * camera takes a photo, and a shared location reads geolocation. A blanket
   * `microphone=()` / `camera=()` — which this header used to carry, back when
   * nothing on the site used either — makes getUserMedia throw NotAllowedError
   * inside the native app no matter what the OS has granted, so the voice-note
   * button failed with the OS permission sitting there enabled. Self, not `*`,
   * so only our own pages may ask, and the browser still prompts the person.
   * `payment` is deliberately absent from the list: Duffel's card component
   * handles card entry, and switching that capability off is not a guess worth
   * making.
   *
   * THE CSP IS HERE NOW, AND IT ENFORCES. The note above used to say a
   * Content-Security-Policy was deferred because it is the header that breaks
   * the booking and card flows if written blind. So it was written and run as
   * Content-Security-Policy-Report-Only first — blocking nothing, only
   * reporting what an enforcing version would have stopped — until the reports
   * from real use of the maps, the booking search and the card form went
   * silent. They did (the widget's ad and error hosts and a Google Fonts
   * stylesheet were the only surprises, all now in lib/csp-policy.ts), so the
   * header lost "-Report-Only" and now enforces.
   *
   * REPORTING STAYS ON. The policy still carries report-uri / report-to, so a
   * resource that is ever blocked — on a page the report-only pass did not
   * happen to exercise — is both stopped AND reported, landing on the admin
   * Security screen rather than failing in silence. Reporting-Endpoints
   * declares the group the policy's report-to names, for browsers that dropped
   * report-uri. Rolling back is one word: put "-Report-Only" back on the key.
   */
  async headers() {
    const CSP_REPORT_PATH = "/api/csp-report";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Cross-origin requests still carry the origin, so partner
          // attribution that reads a referrer keeps working; the path a
          // visitor was reading does not leave the site.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          { key: "Reporting-Endpoints", value: reportingEndpointsHeader(CSP_REPORT_PATH) },
          { key: "Content-Security-Policy", value: contentSecurityPolicy(CSP_REPORT_PATH) },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // /planning and /services were two pages about done-for-you trip
      // planning, and that offer was removed from the site outright (commit
      // "Remove personal trip planning from the site outright", and AGENTS.md
      // — it is not coming back). /services went with it.
      //
      // WHICH LEFT /planning REDIRECTING TO A 404: the old address kept its
      // promise to keep working and landed on a page that no longer existed.
      // Both now point at the planner the site actually offers, so an old
      // bookmark or a search result reaches a working page rather than a dead
      // end. Permanent, so the ranking carries across.
      //
      // These are redirects, not an offer: /plan gives recommendations and
      // the visitor does the planning. Nothing here restores a service.
      { source: "/planning", destination: "/plan", permanent: true },
      { source: "/services", destination: "/plan", permanent: true },
      // /cemeteries/heritage was a separate index for the Nesiya Tova locator
      // set. It is folded into /cemeteries now — one cemetery page holding the
      // curated grounds and the heritage locator together — so the old index
      // address redirects there. The per-cemetery pages at
      // /cemeteries/heritage/<slug> are unaffected: this matches the index path
      // alone, not its children.
      { source: "/cemeteries/heritage", destination: "/cemeteries", permanent: true },
      // The same story, for the same reason. /book and /booking were two
      // travel-booking pages: different headings ("Book with cash, or with
      // miles" and "Flights & hotels"), different search components, two
      // versions of the same flow to keep working. The polished navigation
      // pointed at one, the destination pages at the other. /book is the
      // canonical one now — it can do everything /booking could — and the old
      // addresses redirect permanently so links in the wild carry across
      // rather than looking like a second, competing page.
      { source: "/booking", destination: "/book", permanent: true },
      // /book/review was the Duffel checkout. Duffel takes a card and issues a
      // ticket, which is a different business from sending somebody to a
      // partner, so it moved to /admin/duffel and off the public site
      // entirely. The two old public addresses land on the booking page rather
      // than on a 404: somebody following a stale link wanted to book travel,
      // and that is still here.
      { source: "/booking/review", destination: "/book", permanent: true },
      { source: "/book/review", destination: "/book", permanent: true },
      // "Getaways" was one editable hero block and nothing under it, on a
      // page whose name told a vacation customer very little. It became
      // /vacation-ideas and is /destinations now — a real hub over the
      // destinations the site holds data for — and both old addresses carry
      // their links and their ranking across rather than competing with it.
      //
      // The CMS still knows the page by the slug "getaways", deliberately:
      // renaming the key would have thrown away whatever the owner has
      // already written there, for a cosmetic tidy. See app/destinations.
      // Phone and hotspot RENTALS are not a business this site is in — they
      // need a physical counter somewhere, and the owner has decided against
      // it. The page claimed four services under "What we arrange" and none of
      // them were arranged. The eSIM half is real and now has its own page, so
      // that is where the address goes — the closest thing to what somebody
      // following an old link was looking for.
      { source: "/phone-rentals", destination: "/esim", permanent: true },
      { source: "/getaways", destination: "/destinations", permanent: true },
      // The vacation hub took the word "Destinations" in the navigation, so it
      // took the address to match. A visitor pressing an item called
      // Destinations and landing on /vacation-ideas is a small lie about what
      // the site is, and the two names would have to be explained for ever.
      //
      // These two are safe as wildcards because nothing else lives under
      // /vacation-ideas. The heritage half of the same rename is NOT a
      // wildcard and cannot be — see lib/route-migration.ts and middleware.ts.
      { source: "/vacation-ideas", destination: "/destinations", permanent: true },
      { source: "/vacation-ideas/:slug", destination: "/destinations/:slug", permanent: true },
      // Two pages renamed to what the navigation calls them. "Kosher stays"
      // described the record; "Hotels & Stays" is what somebody is looking
      // for, and the page is about to become a search rather than a list.
      // "Attractions" is a word from a guidebook.
      // A page that said, in its own words, that it was being built. It
      // promised a premium honeymoon service, listed six things that service
      // would include, and offered a quote — none of which existed. "Couples
      // and honeymoon" is a real filter over destinations this site holds
      // records for, so that is where the address goes.
      { source: "/honeymoon", destination: "/destinations?kind=couples", permanent: true },
      { source: "/kosher-stays", destination: "/hotels", permanent: true },
      // /flights was a flight search and two "before you book" cards, all of
      // which /book already does under its Flights tab — with miles as well as
      // cash. Keeping both meant two pages running the same partner handoff,
      // and the navigation had already stopped pointing at this one. The
      // address redirects permanently so old links and any ranking carry
      // across to the page that does the work.
      { source: "/flights", destination: "/book", permanent: true },
      // /cars went the same way, and kept the one thing it had that the
      // booking page did not: the destination pages link with the place
      // already filled in, so the search opens on it rather than asking a
      // visitor who has just been told the site knows where they are going.
      // The tab is named in the query string; ?destination= carries across on
      // the links that had it. See app/book/page.tsx.
      { source: "/cars", destination: "/book?type=cars", permanent: true },
      { source: "/attractions", destination: "/things-to-do", permanent: true },
      // /flight-booking-assistance was the done-for-you flight offer — "Ask a
      // person", "Send what you have and a person picks it up". That offer was
      // removed from the site outright, and this was the last page still
      // making it; it was also the resolved fallback for every Flights /
      // Hotels / Cars link whenever the search was locked, so it could become
      // the whole booking journey without anybody choosing that. The fallback
      // now goes to Contact (lib/booking-access.ts) and the address goes to
      // the search that does the work, so an old link lands somewhere that can
      // still book a flight.
      { source: "/flight-booking-assistance", destination: "/book?type=flights", permanent: true },
      // Lizhensk was a hand-built page at /lizensk while every other guided
      // town rendered from the shared route at /uman, /belz, /sanz. It is an
      // ordinary town guide now, at the spelling the cemetery listing, the
      // destination record and the search aliases have always used — so
      // /lizhensk stops 404ing and /lizensk keeps working for the sitemap
      // entry, any bookmark and whatever ranking it had.
      { source: "/lizensk", destination: "/lizhensk", permanent: true },
    ];
  },
};

export default nextConfig;
