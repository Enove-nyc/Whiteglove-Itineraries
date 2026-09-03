import Link from "next/link";
import AdminPlacementsForm from "@/components/AdminPlacementsForm";
import EarningsForm from "@/components/EarningsForm";
import Stay22Form from "@/components/Stay22Form";
import TravelEssentialsForm from "@/components/TravelEssentialsForm";
import TravelExtrasForm from "@/components/TravelExtrasForm";
import { readAffiliateConfig } from "@/lib/affiliate/config";
import { allRoutes, earningStateLabel, isLandingProduct, TRAVEL_PRODUCTS } from "@/lib/affiliate/partners";
import { growthSettingsStoreAvailable, readDestinationPlacements } from "@/lib/growth-settings-store";
import { readStay22Fresh } from "@/lib/stay22-store";
import { describeStay22, stay22IsOn } from "@/lib/stay22";
import { readExtrasFresh } from "@/lib/travel-extras-store";
import { partnerFor } from "@/lib/travel-partners";
import { describeLinks } from "@/lib/travelpayouts";
import { readTravelpayoutsFresh, travelpayoutsStoreAvailable } from "@/lib/travelpayouts-store";
import { readTravelEssentialsFresh, travelEssentialsStoreAvailable } from "@/lib/travel-essentials-store";

export const dynamic = "force-dynamic";

