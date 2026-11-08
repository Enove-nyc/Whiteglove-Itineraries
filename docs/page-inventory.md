# Current implementation and release inventory

Reconciled 4 November 2026 against the current main branch. This replaces the July inventory that incorrectly described accounts as browser-only and legal pages as absent.

`data/page-inventory.ts` supplies Admin → Checklist. The rows below use its current base status; existing owner overrides and notes in the shared store are preserved. A complete implementation is not a claim that every destination fact, payment provider, physical device or store release has been independently accepted.

The active company is Kosher Travel. Its installed app is for information search and optional AI; planning and booking remain web-based. The existing Itineraries app is the traveler companion. The separate Itineraries business remains paused, and Advisor/Admin remain separate applications. Purchases and public signup stay closed.

| Item | Status | Remaining work or implementation evidence |
| --- | --- | --- |
| Homepage | verify | Final acceptance on the reported Android tablet; browser search, licensed section photographs and responsive layouts are already implemented. |
| Destination directory | verify | Ongoing factual and last-checked-date review of destination content, rather than a missing directory implementation. |
| City guide template | verify | Record-level checking of access details, shomer contacts, food, minyanim and other time-sensitive information. |
| Lizhensk town guide | complete | Lizhensk is an ordinary city guide now: /lizensk redirects permanently, its listings are seeded and editable at /admin/destinations. |
| Destination content coverage | verify | Factual content coverage for individual destinations; the shared page template and editing workflow exist. |
| Beis hachaim directory | verify | Record-level checking of cemetery names, contacts, coordinates and access details. |
| Individual beis hachaim page | verify | Source/date checks of individual burial, yahrzeit, shomer and access records. |
| Book flights, hotels and cars | verify | Provider hand-off acceptance with the current partner configuration; the website booking experience is implemented. |
| Admin Duffel flight review and payment | verify | Live operator/payment acceptance is not performed as part of this app release; purchases remain closed. |
| Login and invitation-only account access | complete | Server-backed login, expiring single-use invitations, verification, recovery and logout are implemented and regression-tested. Preserve existing-account-only Google sign-in; public signup stays closed. |
| Account dashboard | complete | Accounts, trips, favorites and preferences use the existing shared backend. Preserve the same credentials and data across the two domains; cookies remain domain-scoped. |
| Saved route and itinerary integration | complete | Saved routes and trips are server-backed and integrated with the itinerary planner. Keep the web planner separate from the installed information app. |
| Site access gate | complete | The existing access controls and invitation-only registration are implemented. Keep current access decisions and closed purchases intact. |
| Named administrator login and permissions | complete | Named admin accounts, signed sessions and server-side area permissions are implemented. Preserve existing owner access and the deliberately retained shared-password fallback. |
| Owner dashboard | complete | Content, media, suggestions, review queues, advertisements, reporting and settings are implemented in the shared dashboard. Future roadmap features are distinct from missing dashboard implementation. |
| Hotel search API | verify | Current partner/provider configuration needs operator acceptance; the admin/public endpoint separation is implemented. |
| Encoding and Yiddish text | verify | Editorial review of individual Hebrew/Yiddish names and incoming content; this is not evidence that authentication or the whole website is broken. |
| Mobile responsiveness | mobile | All four corrected native builds pass tablet emulator checks after the owner reported blank Android launches; affected-device confirmation remains open. |
| Legal and trust pages | complete | Privacy, terms, travel verification and source/attribution pages exist. The booking and terms pages carry the applicable partner disclosures; this completion describes implementation, not a legal certification. |
| Kosher Travel information app | complete | Search, map navigation, optional AI and website hand-off are live. Native Android startup acceptance is tracked separately below. |
| Traveler companion: itinerary, wallet and group chat | complete | Trip-code access, itinerary viewing, a device-only PDF/photo wallet and shared trip chat are live. Preserve the latest shared chat features, existing accounts and private attachments; no advisor or travel-date cutoff is required. |
| Android startup on all four installed apps | verify | All four apps pass Android tablet emulator checks and have verified signed updates. Confirmation on the affected tablet remains open. |
| Signed app updates and distribution | partial | Google Play upload/publication and installed-device confirmation remain open; all four signed APK/AAB updates and verification reports are ready. |

See [the active app release checklist](app-release-checklist.md) for current test, signed-build and distribution evidence. Existing owner overrides and notes remain authoritative in Admin.
