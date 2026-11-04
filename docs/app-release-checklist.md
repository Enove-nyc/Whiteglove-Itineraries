# App release checklist

Updated 4 November 2026. This tracks the active app scope separately from deferred business features and ongoing destination research.

- [x] Kosher Travel app: clean search, map and optional AI information; itinerary building and booking remain on the website.
- [x] Existing Itineraries app reused as the traveler companion for anyone with a trip code. No advisor or purchase requirement.
- [x] Itinerary viewing and personal device-only PDF/photo wallet, with offline document viewing, removal and sign-out cleanup. No cloud sync.
- [x] Shared trip conversations and current topic channels, without a travel-date cutoff; latest 500 messages per channel.
- [x] Shared accounts, trip storage, private attachment permissions and existing owner access preserved. Public signup and purchases stay closed.
- [x] Web app release deployed and browser journeys passed: search/AI, code entry, wallet/offline PDF, chat and tablet portrait/landscape.
- [x] First service-worker installation keeps the app open; replacement workers reload once. Installed search/private companion pages exclude affiliate scripts.
- [x] Android startup repairs across all four apps: visible loading and failure screens, blank-page timeout, retry, automatic reconnection and outdated-WebView guidance. TLS failures are rejected; recovery does not clear user data.
- [x] Correct native entry addresses: Kosher Travel opens `/travel`; Admin opens its canonical Kosher Travel domain rather than crossing domains during startup.
- [x] Android tablet emulator: 24 instrumentation tests and 12 startup unit tests across all four packages. Live entry, rotation, offline first launch, reconnection, timeout, old-WebView guidance and error recovery passed. [Successful run](https://github.com/Enove-nyc/Whiteglove-Itineraries/actions/runs/41903338090).
- [x] All four signed APK/AAB updates built with original package IDs/signing identities, higher version codes and target SDK 36. Downloaded package hashes match verification reports.
- [x] Admin checklist reconciled with implemented accounts, invitations, saved routes, permissions and legal pages; existing owner overrides/notes preserved.
- [x] Privacy supplement covers personal wallet files, shared attachments, trip codes and group-message retention, including owner-edited policy pages.
- [ ] Distribution through existing Google Play listings/test tracks. Signed bundles are ready; no Play upload or publication is claimed. Admin remains private.
- [ ] Confirmation on the owner's affected Android tablet after compatible updates. Emulator results do not establish the exact cause or resolution on that device.
- [ ] Ongoing destination facts/sources/contacts and live partner-provider acceptance, tracked individually in Admin → Checklist. No invented details or real ticket purchases to close rows.

## Verified native packages

| App | Version | Code | Successful signed build |
| --- | --- | --- | --- |
| Kosher Travel | 1.5 | 6 | [41904633196](https://github.com/Enove-nyc/Whiteglove/actions/runs/41904633196) |
| Itineraries companion | 1.6 | 7 | [41904670086](https://github.com/Enove-nyc/Whiteglove-Itineraries/actions/runs/41904670086) |
| Advisor | 1.8 | 12 | [41904670566](https://github.com/Enove-nyc/Whiteglove-Itineraries/actions/runs/41904670566) |
| Admin | 1.1 | 2 | [41904670344](https://github.com/Enove-nyc/Whiteglove-Itineraries/actions/runs/41904670344) |

Each run contains `*-release-apk`, `*-release-aab` and `*-release-verification` artifacts. Verification checks package/version/SDK, cryptographic signatures and original upload certificate, and records SHA-256 hashes. A Play-installed app may use Google's app-signing certificate instead of the upload certificate. Do not uninstall or clear data to force an APK update: personal wallet files are device-only. Confirm the installation channel before choosing the update route.

The separate Itineraries business stays paused. Advisor/Admin received startup repairs only, without new advisor business features or changed access permissions. Native source remains on the existing native branches; it is not merged wholesale into website main branches.

Earlier web regression suites passed 5,666 Kosher Travel tests and 4,783 Itineraries tests. The checklist/privacy change also passed type checking, lint, 167 authentication/admin/access tests and 20 privacy/brand tests across both repositories. No real account, message, payment or booking was created for these checks.

`docs/roadmap.md` and `docs/launch-checklist.md` contain historical work and superseded questions. They do not authorize restoring personal planning services, public signup, purchases or the paused advisor business. Current inventory: `docs/page-inventory.md` and Admin → Checklist (`/admin/inventory`).