export default async function EarningsSettings() {
  // Uncached, unlike /book: this screen has to show what was saved a second
  // ago, not what the site is serving.
  const current = await readTravelpayoutsFresh();
  const extras = await readExtrasFresh();
  const stay22 = await readStay22Fresh();
  const placements = await readDestinationPlacements();
  const affiliate = await readAffiliateConfig();
  const essentials = await readTravelEssentialsFresh();
  const routes = allRoutes(affiliate);
  const routeNotes = routes.map((route) => ({
    product: route.product,
    label: TRAVEL_PRODUCTS.find((entry) => entry.value === route.product)?.label ?? route.product,
    earns: route.earns,
    state: earningStateLabel(route),
    note: route.note,
    landing: isLandingProduct(route.product),
  }));

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              Earnings
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              Partner searches, page cards, and anything else you link to.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{describeLinks(current.links, current.partners, stay22)}</p>
          </div>
          <Link
            href="/admin/settings"
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Settings
          </Link>
        </div>
      </header>

      <section className="mt-8 rounded-lg border border-[var(--gold-light)] bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">What is live today</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Every product this site can hand off, including the ones that work and earn nothing. A silent gap here is how
          car hire went out untagged.
        </p>
        <ul className="mt-4 space-y-3">
          {routeNotes.map((row) => (
            <li key={row.product} className="border-t border-[var(--gold-light)] pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-semibold text-[var(--navy)]">
                {row.label}
                <span className="ml-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                  {row.state}
                </span>
              </p>
              <p className="mt-1 text-sm leading-6 text-stone-600">{row.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-[var(--gold-light)] bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Where to get each link</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
          <li>Sign in to Travelpayouts and open the link builder for the programme you want.</li>
          <li>
            Paste in the partner&rsquo;s own address — whichever one you picked in the matching box below — and let it
            generate the link.
          </li>
          <li>Copy the whole thing it gives you back and paste it into the matching box below.</li>
        </ol>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          The link already carries your marker and your programme number, so there is nothing else to copy. Each box
          below checks that the link forwards to the partner that search actually opens, and refuses it if not — a link
          made for one partner does not track another, and there would be no way to tell from the outside.
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          If a programme you want is not on Travelpayouts, that search stays as it is. Nothing here changes what a
          traveller sees or where they end up.
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-[var(--gold-light)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Hotels, through Stay22</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Booking.com turned this site down for their own programme, and the Travelpayouts account came back with
          flights and car hire but no hotels — so of the three searches, the one most likely to be used was the one
          with no way to earn. Stay22 sits in front of Booking.com, Expedia, Hotels.com, Vrbo and Agoda under a single
          ID, and takes sites the big ones turn down.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Nothing to paste here but the ID. The place, the dates and the number of guests are already on the search
          form, so the hotel search is built for Stay22 properly rather than wrapped — which means what a traveller
          typed survives the hand-off.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Live inventory on Search booking partners uses a server API key (
          <code className="rounded bg-[#FAF8F3] px-1.5 py-0.5 text-xs">STAY22_API_KEY</code>
          ), not this ID. Kayak flights earn from this ID — Stay22 has no flights
          inventory API, so travellers compare on Kayak and book with the partner.
          A Travelpayouts fare list is optional (
          <code className="rounded bg-[#FAF8F3] px-1.5 py-0.5 text-xs">TRAVELPAYOUTS_TOKEN</code>
          ) and is not required for flights to work or earn. Keys belong in
          environment settings / Connections — never in this form.
        </p>
        <Stay22Form current={stay22} storeReady={travelpayoutsStoreAvailable()} />
      </section>

      <EarningsForm
        current={current.links}
        currentPartners={current.partners}
        storeReady={travelpayoutsStoreAvailable()}
        hotelsElsewhere={
          stay22IsOn(stay22)
            ? `${describeStay22(stay22)} Nothing pasted in this box is used while that is set.`
            : undefined
        }
        flightsElsewhere={
          stay22IsOn(stay22) && partnerFor("flights", affiliate.partners).key === "kayak"
            ? "Flight searches go through Stay22, then on to Kayak, using the ID above. Nothing pasted in this box is required."
            : undefined
        }
        carsElsewhere={
          stay22IsOn(stay22) && partnerFor("cars", affiliate.partners).key === "kayak"
            ? "Car searches go through Stay22, then on to Kayak, using the ID above. Nothing pasted in this box is required."
            : undefined
        }
      />

      <section className="mt-14 border-t border-[var(--gold-light)] pt-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">On destination pages</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          The “Book the practical pieces” block on each vacation destination. Categories with no real partner link stay
          hidden even when ticked. Commission wording is edited under{" "}
          <Link href="/admin/settings/words" className="underline decoration-[var(--gold)] underline-offset-2">
            The website&apos;s words
          </Link>
          .
        </p>
        <AdminPlacementsForm
          current={placements}
          storeReady={growthSettingsStoreAvailable()}
          routeNotes={routeNotes}
        />
      </section>

      {/* THE OTHER HALF OF THE MONEY, AND IT USED TO BE ANOTHER SCREEN.
          Everything above earns when somebody searches; everything here earns
          when they buy something else — insurance, an eSIM, a transfer, a tour.
          Splitting them meant the answer to "is this site earning" lived in two
          places, and the one you were not on always looked complete.

          The programme checklist that opened the old screen is gone rather than
          moved. It listed each category and told the owner to confirm it in the
          partner dashboard — while every card below already says exactly where
          it stands in its own words, from what is actually saved. Two accounts
          of the same thing, one of them hand-written and unable to notice a
          change. */}
      <section id="travel-essentials" className="mt-14 scroll-mt-24 border-t border-[var(--gold-light)] pt-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
          Cards on the pages
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Insurance, eSIM, transfers, tours and seasonal programmes. Enable each one, paste the approved link, and
          choose which pages it appears on. A card with no working hand-off is not shown to anybody. A link that works
          but is not tracked still shows, and the line under each card says so — that is the “earns nothing” state,
          kept visible rather than hidden.
        </p>
        {!travelEssentialsStoreAvailable() && (
          <p className="mt-4 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4 text-sm leading-6 text-amber-900">
            Waiting on the private store. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then return here.
          </p>
        )}
        <TravelEssentialsForm
          current={essentials}
          affiliate={affiliate}
          storeReady={travelEssentialsStoreAvailable()}
        />
      </section>

      <section className="mt-14 border-t border-[var(--gold-light)] pt-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Anything else you link to</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Anything that is not one of the categories above — a travel blech, a book, a piece of kit, a one-off
          partner link. Name it, paste the link, and write one line saying what it is; without that line it saves but
          is not shown. Amazon links carry Amazon&rsquo;s own required wording automatically. These appear on the
          kosher travel guide, the travel guide, and under the search on{" "}
          <Link href="/book" target="_blank" className="underline decoration-[var(--gold)] underline-offset-2">
            the booking page
          </Link>{" "}
          when finished.
        </p>
        <TravelExtrasForm current={extras} storeReady={travelpayoutsStoreAvailable()} />
      </section>
    </>
  );
}
