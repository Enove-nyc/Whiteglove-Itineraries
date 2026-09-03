<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Customer-facing copy

- **Provide information, not hashkafa.** Describe what a place is and what visiting involves; leave the paskening to the traveler and their rov. Do not tell a customer whether to go, do not write "ask your rov," and do not frame an attraction as a choice to make carefully. A church, a museum of religious art, a gallery with nudes — say plainly what it is and stop there. What the site *lists at all* is still a selection decision (no nightlife, bars, mixed concerts, casinos — see below); how it *describes* what it lists is information only. This is a standing general rule, not specific to any one place.
- Write public copy in a natural, confident and concise voice suitable for an established travel website.
- Keep the site-wide under-production banner visible until the owner explicitly asks to remove it. The banner may be polished, but not deleted or hidden.
- Do not expose internal workflows or content status to customers. Avoid phrases such as “unverified,” “being checked,” “on record,” “research queue,” “not published yet,” or explanations that the owner has not completed something.
- Hide unfinished or empty public sections until they contain useful customer-ready content.
- Do not make blanket payment promises such as “no card taken” or “nothing charged.” State a price or payment step only when it is accurate and needed.
- Keep vacation discovery, self-service planning and partner booking links as the primary public journey. Heritage places are part of the normal destination directory, not a separate section (see "Personal trip planning has been removed" below for when this changed and why).
- There is no personal trip-planning or booking-assistance offer anywhere on the site, discreet or otherwise — see "Personal trip planning has been removed" below.
- Audience-appropriate is not the same as kosher-only. Vacation attractions and lodging do not have to be Jewish places or kosher establishments; prefer Jewish when it fits, and keep ordinary sightseeing and stays that Orthodox / Torah-observant travelers would use. Never promote nightlife, clubs, mixed concerts, or similar venues. Reserve “kosher” for food / kashrus features — do not demand a kosher label on every attraction, hotel, cemetery, shul or mikvah. Do not blur this into the kosher food finder or the heritage section. Public wording for this standard lives in `data/listing-audience.ts` (footer, About, Where to stay) — reuse it; do not invent a second version. It was taken off Things to do at the owner's word; do not put it back there.

## Personal trip planning has been removed

**Done-for-you itinerary planning (`/services`) does not exist on this site.** It used to be kept as a reachable last resort — mentioned last, never promoted — and the owner then decided to remove it outright rather than keep it available: no page, no nav entry, no footer link, no form, no mention anywhere, not even discreetly through Contact.

What follows from that:

- Do not re-add `/services`, a services page, a "have us plan it" card, or any wording that offers personal planning or booking assistance, in any form or at any prominence. This is a full removal, not a demotion — do not partially restore it as "just a footer link" or "just reachable from Contact."
- **Never ask the owner to price it.** No starting price, no typical range, no turnaround time, no "does the fee come off a booking", no cancellation or refund terms, no post-itinerary support window. There is nothing on this site to price. This is a standing answer, not an open question — do not re-raise it as an outstanding item.
- The three free tools are the whole offer: get recommendations (`/plan`), build the trip yourself (`/itinerary`), search booking partners (`/book`).

## Settled decisions — do not re-open these

This section is the memory that carries across chats. It is loaded at the start of every session, so a decision recorded here is not re-litigated in a later one. When the owner settles something — a decision or a standing preference — write it here in plain terms, in his words where they are clear, so the next chat starts already knowing it and he does not have to say it twice.

- **Which repository a trip feature belongs in is decided BEFORE it is written, not after.** This has gone wrong repeatedly and always the same way: the work happens in whichever repository the session happened to open, and Itineraries — the product whose entire job is building, organising and managing a trip — ends up behind on its own features. Forwarding a confirmation in by email was built on Kosher Travel first. So were the packing list, itinerary optimisation, itinerary translation, offline documents and trip updates.

  THE TEST IS WHOSE JOB THE FEATURE IS, NOT WHICH FOLDER IS OPEN. Anything that BUILDS, ORGANISES or MANAGES a trip — flights, hotels, transport, documents, day-by-day, confirmations, reminders, what changed since it was planned — is Itineraries work and is built in the itineraries repository FIRST. Anything that helps somebody DISCOVER or PLAN — destinations, kosher food, shuls, mikvaos, heritage, maps, local services — is Kosher Travel work and is built here. A feature that genuinely serves both is still built in Itineraries first and then ported, because that is the direction the drift never goes on its own.

  AND THE PORT IS PART OF THE JOB, NOT A FOLLOW-UP. The two deployments run from two codebases, so merging here does not put anything on whitegloveitineraries.com. A trip feature is not finished until it exists on the side it is for. When only one side can be done in a sitting, say so in plain words in the same message — never leave it implied.

  THE ONE THING THAT STAYS ONE-DIRECTIONAL is the marketing link: `ContinueInItineraries` and `lib/itineraries-handoff.ts` are Kosher Travel's alone and must never be ported. Their absence from the itineraries repository is correct, not drift.

