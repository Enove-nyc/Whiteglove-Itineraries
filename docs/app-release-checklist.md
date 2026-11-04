# Traveler app release status

Updated 4 November 2026. This tracks the current app scope; it does not mark the entire website or all four apps complete.

- [x] Kosher Travel installed app: search, map and AI information screens; planning and booking handed to the website.
- [x] Reuse the existing Itineraries installed app for travelers with a trip code, without an advisor or purchase requirement.
- [x] Personal device-only wallet: PDFs/photos, offline document viewing, removal and sign-out cleanup. No cloud sync.
- [x] Trip group chat, isolated by trip, without a travel-date cutoff. Latest 500 messages retained.
- [x] Shared account/trip storage and private attachment boundaries preserved.
- [x] Initial release merged and Railway deployments verified successful on both domains; live search, AI, code entry and sample preview checked.
- [ ] Tablet issue reported by owner: identify installed app/device and reproduce the exact symptom. Browser checks at 768×1024 and 1024×768 load both apps; companion tabs work, but these checks do not establish physical tablet support.
- [x] Startup correction verified locally and in hosted browser journeys: first worker installation keeps the screen open; replacement workers still reload once.
- [x] This repository’s corrected hosted regression/browser workflow passed: [run 41886417070](https://github.com/Enove-nyc/Whiteglove-Itineraries/actions/runs/41886417070), including portrait/landscape tablet tabs, code entry, first startup, chat, wallet and offline PDF viewing.
- [ ] Physical installed tablet acceptance and confirmation of the reported issue.
- [ ] Store distribution: no new signed native binary or App Store/Play Store submission was made in this web release.

Advisor and Admin remain separate, unchanged by this traveler release. The separate Itineraries business stays paused.

The existing Admin → Checklist (`/admin/inventory`) tracks website/content inventory and owner notes. `docs/roadmap.md` is the broader historical website roadmap; its completed responsive-design item does not close this newly reported installed-tablet issue. `docs/launch-checklist.md` contains old launch notes, including superseded services questions; those are not current owner decisions to reopen.

Validation already completed for the initial release: Kosher Travel 5,666 regression tests, Itineraries 4,783; isolated local APIs and real Redis browser journeys; production builds and live page checks. The initial hosted conversation-opening failure is corrected and verified above. The owner’s specific installed-tablet report remains open until separately reproduced and verified.
