import { toCanonicalAdminPath } from "@/lib/admin-host";

// Six primary destinations. Specialized screens remain in their groups and search.

export type AdminSection = {
  /** The nav item's own path. */
  href: string;
  label: string;
  /** A one-line answer to "what is this for". */
  blurb: string;
  /** Simple inline mark — no icon font, no dependency. */
  icon: string;
  /** Screens that belong to this section, shown when you are inside it. */
  children?: Array<{ href: string; label: string; blurb: string; keywords?: string }>;
  /** Extra words the "go to" search should match. */
  keywords?: string;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: "/admin",
    label: "Dashboard",
    blurb: "What needs you today.",
    icon: "◆",
    keywords: "dashboard overview start home",
  },
  {
    href: "/admin/imports/needs-review",
    label: "Needs Review",
    blurb: "One candidate at a time.",
    icon: "◇",
    keywords: "queue verify approve reject duplicate import candidate",
  },
  {
    href: "/admin/pages",
    label: "Pages",
    blurb: "Words, pictures and reports.",
    icon: "▤",
    keywords: "text copy wording edit heading intro publish draft page inventory content photo picture image upload submission report analytics searches visits demand looking history changed edit undo revision who growth conversion alerts newsletter signup affiliate clicks send email blast update subscribers unsubscribe",
    children: [
      { href: "/admin/pages", label: "All pages", blurb: "Every page you can edit." },
      { href: "/admin/reports", label: "Reports", blurb: "Which empty pages people open." },
      { href: "/admin/growth", label: "Growth", blurb: "Searches, clicks and conversion." },
      { href: "/admin/alerts", label: "Alerts", blurb: "Destination and seasonal signups." },
      { href: "/admin/alerts/send", label: "Send an update", blurb: "Write to the people who asked." },
      { href: "/admin/content", label: "Suggestions", blurb: "Corrections people sent in." },
      { href: "/admin/photos", label: "Photos", blurb: "Pictures waiting for you." },
      { href: "/admin/ratings", label: "Ratings", blurb: "Reviews and private ratings.", keywords: "rating review report flag moderate" },
      { href: "/admin/inventory", label: "Checklist", blurb: "What is still unfinished." },
    ],
  },
  {
    href: "/admin/directory",
    label: "Directory",
    blurb: "Places and listings.",
    icon: "▣",
    keywords: "destination holiday vacation getaway cemetery kever shomer phone accommodation hotel provider listing town city country countries hechsher kashrus kosher supervision teudah mikvah mikvaos shul minyan zmanim border crossing frontier import batch source attribution review candidate duplicate publish queue needs review awaiting verification deleted removed restore undo bin trash airport flight metro planner assumptions driving day add entry attraction things to do stay food",
    children: [
      { href: "/admin/directory", label: "Everything", blurb: "One list of every entry." },
      { href: "/admin/add", label: "Add", blurb: "A cemetery, a tzadik, or a new page." },
      { href: "/admin/kevarim", label: "Tzaddikim", blurb: "Who is buried where.", keywords: "kever kevarim tzadik cemetery beis hachaim" },
      { href: "/admin/shomrim", label: "Shomrim", blurb: "Getting into a cemetery." },
      { href: "/admin/destinations", label: "Heritage towns", blurb: "Towns with kevarim in them.", keywords: "town city heritage kever kevarim shomer lizhensk kerestir uman" },
      { href: "/admin/vacation-destinations", label: "Vacation destinations", blurb: "Where to go on holiday.", keywords: "destination holiday vacation rome venice florence paris dolomites getaway trip beach mountains photos pictures" },
      { href: "/admin/directory/attractions", label: "Things to do", blurb: "Attractions already listed." },
      { href: "/admin/directory/stays", label: "Where to stay", blurb: "Lodging already listed.", keywords: "hotel hotels lodging accommodation" },
      { href: "/admin/kosher-apartments", label: "Kosher apartments", blurb: "Sites and hosts renting kosher apartments." },
      { href: "/admin/directory/food", label: "Kosher food", blurb: "Food listings on the site." },
      { href: "/admin/countries", label: "Countries", blurb: "Country notes." },
      { href: "/admin/airports", label: "Airports", blurb: "Flight search and the planner." },
      { href: "/admin/planner", label: "Planner", blurb: "How a day is judged packed." },
      { href: "/admin/imports", label: "Bulk imports", blurb: "Source-backed listing candidates.", keywords: "bulk import batch source pack trello" },
      { href: "/admin/imports/needs-review", label: "Needs review", blurb: "Candidates awaiting verification." },
      { href: "/admin/imports/trello", label: "Trello cards", blurb: "Editorial candidates on the board." },
      { href: "/admin/borders", label: "Borders", blurb: "Crossings, hours and notes." },
      { href: "/admin/hechsherim", label: "Hechsherim", blurb: "Who certifies each kosher place." },
      { href: "/admin/mikvaos", label: "Mikvaos", blurb: "Mikvah listings across towns.", keywords: "mikvah mikvaos" },
      { href: "/admin/eruvin", label: "Eruvin", blurb: "Add community eruvin to the public page." },
      { href: "/admin/shuls", label: "Shuls", blurb: "Add shuls that belong to no town.", keywords: "shul synagogue minyan" },
      { href: "/admin/heritage-cemeteries", label: "Heritage cemeteries", blurb: "Add batei hachaim to the locator and map." },
      { href: "/admin/directory/businesses", label: "Businesses", blurb: "Operators, planners, guides.", keywords: "provider contact business operator guide" },
      { href: "/admin/directory-listings", label: "Listings", blurb: "Drivers and agencies in the store." },
      { href: "/admin/recycle", label: "Deleted", blurb: "Put something back." },
    ],
  },
  {
    href: "/admin/advertisements",
    label: "Advertisements",
    blurb: "Banners and promotions.",
    icon: "◈",
    keywords: "ads promotion banner popup sponsor campaign",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    blurb: "Access, money and connections.",
    icon: "⚙",
    keywords: "password lock closed open account admin team finance email maps ai technical advanced referral membership collaboration group voting plus earnings partners travel essentials insurance esim transfer tours words headline footer about profile proof case study limits free account trello board duffel flight ticket search book stays flight itinerary itineraries sell private customer send pdf amazon gear blech hotplate shelf products provider providers routestack stay22 travelpayouts car rental hire compare health sandbox security csp content policy report only block allow load rule",
    children: [
      { href: "/admin/settings", label: "Overview", blurb: "All settings in one place." },
      { href: "/admin/settings/words", label: "Words", blurb: "Headline, contact line and footer." },
      { href: "/admin/settings/about", label: "About", blurb: "Optional About page fields." },
      { href: "/admin/settings/proof", label: "Case studies", blurb: "Trip outcomes with permission." },
      { href: "/admin/settings/limits", label: "Limits", blurb: "Trip and print limits." },
      { href: "/admin/settings/plans", label: "Paid plans", blurb: "Whether they are offered, and how." },
      { href: "/admin/history", label: "Audit log", blurb: "Edits, and how to undo them.", keywords: "history audit change undo revision" },
      { href: "/admin/team", label: "Team", blurb: "Who else can get in." },
      { href: "/admin/settings/website", label: "Website access", blurb: "Open or close the site." },
      { href: "/admin/settings/passwords", label: "Passwords", blurb: "Change the codes." },
      { href: "/admin/settings/security", label: "Security policy", blurb: "The load rule, and what it blocks." },
      { href: "/admin/settings/trello", label: "Trello", blurb: "Pictures, listings and reports." },
      { href: "/admin/accounts", label: "Users", blurb: "People who signed up.", keywords: "account user visitor signup" },
      { href: "/admin/messages", label: "Messages", blurb: "What people wrote from the site." },
      {
        href: "/admin/settings/travel-gear",
        label: "Travel gear",
        blurb: "The Amazon shelf.",
      },
      // TRAVEL ESSENTIALS IS NOT LISTED HERE, and that is the finished half of
      // a move somebody left half-done. The cards — insurance, eSIM, transfers,
      // tours — are a section of "What the site earns" now, because two screens
      // answering "is this site earning, and where" meant whichever one you
      // opened looked complete on its own. The old address still exists and
      // redirects to that section, for a bookmark or the admin's own history;
      // a menu entry pointing at a redirect is a different thing, and it was
      // still here, sending anybody who used it bouncing.
      { href: "/admin/travel", label: "Travel providers", blurb: "Who supplies flights, hotels and cars." },
      {
        href: "/admin/settings/earnings",
        label: "Earnings",
        blurb: "Searches, partners and placements.",
      },
      { href: "/admin/settings/referral", label: "Referrals", blurb: "Off until rewards are final." },
      { href: "/admin/settings/collaboration", label: "Collaboration", blurb: "Voting, favorites and rooms." },
      { href: "/admin/settings/membership", label: "White Glove Plus", blurb: "Planned only — not launched." },
      { href: "/admin/finances", label: "Finances", blurb: "Money in and out.", keywords: "finance finances payment refund money" },
      { href: "/admin/settings/connections", label: "Connections", blurb: "Email, maps and the assistant.", keywords: "email integration maps ai" },
      { href: "/admin/duffel", label: "Duffel", blurb: "Book flights here. Not public." },
      { href: "/admin/flight-itineraries", label: "Flight itineraries", blurb: "Write up flights you sell to send a customer." },
    ],
  },
];

