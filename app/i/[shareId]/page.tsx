import Link from "next/link";
import { headers } from "next/headers";
import Footer from "@/components/Footer";
import TripComments from "@/components/TripComments";
import TripGroupTools from "@/components/TripGroupTools";
import ItineraryFooter from "@/components/ItineraryFooter";
import Navbar from "@/components/Navbar";
import SharedItineraryActions from "@/components/SharedItineraryActions";
import { Icon } from "@/components/icons/Icon";
import { buildDays, emptyItinerary, formatKm, travelerSummary } from "@/data/itinerary";
import { getSharedItineraryByShareId } from "@/lib/account-store";
import { noteShareOpened } from "@/lib/share-open-recorder";
import { allCrossings } from "@/lib/border-store";
import { borderCostForLegs } from "@/lib/border-legs";
import { readCollaborationSettings } from "@/lib/growth-settings-store";
import { readAssumptions } from "@/lib/planner-settings-store";
import { getActivePromotions } from "@/lib/admin-content";
import { burialsForSlugs } from "@/lib/kever-search";

import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// A share link is given to somebody, not found. Indexing it would put a
// stranger's trip — with their dates and their stops — into search results.
// Brand-aware: /i is one of the itineraries domain's own pages too.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "A shared itinerary | White Glove Itineraries" : "A shared itinerary | White Glove Kosher Travel",
    description: "An itinerary shared with you.",
    path: "/i",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

