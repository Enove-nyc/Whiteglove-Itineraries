> Historical launch notes. Current traveler-app release status is in [app-release-checklist.md](app-release-checklist.md). Superseded service/pricing and personal About questions below are not current requests to the owner.

# White Glove Itineraries — what is left

Checked against the live site and the current main branch.

## Only you can answer these

Nothing here is a code change. Each is a sentence the site is waiting for, and until it arrives the page says so or says nothing.

- [ ] **Pricing: a starting price or a typical range**  
  `/admin/settings/words`  
  The first thing anyone deciding whether to write in wants. Currently unanswered.
- [ ] **Pricing: how long until someone hears back**  
  `/admin/settings/words`  
  A turnaround you can keep. "Within two working days" beats silence.
- [ ] **Pricing: does the planning fee come off a booking**  
  `/admin/settings/words`  
  Yes, no, or partly — any of the three is better than the gap.
- [ ] **Pricing: how long the planning itself takes**  
  `/admin/settings/words`  
  Not the same as the reply time. From go-ahead to itinerary.
- [ ] **Pricing: cancellation and refund terms**  
  `/admin/settings/words`  
  What happens if the trip is called off after work has started.
- [ ] **Pricing: support after the itinerary is sent**  
  `/admin/settings/words`  
  Whether anyone is there while they travel, and for how long. This is the one that decides whether the service reads as a service or as a PDF.
- [ ] **About: your name, background, and where the business is based**  
  `/admin/settings/about`  
  The page is live and deliberately says nothing invented about who runs it.
- [ ] **One real case study, with permission recorded**  
  `/admin/settings/proof`  
  The section is built and hides itself until then — /case-studies currently 404s, correctly. One real trip beats any amount of generic praise.
- [ ] **Last-checked dates on time-sensitive records**  
  `admin content screens`  
  Kosher places, seasonal programmes, minyanim, access contacts, borders. The display is ready; no record carries a date yet.

## Decisions, not tasks

Each of these is a live choice someone already made deliberately. They are here because they carry a cost worth knowing about.

- [ ] **Keep the site notice as a full-screen modal, or go back to a strip**  
  `components/NewSiteNotice.tsx`  
  It covers every page and traps focus until dismissed. Measured: it blocked all 23 functional checks until the audit learned to dismiss it, and it is the whole of the 26 tab-order findings.
- [ ] **Put one line of commission disclosure back under the /book panel**  
  `app/book/page.tsx`  
  It now lives in Terms and on each partner action. /book's three searches only show one because the Travel Essentials block happens to be filled. Empty that and three earning searches carry no disclosure.
- [ ] **Confirm the flights and cars partner configuration**  
  `/admin/settings/earnings`  
  Unconfigured, both fall back to Kayak, which this account was not approved for. Production resolves to Aviasales and EconomyBookings, so this only bites if the config is lost.
- [ ] **Confirm the Stay22 aid is live in the Stay22 dashboard**  
  `/admin/settings/earnings`  
  Hotels is the tab /book opens on. If the id is blank the search still works and earns nothing.
- [ ] **Merge the branch with the typecheck and audit fixes**  
  `claude/white-glove-launch-checklist-ewkr21`  
  npm run check was red: a regex flag tsc rejects. Fixed, plus the flow audit updated for the modal, the /go redirect and the moved disclosure. 50/50 passing.

## Money left on the table

The slots are already built in lib/travel-essentials.ts. These need approving and a tracked link pasted, not coding.

- [ ] **Kiwitaxi — airport transfers**  
  `Travelpayouts, then /admin/settings/travel-essentials`  
  The best fit on this list. 50% revenue share, ~$8 an order, 102 countries. Someone shomer Shabbos cannot pay a driver on Shabbos or Yom Tov, so a pre-booked transfer is a real need rather than an upsell.
- [ ] **GetYourGuide — tours and attractions**  
  `Stay22 (/allez/getyourguide) or Travelpayouts`  
  /book still says we do not sell tickets yet. May cost nothing to switch on: it is a supported path under the Stay22 id you already have.
- [ ] **Airalo — eSIM**  
  `Travelpayouts, then /admin/settings/travel-essentials`  
  Landing on a Friday afternoon needing to find the shul is exactly when a working phone matters.
- [ ] **DiscoverCars — test against EconomyBookings**  
  `Travelpayouts`  
  Usually pays better. Worth running against the current car partner.
- [ ] **Amazon Associates — the kosher travel kit**  
  `amazon associates, then /travel-guide and /kosher-travel`  
  Travel blech, hotplate, candles and holders, travel Havdalah set. Low rate, enormous intent, and nobody else is monetising that shelf.
- [ ] **Direct sponsorship — probably the biggest earner**  
  `/admin (ad manager), /contact?reason=advertise`  
  Pesach programme operators, kosher hotels and heritage drivers will pay far more than a 4% affiliate rate to reach this audience. The ad manager and the directory already exist.