/** Which of the five you are currently inside. */
/**
 * The path as this file writes it, whichever hostname you are on.
 *
 * On the admin hostname the bare path IS the screen — admin.…/settings is
 * Settings — so `usePathname()` gives "/settings" while every href in this
 * file reads "/admin/settings". Without this the two never match, and the
 * navigation highlight sits on Home no matter where you are.
 *
 * The same transform the middleware does, in the other direction.
 */
export function toAdminPath(pathname: string): string {
  return toCanonicalAdminPath(pathname);
}

/**
 * A link, written for the hostname you are on.
 *
 * On the admin hostname the whole point is that `/admin` is not needed, so
 * carrying it in every link undoes that — you sign in at admin.…/ and every
 * click puts you back on admin.…/admin/settings.
 *
 * Which hostname you are on is read off the current path rather than from a
 * variable: if the path you are already on does not start with /admin, you are
 * being served bare paths, so the links should be bare too. That needs nothing
 * configured in the browser and cannot disagree with the middleware.
 */
export function adminHref(href: string, pathname: string): string {
  if (pathname.startsWith("/admin")) return href;
  return href.replace(/^\/admin/, "") || "/";
}

export function activeSection(pathname: string): AdminSection {
  // Longest match first, so /admin/settings/passwords lands on Settings rather
  // than Home, and /admin alone still lands on Home.
  const byLength = [...ADMIN_SECTIONS].sort((a, b) => b.href.length - a.href.length);
  return (
    byLength.find((s) => s.href !== "/admin" && (pathname === s.href || pathname.startsWith(`${s.href}/`))) ??
    byLength.find((s) => s.children?.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))) ??
    ADMIN_SECTIONS[0]
  );
}

