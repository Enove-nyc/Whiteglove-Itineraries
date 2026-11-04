export type InventoryStatus = "complete" | "partial" | "not-started" | "broken" | "verify" | "mobile";

export type InventoryArea = "Public page" | "Admin page" | "API route" | "Cross-site issue";

export type InventoryItem = {
  id: string;
  area: InventoryArea;
  route: string;
  title: string;
  status: InventoryStatus;
  priority: "High" | "Medium" | "Low";
  missing: string;
  nextAction: string;
};

export const inventoryStatuses: Array<{ value: InventoryStatus; label: string }> = [
  { value: "not-started", label: "Not completed" },
  { value: "partial", label: "Partially complete" },
  { value: "broken", label: "Broken / blocked" },
  { value: "verify", label: "Needs verification" },
  { value: "mobile", label: "Needs mobile repair" },
  { value: "complete", label: "Completed" },
];

export const inventoryItems: InventoryItem[] = [
  {
    "id": "page-home",
    "area": "Public page",
    "route": "/",
    "title": "Homepage",
    "status": "verify",
    "priority": "High",
    "missing": "Final acceptance on the reported Android tablet; browser search, licensed section photographs and responsive layouts are already implemented.",
    "nextAction": "Confirm the signed Android search build on the affected tablet. Keep itinerary building and booking on the website."
  },
  {
    "id": "page-stops",
    "area": "Public page",
    "route": "/stops",
    "title": "Destination directory",
    "status": "verify",
    "priority": "High",
    "missing": "Ongoing factual and last-checked-date review of destination content, rather than a missing directory implementation.",
    "nextAction": "Use the existing destination editors and data-health queue to verify time-sensitive information. Do not expose internal research labels to travelers."
  },
  {
    "id": "page-city",
    "area": "Public page",
    "route": "/[city]",
    "title": "City guide template",
    "status": "verify",
    "priority": "High",
    "missing": "Record-level checking of access details, shomer contacts, food, minyanim and other time-sensitive information.",
    "nextAction": "Use the existing verification/source/date fields. Publish checked facts and keep optional empty sections hidden; do not invent contact details."
  },
  {
    "id": "page-lizensk",
    "area": "Public page",
    "route": "/lizhensk",
    "title": "Lizhensk town guide",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Lizhensk is an ordinary city guide now: /lizensk redirects permanently, its listings are seeded and editable at /admin/destinations."
  },
  {
    "id": "page-research-destination",
    "area": "Public page",
    "route": "/heritage/towns/[place]",
    "title": "Destination content coverage",
    "status": "verify",
    "priority": "High",
    "missing": "Factual content coverage for individual destinations; the shared page template and editing workflow exist.",
    "nextAction": "Complete records with documented sources through the existing editors. Preserve the distinction between technical implementation and factual verification."
  },
  {
    "id": "page-cemeteries",
    "area": "Public page",
    "route": "/cemeteries",
    "title": "Beis hachaim directory",
    "status": "verify",
    "priority": "High",
    "missing": "Record-level checking of cemetery names, contacts, coordinates and access details.",
    "nextAction": "Use the existing filtering, map and editing tools. Keep a coordinate unknown when it cannot be established reliably."
  },
  {
    "id": "page-cemetery-detail",
    "area": "Public page",
    "route": "/cemeteries/[cemetery]",
    "title": "Individual beis hachaim page",
    "status": "verify",
    "priority": "High",
    "missing": "Source/date checks of individual burial, yahrzeit, shomer and access records.",
    "nextAction": "Record verified details in the existing fields. Do not treat an unverified telephone number or coordinate as complete."
  },
  {
    "id": "page-booking",
    "area": "Public page",
    "route": "/book",
    "title": "Book flights, hotels and cars",
    "status": "verify",
    "priority": "Medium",
    "missing": "Provider hand-off acceptance with the current partner configuration; the website booking experience is implemented.",
    "nextAction": "Verify destination/date hand-offs without completing a purchase. Keep direct Duffel selling private and purchases closed."
  },
  {
    "id": "page-booking-review",
    "area": "Admin page",
    "route": "/admin/duffel/review",
    "title": "Admin Duffel flight review and payment",
    "status": "verify",
    "priority": "Medium",
    "missing": "Live operator/payment acceptance is not performed as part of this app release; purchases remain closed.",
    "nextAction": "Keep the existing admin-only Duffel gate. Do not issue a ticket or charge money to close this checklist item."
  },
  {
    "id": "page-login",
    "area": "Public page",
    "route": "/login",
    "title": "Login and invitation-only account access",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Server-backed login, expiring single-use invitations, verification, recovery and logout are implemented and regression-tested. Preserve existing-account-only Google sign-in; public signup stays closed."
  },
  {
    "id": "page-account",
    "area": "Public page",
    "route": "/account",
    "title": "Account dashboard",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Accounts, trips, favorites and preferences use the existing shared backend. Preserve the same credentials and data across the two domains; cookies remain domain-scoped."
  },
  {
    "id": "page-my-route",
    "area": "Public page",
    "route": "/my-route",
    "title": "Saved route and itinerary integration",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Saved routes and trips are server-backed and integrated with the itinerary planner. Keep the web planner separate from the installed information app."
  },
  {
    "id": "page-access",
    "area": "Public page",
    "route": "/access",
    "title": "Site access gate",
    "status": "complete",
    "priority": "Medium",
    "missing": "",
    "nextAction": "The existing access controls and invitation-only registration are implemented. Keep current access decisions and closed purchases intact."
  },
  {
    "id": "page-admin-login",
    "area": "Admin page",
    "route": "/admin/login",
    "title": "Named administrator login and permissions",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Named admin accounts, signed sessions and server-side area permissions are implemented. Preserve existing owner access and the deliberately retained shared-password fallback."
  },
  {
    "id": "page-admin",
    "area": "Admin page",
    "route": "/admin",
    "title": "Owner dashboard",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Content, media, suggestions, review queues, advertisements, reporting and settings are implemented in the shared dashboard. Future roadmap features are distinct from missing dashboard implementation."
  },
  {
    "id": "api-hotels",
    "area": "API route",
    "route": "/api/hotels/search",
    "title": "Hotel search API",
    "status": "verify",
    "priority": "Medium",
    "missing": "Current partner/provider configuration needs operator acceptance; the admin/public endpoint separation is implemented.",
    "nextAction": "Public hotel search uses the partner endpoint; Duffel Stays remains admin-only. Do not reopen purchases or change provider credentials to force completion."
  },
  {
    "id": "issue-encoding",
    "area": "Cross-site issue",
    "route": "All pages",
    "title": "Encoding and Yiddish text",
    "status": "verify",
    "priority": "High",
    "missing": "Editorial review of individual Hebrew/Yiddish names and incoming content; this is not evidence that authentication or the whole website is broken.",
    "nextAction": "Keep source text UTF-8 and use checked wording. Retain English when no reliable Yiddish wording is available."
  },
  {
    "id": "issue-mobile",
    "area": "Cross-site issue",
    "route": "All pages",
    "title": "Mobile responsiveness",
    "status": "mobile",
    "priority": "High",
    "missing": "All four corrected native builds pass tablet emulator checks after the owner reported blank Android launches; affected-device confirmation remains open.",
    "nextAction": "Deliver compatible signed updates through the original installation channel, then confirm the affected tablet. Preserve wallet files and sign-in data."
  },
  {
    "id": "issue-legal",
    "area": "Cross-site issue",
    "route": "Legal pages",
    "title": "Legal and trust pages",
    "status": "complete",
    "priority": "Medium",
    "missing": "",
    "nextAction": "Privacy, terms, travel verification and source/attribution pages exist. The booking and terms pages carry the applicable partner disclosures; this completion describes implementation, not a legal certification."
  },
  {
    "id": "app-kosher-travel",
    "area": "Cross-site issue",
    "route": "/travel",
    "title": "Kosher Travel information app",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Search, map navigation, optional AI and website hand-off are live. Native Android startup acceptance is tracked separately below."
  },
  {
    "id": "app-traveler-companion",
    "area": "Cross-site issue",
    "route": "/app",
    "title": "Traveler companion: itinerary, wallet and group chat",
    "status": "complete",
    "priority": "High",
    "missing": "",
    "nextAction": "Trip-code access, itinerary viewing, a device-only PDF/photo wallet and shared trip chat are live. Preserve the latest shared chat features, existing accounts and private attachments; no advisor or travel-date cutoff is required."
  },
  {
    "id": "app-android-startup",
    "area": "Cross-site issue",
    "route": "Android: Kosher Travel, Advisor, Itineraries and Admin",
    "title": "Android startup on all four installed apps",
    "status": "verify",
    "priority": "High",
    "missing": "All four apps pass Android tablet emulator checks and have verified signed updates. Confirmation on the affected tablet remains open.",
    "nextAction": "Distribute compatible updates through the original installation channel and confirm the affected tablet. Preserve wallet files and sign-in data; do not clear app data or uninstall to force an update."
  },
  {
    "id": "app-distribution",
    "area": "Cross-site issue",
    "route": "Existing Google Play listings and private test tracks",
    "title": "Signed app updates and distribution",
    "status": "partial",
    "priority": "High",
    "missing": "Google Play upload/publication and installed-device confirmation remain open; all four signed APK/AAB updates and verification reports are ready.",
    "nextAction": "Use verified builds linked in docs/app-release-checklist.md with existing app identities. Keep Admin private. Publisher access is needed for existing Play tracks; no submission is claimed."
  }
];

export function inventoryStatusLabel(status: InventoryStatus) {
  return inventoryStatuses.find((item) => item.value === status)?.label ?? status;
}