- **Two platforms, one White Glove.** White Glove is a travel technology company with two distinct but connected platforms.

  WHITE GLOVE KOSHER TRAVEL — the other repository — is a free travel information and planning platform for kosher and Jewish travel. Its customer is the traveller, and its job is DISCOVER & PLAN: destinations, kosher food, shuls, mikvaos, places to stay, attractions, heritage, maps and local services, so a traveller can work out where to go and what to include.

  WHITE GLOVE ITINERARIES — this repo — is a general travel itinerary and trip-management platform for travellers, advisers and agencies. Its job is BUILD, ORGANISE & MANAGE: complete digital itineraries with flights, hotels, transport, activities, documents, maps, schedules and contacts. **It is not a kosher travel product** and must not be described as one.

  THE CONNECTION IS ONE-DIRECTIONAL, and only in marketing. Kosher Travel may promote and connect a traveller to White Glove Itineraries when they want their planning turned into a full itinerary. White Glove Itineraries never promotes Kosher Travel and stays independently positioned as general travel — do not add anything on THIS side that points at the kosher site.

  BEHIND THEM, ONE ACCOUNT AND ONE DATABASE. One White Glove account and login across both, with trip information and subscription status following the customer between them; an eligible paid subscription can unlock paid benefits on both as those are built. The travel database is shared, so an itinerary builder can search it and pull places straight into a trip. This is the intended architecture, not a merge: they remain two products with two front doors, today served by two separate deployments from two codebases (nothing built in the kosher repository reaches this site, and nothing built here reaches whiteglovekoshertravel.com). Do not propose collapsing them into one product, and do not link this site to a path that only exists on the other one (every guide path is one — see GUIDE_ONLY_PREFIXES in middleware.ts) — an outbound link to that site's own domain is the connection, a cross-domain path is a 404. Which means an adviser feature — a group screen, a client's boarding pass, anything whose user is somebody planning for other people — has to be built or ported HERE as well, and merging it here does not put it on that site. Both were built in the kosher repository first on 26 August and `/group` 404'd on this site until they were ported; check which platform a feature is FOR before choosing where to build it.