export default async function SharedItineraryPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const shared = await getSharedItineraryByShareId(shareId);

  if (!shared) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar />
        <section className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-8">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">This trip isn&apos;t available</h1>
          <p className="mt-4 text-stone-600">The link may have been turned off, or the trip hasn&apos;t been built yet. Ask the person who shared it for a fresh link.</p>
          <Link href="/" className="mt-8 inline-block border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white">Back to White Glove</Link>
        </section>
        <Footer />
      </main>
    );
  }

  // Somebody has opened the link. Recorded only when it is NOT the advisor
  // (or their colleague) checking their own work — see noteShareOpened.
  await noteShareOpened(shareId, shared.ownerEmail);

  const itin = { ...emptyItinerary(), ...shared.itinerary };
  // The same two things the planner reads. This page was reading neither, so
  // one trip gave one set of driving times on the screen it was built on and
  // another on the link that was sent to the person actually driving it.
  const [crossings, assume, collaboration] = await Promise.all([
    allCrossings(),
    readAssumptions(),
    readCollaborationSettings(),
  ]);
  const borderCost = borderCostForLegs(crossings, new Date().toISOString().slice(0, 10), assume.borderAllowanceMins);
  const days = itin.startDate && itin.endDate ? buildDays(itin, borderCost, assume) : [];
  const sharedByName = shared.ownerName || shared.ownerEmail;

  // The same short list the printed cover carries.
  const summary = [
    { label: "Shared by", value: sharedByName },
    itin.startDate && itin.endDate ? { label: "When", value: `${itin.startDate} → ${itin.endDate}` } : null,
    days.length ? { label: "Days", value: String(days.length) } : null,
    travelerSummary(itin) ? { label: "Travelling", value: travelerSummary(itin) } : null,
    itin.flights.length ? { label: "Flights", value: String(itin.flights.length) } : null,
    itin.activities.length ? { label: "Stops", value: String(itin.activities.length) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  // Read straight from the data here — this page renders on the server, so it
  // needs no round trip the way the planner does.
  const burials = burialsForSlugs(itin.activities.map((a) => a.keverSlug ?? ""));

  // What a note can be attached to, by the name a person would recognise. Only
  // what is still on the trip: a note about a deleted stop is kept and says so
  // rather than being filed under something that is not there.
  const commentTargets = [
    ...itin.flights.map((f) => ({ id: f.id, label: `Flight ${f.from} → ${f.to}` })),
    ...itin.lodging.filter((l) => l.name?.trim()).map((l) => ({ id: l.id, label: l.name })),
    ...itin.activities.filter((a) => a.name?.trim()).map((a) => ({ id: a.id, label: a.name })),
  ];
  const userAgent = (await headers()).get("user-agent") || "";
  const device = /Mobi|Android/i.test(userAgent) ? "mobile" : "desktop";
  const footerPromotions = await getActivePromotions("itinerary-footer", `/i/${shareId}`, device);

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar />
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--gold-ink)]">Shared itinerary</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)] sm:text-3xl">
            {itin.title || "A trip"}
          </h1>

          {/* The summary as a short list rather than a paragraph of headline
              type. It is the same handful of facts the printed cover carries,
              said the same way. */}
          <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {summary.map((item) => (
              <div key={item.label} className="flex flex-wrap items-baseline gap-x-2 border-b border-[var(--gold-light)] pb-1.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{item.label}</dt>
                <dd className="text-sm text-stone-600">{item.value}</dd>
              </div>
            ))}
          </dl>

          <SharedItineraryActions itinerary={itin} shareId={shareId} />
        </div>

        {days.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[var(--gold-light)] bg-[#fcfaf6] p-6 text-center">
            <p className="text-sm text-stone-600">This trip doesn&apos;t have dates and stops yet — check back once {sharedByName} has added them.</p>
            <Link href="/" className="mt-4 inline-block border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white">Back to White Glove</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {days.map((day) => (
              <article key={day.date} className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--gold-light)] pb-2">
                  <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Day {day.index + 1}</h2>
                  <p className="text-sm font-semibold text-stone-500">{day.label}</p>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {day.flightsArriving.map((f) => (
                    <p key={`a${f.id}`} className="flex items-start gap-1.5 text-[var(--navy)]">
                      <Icon name="plane" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Arrive {f.to}{f.arriveTime ? ` at ${f.arriveTime}` : ""} <span className="text-stone-500">({f.from} → {f.to}{f.airline ? `, ${f.airline}` : ""})</span></span>
                    </p>
                  ))}
                  {day.activities.map((a) => (
                    <div key={a.id} className="border-t border-[var(--gold-light)] pt-2 first:border-t-0 first:pt-0">
                      {a.distanceFromPrev !== null && <p className="text-[11px] uppercase tracking-wide text-stone-400">↓ {formatKm(a.distanceFromPrev)} from previous stop</p>}
                      <p className="text-base"><strong className="text-[var(--navy)]">{a.startTime ? `${a.startTime} · ` : ""}{a.name}</strong>{a.yiddishName ? <span className="text-stone-500"> · {a.yiddishName}</span> : null}</p>
                      {a.address ? <p className="text-stone-600">{a.address}</p> : null}
                      {a.keverSlug && burials[a.keverSlug]?.length ? (
                        <p className="text-stone-700"><span className="font-semibold text-[var(--gold-ink)]">Buried here: </span>{burials[a.keverSlug].join(" · ")}</p>
                      ) : null}
                      {a.phone ? (
                        <p className="flex items-center gap-1.5 text-stone-500">
                          <Icon name="phone" className="h-4 w-4 shrink-0" />
                          {a.phone}
                        </p>
                      ) : null}
                      {a.href ? <p><a href={a.href} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2" target="_blank" rel="noreferrer">Details →</a></p> : null}
                      {a.notes ? <p className="text-stone-500">{a.notes}</p> : null}
                    </div>
                  ))}
                  {day.flightsDeparting.map((f) => (
                    <p key={`d${f.id}`} className="flex items-start gap-1.5 text-[var(--navy)]">
                      <Icon name="plane" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Depart {f.from}{f.departTime ? ` at ${f.departTime}` : ""} <span className="text-stone-500">({f.from} → {f.to}{f.airline ? `, ${f.airline}` : ""})</span></span>
                    </p>
                  ))}
                  <p className="flex items-start gap-1.5 pt-1 text-stone-600">
                    <Icon name="bed" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><strong>Tonight:</strong> {day.lodging ? (day.lodging.type === "overnight-transit" ? `Overnight ${day.lodging.name || "bus/flight"}` : day.lodging.name) : "— to be arranged —"}{day.lodging?.address ? ` — ${day.lodging.address}` : ""}{day.lodging?.phone ? ` · ${day.lodging.phone}` : ""}</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* The traveler's own notes travel with the trip, which is what the
            planner tells them when they write them. */}
        {itin.notes?.trim() && (
          <div className="mt-8 rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">{itin.notes.trim()}</p>
          </div>
        )}

        {/* Notes from the people this was shared with. Reading and writing are
            both checked on the server against the owner's record — this only
            decides what to draw. Signed-out visitors see nothing at all. */}
        <TripComments
          shareId={shareId}
          owner={shared.ownerEmail}
          now={new Date().toISOString()}
          liveIds={commentTargets.map((t) => t.id)}
          labels={Object.fromEntries(commentTargets.map((t) => [t.id, t.label]))}
        />

        {(collaboration.votingEnabled || collaboration.sharedFavoritesEnabled) && (
          <div className="mt-8 rounded-2xl border border-[var(--gold-light)] bg-[#fcfaf6] p-5 sm:p-6">
            <TripGroupTools
              shareId={shareId}
              votingEnabled={collaboration.votingEnabled}
              favoritesEnabled={collaboration.sharedFavoritesEnabled}
            />
          </div>
        )}

        <p className="mt-8 text-center text-xs text-stone-400">Details are traveler-provided and gathered from public sources — please confirm bookings and access before you travel.</p>

        <ItineraryFooter promotion={footerPromotions[0] ?? null} />
      </section>
      <Footer />
    </main>
  );
}