/** Screens inside a section, not including the section’s own front page. */
export function sectionScreens(sectionHref: string): Array<{ href: string; label: string; blurb: string; keywords?: string }> {
  const section = ADMIN_SECTIONS.find((item) => item.href === sectionHref);
  return (section?.children ?? []).filter((child) => child.href !== sectionHref);
}

/** Everything the "go to" box can jump to. */
export function allAdminDestinations(): Array<{ href: string; label: string; blurb: string; section: string; keywords: string }> {
  const out: Array<{ href: string; label: string; blurb: string; section: string; keywords: string }> = [];
  const seen = new Set<string>();
  for (const section of ADMIN_SECTIONS) {
    if (!seen.has(section.href)) {
      seen.add(section.href);
      out.push({ href: section.href, label: section.label, blurb: section.blurb, section: section.label, keywords: section.keywords ?? "" });
    }
    for (const child of sectionScreens(section.href)) {
      if (seen.has(child.href)) continue;
      seen.add(child.href);
      out.push({ href: child.href, label: child.label, blurb: child.blurb, section: section.label, keywords: child.keywords ?? "" });
    }
  }
  return out;
}

/**
 * Where you are, as a trail.
 *
 * The admin has five sections and about twenty screens, and several of them
 * look alike once you are two clicks in — "Everything", "Towns" and "Kevarim"
 * are all lists of places. A trail says which list you are looking at without
 * having to recognise it.
 *
 * The last crumb is the page itself and carries no link: a link to where you
 * already are is a dead control.
 */
export type Crumb = { label: string; href?: string };

export function adminBreadcrumbs(pathname: string): Crumb[] {
  const here = toAdminPath(pathname);
  const home: Crumb = here === "/admin" ? { label: "Dashboard" } : { label: "Dashboard", href: "/admin" };
  if (here === "/admin") return [home];

  const section = activeSection(here);
  const child = [...(section.children ?? [])]
    .filter((c) => here === c.href || here.startsWith(`${c.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const trail: Crumb[] = [home];
  if (section.href !== "/admin") {
    // The section itself is only a link when it is not where we have ended up.
    trail.push(section.href === here ? { label: section.label } : { label: section.label, href: section.href });
  }
  if (child && child.href !== section.href) {
    trail.push(child.href === here ? { label: child.label } : { label: child.label, href: child.href });
  }

  // A screen the nav does not list — /admin/settings/passwords, say, when it
  // is not a child anywhere. Name it from its own path rather than leaving the
  // trail claiming you are on the section's front page.
  const last = trail[trail.length - 1];
  if (last.href !== undefined || trail.length === 1) {
    const tail = here.split("/").filter(Boolean).pop();
    if (tail && tail !== "admin") {
      trail.push({ label: tail.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) });
    }
  }
  return trail;
}

/**
 * The things worth being one click from anywhere.
 *
 * Not everything that can be added — the ones somebody actually reaches for
 * mid-task, when they have just been given a phone number or told about a
 * place. A long menu here would be a second navigation.
 */
export const ADMIN_QUICK_ADD: Array<{ href: string; label: string }> = [
  { href: "/admin/add", label: "Add" },
  { href: "/admin/kevarim", label: "Kever" },
  { href: "/admin/destinations", label: "Heritage town" },
  { href: "/admin/shomrim", label: "Shomer" },
  { href: "/admin/directory/businesses", label: "Business" },
  { href: "/admin/advertisements", label: "Advert" },
  { href: "/admin/pages", label: "Page" },
];

/** The label for a path, for the recently-visited list. */
export function adminLabelFor(pathname: string): string {
  const here = toAdminPath(pathname);
  const crumbs = adminBreadcrumbs(here);
  return crumbs[crumbs.length - 1]?.label ?? here;
}