- **The site notice stays exactly as it is**, a full-screen popup, until the owner says otherwise. He was shown the cost (it blocks every automated functional check and is the whole of the tab-order findings) and chose to keep it. Do not raise it again, and do not quietly turn it into a strip.
- **The About page carries no personal facts at all** — no name, no background, no photograph, no years of experience, and no location. White Glove is not based anywhere: it is a website. Do not ask him for any of them, and do not treat the empty fields on `/admin/settings/about` as gaps. The page is finished as it stands: what the site is for, and what its information is worth.
- **Vacation attractions need not be Jewish or kosher.** Audience-appropriate ≠ kosher-only. A Jewish venue is better when available, but general sightseeing, parks, museums, family activities and ordinary lodging are fine when Orthodox / Torah-observant travelers would go. No mixed concerts, clubs, nightlife, bars, casinos, or similar. Do not require a kosher label on attractions, lodging, cemeteries, shuls or mikvaos — “kosher” is for food / kashrus features. Kosher food tools stay kosher-specific. Customer-facing copy is in `data/listing-audience.ts` and must stay consistent with this.
- **Heritage is not a separate top-level section any more.** Heritage destinations (towns, kevarim, cemeteries) are part of the normal destination directory, reached the same way any other destination is; practical heritage information (kevarim, cemeteries, shuls) is reached through Kosher. The heritage pages themselves still exist and stay reachable — only the standalone "Heritage" category is gone. Do not reintroduce Heritage as its own top-level nav item or reopen the old "vacation vs. heritage" split without the owner asking for it.
- **Ratings ask about White Glove, not the trip.** White Glove does not arrange anyone's trip, so it never asks a traveler how the trip itself turned out. The trip rating asks only how White Glove did during the trip — how the site and its information held up. A listing rating stays about the place. Do not reword these to report on the trip's outcome.
- **Sources live on one `/sources` page, never on the listings.** A listing shows no source line at all — not even small print — because a source shown beside a listing, a kever especially, reads as an endorsement of whatever it points at. Every source the site cites is credited once on `/sources`, grouped and framed as acknowledgement rather than endorsement, and linked quietly from the footer. That page is generated from the data by `scripts/build-sources-index.mjs` into `data/sources-index.generated.ts` — rebuild it after source data changes, do not hand-edit it. The one exception is the heritage-cemetery page (`/cemeteries/heritage/[slug]`), which holds no details of its own and keeps its normal "See the details on Nesiya Tova" button. Do not put source links back onto individual listings.
- **Pricing is One Trip / Advisor Starter / Advisor Pro; Agency is deferred.** ONE TRIP is a $15 one-time purchase, capped at one trip ever, for someone planning a single trip for themselves. ADVISOR STARTER ($29/mo) and ADVISOR PRO ($49/mo) are subscriptions with no trip cap. Nobody was already paying for anything on the old Traveler/Gold/Business ladder when this replaced it, so it was a clean-slate rebuild, not a migration. AGENCY (Advisor Pro plus $25/mo per additional advisor seat, with genuine multi-login — several advisor accounts under one subscription) is a deliberately deferred future build; do not add it without the owner asking. ENTERPRISE stays "talk to us," not self-serve. See `lib/account-plans.ts` and `lib/account-limits.ts` for exactly what each plan includes.
- **The White Glove app (`/app`) is for every paid plan.** App access is the `companionApp` entitlement (`lib/account-limits.ts`), true for One Trip, Advisor Starter and Advisor Pro alike — every paid plan carries its own trip in it. Handing a trip to a *client* is Advisor Starter and up, behind the separate `companionClients` gate: naming a client, sending it, and creating a client code all need Advisor Starter or Advisor Pro. Advisor Pro adds its own name and logo on the client app in place of White Glove's (`ownBranding`) — a further gate on top of `companionClients`, not a replacement for it. Opening the app to One Trip does not open client codes to it.
- **A client reaches a trip by a per-trip code, not a login.** Each trip has a unique code — its **share token** (a random, unguessable per-trip id from `ensureTripShare`), never the raw internal trip id, so a client cannot guess a nearby one and land on someone else's trip. An Advisor Starter or Advisor Pro adviser creates the code and sends it to that one client; it opens that one trip as the app and no other. The `/app` front page, for a visitor not already in their own app, offers two doors: **"Enter a code from your travel adviser"** (a client, no account — opens their one trip) and **"Log in"** (advisers and other paid members, who then see their own trips). Do not turn client access back into an account requirement, and do not use the raw trip id as the code.

## Do not hand the owner checklists

Report what changed and what it cost him, in prose. Do not produce checklists, audit tables, or lists of outstanding items for him to work through, and do not convert a question he asked into a list of tasks for him. If something genuinely needs a decision only he can make, ask that one question on its own.

## Working with the owner

**"Step by step" means one step, then stop.** Give a single step, wait for him to say done, and only then give the next one. Do not send a numbered list of five and call it step by step — he is working through these in his own dashboards, and the next step is useless until the one before it is done.

Say what the step is, where to do it, and how he will know it worked. Nothing else.

## One name per thing

The site had several names for each of its own features, so four front doors looked like seven. Use the first column; the alternatives are fine inside a sentence where the context genuinely calls for one, and are not names.

| Use | Not |
| --- | --- |
| Where to stay (the section), places to stay (the things) | Hotels & Stays, stays, where to sleep |
| Itinerary planner | trip planner, My Trips, the planner |
| Kosher food finder (the live tool) | food finder, kosher lookup, live search |
| Listing (White Glove’s curated listing, with a source) | record, entry, our data |

The three ways into the site are named once in `lib/starting-points.ts` — get recommendations (`/plan`), build the trip yourself (`/itinerary`), search booking partners (`/book`). Link to one of them through that list rather than inventing a label at the call site.
