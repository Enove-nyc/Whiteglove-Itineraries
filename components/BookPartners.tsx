"use client";

import { useEffect, useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { airportCode, describeSearch, searchProblem, type SearchShape } from "@/lib/kayak-search";
import { hotelButtonLabel } from "@/lib/stay22";
import DateField from "@/components/DateField";
import type { AffiliateRequest } from "@/lib/affiliate/partners";
import { goHref } from "@/lib/affiliate/request";
import { isPricedFlightRow } from "@/lib/flight-book-href";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useRequireSignIn } from "@/components/SignInGate";
import { emptyItinerary, type ItinActivity, type ItinFlight, type ItinLodging, type Itinerary } from "@/data/itinerary";
import { correctedEnd, earliestEnd, nextDay, notBefore, today } from "@/lib/date-range";
import { PartnerResultsPanel, moneyLabel, type PartnerResultRow } from "@/components/PartnerResultsPanel";
import AirportAutocomplete from "@/components/AirportAutocomplete";
import CarPrices from "@/components/CarPrices";
import type { PartnerLiveCapabilities } from "@/lib/partner-live";

// Unified "Book" experience. The traveler makes two choices, in order:
//   1. how they're paying — cash or miles/points;
//   2. what they're booking — flights, hotels or cars.
// Cash hands off to a partner that takes payment (affiliate-ready deep links).
// Miles can't be handed off the same way: award seats and award nights come
// out of the traveler's own loyalty account, so nobody but them can complete
// the booking. There we help them find the award and check it's worth the
// points, then send them to their own program.
// After a cash partner handoff, a prompt asks them to save what they booked.

type Pay = "cash" | "miles";
type Kind = "flights" | "hotels" | "cars";

// The search panel is laid out the way booking sites lay one out: fields sit
// shoulder to shoulder inside a single bordered block, divided by hairlines,
// rather than floating as separate boxes with gaps between them. The hairlines
// come from a 1px grid gap over a gold background, so they stay perfectly even
// however the grid wraps.
const fieldLabel = "text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500";
/**
 * The field inside the panel, and why it has a height of its own.
 *
 * IT WAS 24 PIXELS TALL ON A PHONE — the height of one line of 15px text, with
 * the padding belonging to the label around it rather than to the control. The
 * label is what a tap lands on, so the form worked; what it cost was the thumb
 * accuracy every other control on this site is built for (min-h-11 is 44px, the
 * number in both the WCAG target-size rule and Apple's guidance), and a date or
 * a number input is exactly where a miss is expensive. The cell's own padding
 * comes down by the same amount the control goes up, so the panel is barely
 * taller than it was.
 */
const bareInput = "mt-1 min-h-11 w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-normal normal-case tracking-normal text-[var(--navy)] outline-none placeholder:text-stone-400";

function SearchGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // overflow-visible so airport, address and date pickers can open below the
  // grid — overflow-hidden was clipping them and made every dropdown look dead.
  return <div className={`grid gap-px overflow-visible rounded-2xl border border-[var(--gold-light)] bg-[var(--gold-light)] shadow-[0_8px_24px_rgba(23,45,82,.06)] ${className}`}>{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col justify-center bg-[#fcfaf6] px-4 py-2.5 transition focus-within:bg-white sm:py-3 ${className}`}>
      <span className={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

/**
 * Hand the traveller off, by asking /go for the partner rather than knowing one.
 *
 * THIS PAGE USED TO BUILD THE PARTNER URL ITSELF, which meant the page had to
 * be handed the money to build it with: the Stay22 ID, the Travelpayouts
 * marker, the Booking.com affiliate ID and the pasted redirect links. A client
 * component's props are serialised into the page, so every one of those was
 * readable in view-source by anybody who pressed Ctrl-U. Measured on the built
 * page before this changed, not assumed.
 *
 * Now it sends what the traveller typed to /go, which resolves the partner on
 * the server, records the click and redirects. Same door out as the rest of
 * the site — the reason for one door is still the months of car hire that went
 * out untagged while the settings screen said otherwise — and the account
 * numbers stay on the server where they belong.
 *
 * The new tab is opened synchronously with the press. Building the address
 * first and opening after an await would be the same thing to read and a popup
 * blocker to the browser, because the window would no longer be opening in
 * response to a click.
 */
function openPartner(request: AffiliateRequest) {
  if (typeof window === "undefined") return;
  window.open(goHref({ ...request, page: "/book" }), "_blank", "noopener,noreferrer");
}

/** What a form would put on the trip, once we know it was actually booked. */
export type PendingBooking = {
  kind: "flight" | "hotel" | "car";
  /** A line the traveler will recognise: "JFK → KRK, 11 Aug". */
  summary: string;
  /** Puts it on the trip, with the reference they were given. */
  save: (confirmation: string) => void;
};

/**
 * EVERY SEARCH ON THIS PAGE HANDS OFF TO A PARTNER. Nothing is booked here.
 *
 * There used to be a third option: Duffel, searching and booking in the site,
 * taking a card and issuing a ticket. That is a different business from being
 * paid to send somebody to a partner — it creates an obligation to the
 * traveler that a referral link does not — and it now lives at /admin/duffel,
 * off the public site entirely. lib/booking-partners.ts cannot route the
 * public site to it at all.
 */
export default function BookPartners({
  prefill,
  initialKind = "hotels",
}: {
  prefill?: Prefill;
  /**
   * Which tab opens. HOTELS BY DEFAULT, not flights: accommodation is the one
   * product this site knows something a comparison site does not — which
   * quarter makes Shabbos walkable, what is within a walk of it — so it is the
   * tab that earns the visit. Flights and cars are the same search anybody can
   * run anywhere.
   *
   * The page resolves `?type=` and hands it in, rather than this component
   * reading the URL in an effect after mount. It used to do the latter, which
   * meant a link to the car search painted Hotels first and swapped a frame
   * later — visible, and wrong for the whole of that frame. It matters more now
   * that /cars is this tab rather than a page.
   */
  initialKind?: Kind;
}) {
  const [pay, setPay] = useState<Pay>("cash");
  const requireSignIn = useRequireSignIn();
  const [kind, setKind] = useState<Kind>(initialKind);

  /**
   * THE TAB SURVIVES A RELOAD, WHICH IT DID NOT.
   *
   * The tab lived only in this component's state, and the page defaults to
   * Where to stay. So anybody halfway through a car search who reloaded — or
   * came back to the tab, or was reloaded by the browser — landed on Where to
   * stay with everything they had typed gone, and no way to tell what had
   * happened.
   *
   * Written with replaceState rather than a router navigation on purpose: a
   * navigation would re-render the page and throw away the very form state
   * this exists to protect. It also costs nothing and gives something back —
   * the address bar now describes the search, so it can be sent to somebody.
   */
  const chooseKind = (next: Kind) => {
    setKind(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("type", next);
    window.history.replaceState(null, "", url);
  };
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const [live, setLive] = useState<PartnerLiveCapabilities>({ hotels: false, flights: false, cars: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/partners/capabilities")
      .then((r) => r.json())
      .then((data: PartnerLiveCapabilities) => {
        if (!cancelled && data && typeof data === "object") {
          setLive({
            hotels: Boolean(data.hotels),
            flights: Boolean(data.flights),
            cars: Boolean(data.cars),
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Put a booked flight, stay or car onto the traveler's trip.
   *
   * SIGNED IN, AND ONTO THE ACCOUNT'S OWN TRIP. This used to merge into
   * whatever localStorage held and write it back, so a signed-out visitor
   * could book through a partner and "add it to the trip" into a browser
   * that no other device would ever see. The sign-in dialog opens first and
   * the add runs on the far side of it, against the account's real trip.
   */
  function addToTrip(patch: { flights?: ItinFlight[]; lodging?: ItinLodging[]; activities?: ItinActivity[]; dates?: string[] }) {
    requireSignIn(async () => {
      let itin: Itinerary = emptyItinerary();
      try {
        const res = await fetch("/api/account/itinerary", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data?.itinerary) itin = { ...emptyItinerary(), ...data.itinerary };
        }
      } catch {
        /* start fresh */
      }
      const next: Itinerary = {
        ...itin,
        flights: [...(itin.flights ?? []), ...(patch.flights ?? [])],
        lodging: [...(itin.lodging ?? []), ...(patch.lodging ?? [])],
        activities: [...(itin.activities ?? []), ...(patch.activities ?? [])],
      };
      const dates = (patch.dates ?? []).filter(Boolean).sort();
      if (dates.length) {
        if (!next.startDate || dates[0] < next.startDate) next.startDate = dates[0];
        if (!next.endDate || dates[dates.length - 1] > next.endDate) next.endDate = dates[dates.length - 1];
      }
      await fetch("/api/account/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary: next }),
      }).catch(() => undefined);
    }, "Sign in to add this to your trip");
  }

  // Whether the tab you are looking at searches here or hands off to a
  // partner. Both the note beside the toggle and the one under the panel say
  // what actually happens next, so neither can promise the wrong thing.

  return (
    <div className="overflow-visible rounded-[2rem] border border-[var(--gold-light)] bg-white shadow-[0_24px_60px_rgba(23,45,82,.10)]">
      {/* ---- How are you paying? A segmented control, so the choice reads as
           one control with two settings rather than two competing panels. ---- */}
      <div className="flex flex-wrap items-center justify-between gap-5 border-b border-[var(--gold-light)] bg-[#fcfaf6] px-5 py-5 sm:px-8 sm:py-6">
        <div className="relative grid h-14 w-full max-w-[21rem] min-w-0 grid-cols-2 overflow-hidden rounded-full border border-[var(--gold-light)] bg-white p-1.5 shadow-[0_4px_14px_rgba(23,45,82,.08)]">
          <span aria-hidden="true" className={`absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-0.375rem)] rounded-full bg-[var(--navy)] shadow-sm transition-transform duration-300 ease-out ${pay === "miles" ? "translate-x-full" : "translate-x-0"}`} />
          <PayToggle active={pay === "cash"} onClick={() => setPay("cash")}>Cash</PayToggle>
          <PayToggle active={pay === "miles"} onClick={() => setPay("miles")}>Miles &amp; points</PayToggle>
        </div>
        <p className="min-w-0 text-xs leading-5 text-stone-500">
          {pay === "miles"
            ? "Find the award, check the value, book it in your own program."
            : "Booking and payment happen with a trusted partner."}
        </p>
      </div>

      {/* ---- What are you booking? ---- */}
      <div className="grid grid-cols-3 gap-1.5 border-b border-[var(--gold-light)] bg-white px-5 py-4 sm:px-8">
        <TabButton active={kind === "hotels"} onClick={() => chooseKind("hotels")}>Where to stay</TabButton>
        <TabButton active={kind === "flights"} onClick={() => chooseKind("flights")}>Flights</TabButton>
        <TabButton active={kind === "cars"} onClick={() => chooseKind("cars")}>Cars</TabButton>
      </div>

      <div className="px-5 py-7 sm:px-8 sm:py-9">

      {/* Hotels: Stay22 live options when the API key is set. Flights: one
          White Glove form, then Aviasales / Kayak (or live rows when real).
          Cars: Localrent partner form. White Glove never takes payment —
          Duffel checkout stays admin-only. */}
      {pay === "cash" && kind === "flights" && (
        <FlightsForm onAdd={addToTrip} onOpened={setPending} prefill={prefill} />
      )}
      {pay === "cash" && kind === "hotels" && (
        <HotelsForm onAdd={addToTrip} onOpened={setPending} prefill={prefill} liveEnabled={live.hotels} />
      )}
      {pay === "cash" && kind === "cars" && <CarsForm onAdd={addToTrip} onOpened={setPending} prefill={prefill} />}

      {pay === "miles" && kind === "flights" && <MilesFlightsForm onAdd={addToTrip} />}
      {pay === "miles" && kind === "hotels" && <MilesHotelsForm onAdd={addToTrip} />}
      {pay === "miles" && kind === "cars" && <MilesCarsForm onAdd={addToTrip} />}

      </div>

      {pending && (
        <BookedPrompt
          booking={pending}
          onDone={() => setPending(null)}
          onDismiss={() => setPending(null)}
        />
      )}

      {/* Says what happens when you press the button on the tab you are
          actually looking at, rather than describing the page in general. */}
      <p className="border-t border-[var(--gold-light)] bg-[#fcfaf6] px-5 py-5 text-xs leading-6 text-stone-500 sm:px-8">
        {pay === "miles"
          ? "Award bookings are finished inside your own loyalty account."
          : "After you book, add the details to your itinerary."}
      </p>
    </div>
  );
}

type AddFn = (patch: { flights?: ItinFlight[]; lodging?: ItinLodging[]; activities?: ItinActivity[]; dates?: string[] }) => void;

/**
 * What the trip already knows, carried in the address.
 *
 * Somebody who has just written their dates into the planner should not have
 * to type them again to look at flights. Read once, at first render, so the
 * form stays theirs to change afterwards.
 */
/**
 * What a link may fill in before anybody types.
 *
 * `destination` is the place, and it belongs to the two searches that ask for
 * one — the car pick-up and the hotel city. It arrives from the destination
 * pages, which know where the visitor is going: `/book?type=cars&destination=Rome`
 * is what /cars used to be, and a link that says the site knows where you are
 * going and then asks again is worse than one that never claimed to.
 *
 * It is NOT used to prefill a flight. That form asks for an airport code, this
 * site holds none for a vacation destination, and several destinations are
 * regions with three airports — see components/DestinationStickyCta.tsx.
 */
export type Prefill = { from?: string; to?: string; depart?: string; ret?: string; destination?: string };

// ---- Cash --------------------------------------------------------------

/**
 * Cash flights — one White Glove form, then partner hand-offs.
 *
 * Trip type and nonstop sit here and are passed into Aviasales / Kayak with
 * the typed route. Live priced rows appear only when Travelpayouts actually
 * returns them. There is no second search form embedded on this page.
 */
type TripKind = "round-trip" | "one-way" | "multi-city";
type ExtraLeg = { from: string; to: string; date: string };
const blankLeg = (): ExtraLeg => ({ from: "", to: "", date: "" });
const MAX_FLIGHT_LEGS = 6;

/**
 * What a search with no fare of ours says. Two lines, and the same words the
 * server uses — kept here as well so a failed request says the honest thing
 * rather than nothing.
 */
const NO_PRICED_FLIGHTS = "No priced flights for those dates on White Glove.";
const SEARCH_WITH_A_PARTNER = "Nothing is invented here — search on Aviasales or compare on Kayak.";

function FlightsForm({
  onAdd,
  onOpened,
  prefill,
}: {
  onAdd: AddFn;
  onOpened: (b: PendingBooking) => void;
  prefill?: Prefill;
}) {
  const [from, setFrom] = useState(prefill?.from ?? "");
  const [to, setTo] = useState(prefill?.to ?? "");
  const [depart, setDepart] = useState(prefill?.depart ?? "");
  const [ret, setRet] = useState(prefill?.ret ?? "");
  const [trip, setTrip] = useState<TripKind>("round-trip");
  const [extraLegs, setExtraLegs] = useState<ExtraLeg[]>([blankLeg()]);
  const [nonstop, setNonstop] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [liveDetail, setLiveDetail] = useState("");
  const [rows, setRows] = useState<PartnerResultRow[]>([]);
  const [kayakHref, setKayakHref] = useState("");

  const origin = airportCode(from);
  const destination = airportCode(to);
  const oneWay = trip === "one-way";
  const multiCity = trip === "multi-city";

  function codedLegs() {
    const first = { from: origin, to: destination, date: depart };
    if (!multiCity) return [first];
    return [
      first,
      ...extraLegs.map((leg) => ({
        from: airportCode(leg.from),
        to: airportCode(leg.to),
        date: leg.date,
      })),
    ];
  }

  function searchShape(): SearchShape {
    const legs = codedLegs();
    if (multiCity) return { trip: "multi-city", legs };
    if (oneWay) return { trip: "one-way", legs: [legs[0]] };
    return { trip: "round-trip", legs: [legs[0]], ret };
  }

  /**
   * The hand-off for the typed trip, through /go so the click is recorded and
   * the address is built on the server.
   *
   * The partner is NAMED because this form shows two of them side by side: one
   * button says it opens Aviasales and the other says Kayak, and a single
   * "the flight partner" setting cannot answer both. What the name buys is a
   * results list — the traveller lands on the fares for the route and dates
   * they just typed, rather than on a second empty search box, which is what
   * the page did before.
   */
  function flightHandoff(partner: "aviasales" | "kayak") {
    return goHref({
      product: "flight",
      partner,
      legs: codedLegs(),
      checkOut: oneWay || multiCity ? "" : ret,
      nonstop,
      page: "/book",
      placement: "book-flights",
    });
  }
  const summary = describeSearch(searchShape()) || "Flight";

  function validate() {
    const problem = searchProblem(searchShape());
    if (problem) {
      setError(problem);
      return false;
    }
    if (!oneWay && !multiCity && ret && ret < today()) {
      setError("Return date cannot be in the past.");
      return false;
    }
    setError("");
    return true;
  }

  function addToTrip(confirmation?: string) {
    const date = depart || "";
    const legs = codedLegs().filter((leg) => leg.from && leg.to && leg.date);
    if (legs.length) {
      const flights: ItinFlight[] = legs.map((leg) => ({
        id: uid(),
        from: leg.from,
        to: leg.to,
        date: leg.date,
        bookedOnSite: false,
        confirmation,
      }));
      if (!oneWay && !multiCity && ret) {
        flights.push({ id: uid(), from: destination, to: origin, date: ret, bookedOnSite: false, confirmation });
      }
      onAdd({ flights, dates: flights.map((f) => f.date) });
      return;
    }
    onAdd({
      activities: [
        {
          id: uid(),
          name: summary,
          date: date || ret || "",
          notes: confirmation ? `Reference ${confirmation}` : "",
          bookedOnSite: false,
        },
      ],
    });
  }

  function openKayak() {
    if (!validate()) return;
    const href = kayakHref || flightHandoff("kayak");
    if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
    onOpened({ kind: "flight", summary, save: (confirmation) => addToTrip(confirmation) });
  }

  /**
   * Open Aviasales with the typed trip on the same click (popup-safe). Live
   * priced rows are loaded in the background when the Search API has any.
   */
  function openAviasales() {
    if (!validate()) return;
    const href = flightHandoff("aviasales");
    if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
    onOpened({ kind: "flight", summary, save: (confirmation) => addToTrip(confirmation) });
    void loadLiveFares();
  }

  async function loadLiveFares() {
    setLoading(true);
    setRows([]);
    setLiveMessage("");
    setLiveDetail("");
    try {
      const response = await fetch("/api/partners/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: from,
          destination: to,
          departDate: depart,
          returnDate: oneWay || multiCity ? undefined : ret,
          legs: multiCity ? codedLegs() : undefined,
          nonstop,
        }),
      });
      const data = await response.json();
      setKayakHref(typeof data?.kayakHref === "string" ? data.kayakHref : "");
      if (data?.ok && data.mode === "live" && Array.isArray(data.flights) && data.flights.length > 0) {
        // Only a real fare, on the network that quoted it, at the address the
        // offer actually lives at — never a Kayak compare row dressed up as a
        // price. Same list the server built these rows from; see
        // lib/flight-book-href.ts.
        const priced = data.flights.filter(isPricedFlightRow);
        if (priced.length > 0) {
          setLiveMessage(data.message ?? "");
          setLiveDetail(data.detail ?? "");
          setRows(
            priced.map(
              (flight: {
                id: string;
                title: string;
                subtitle?: string;
                meta?: string;
                stopDetail?: string;
                logoUrl?: string;
                price?: number;
                currency?: string;
                bookHref: string;
              }) => ({
                id: flight.id,
                title: flight.title,
                subtitle: flight.subtitle,
                meta: flight.meta,
                stopDetail: flight.stopDetail,
                logoUrl: flight.logoUrl,
                logoAlt: flight.title,
                priceLabel: moneyLabel(flight.price, flight.currency ?? "USD"),
                ctaLabel: "View & book",
                onOpen: () => {
                  if (typeof window !== "undefined") window.open(flight.bookHref, "_blank", "noopener,noreferrer");
                  onOpened({ kind: "flight", summary: flight.title, save: (confirmation) => addToTrip(confirmation) });
                },
              }),
            ),
          );
          setLoading(false);
          return;
        }
      }
      // Usual case: the Search API has no fare for these dates. One line
      // saying so, and nothing else — the Aviasales tab is already open behind
      // this page and Kayak is one press away. There is no second search form
      // to point at, which is what the old wording did.
      const compare = data?.ok && data.mode === "compare";
      setLiveMessage(compare && typeof data.message === "string" ? data.message : NO_PRICED_FLIGHTS);
      setLiveDetail(compare && typeof data.detail === "string" ? data.detail : SEARCH_WITH_A_PARTNER);
    } catch {
      setLiveMessage(NO_PRICED_FLIGHTS);
      setLiveDetail(SEARCH_WITH_A_PARTNER);
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3" data-choice-row="trip type">
        {(["round-trip", "one-way", "multi-city"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setTrip(type);
              setRows([]);
              if (type === "multi-city") setExtraLegs((current) => (current.length ? current : [blankLeg()]));
            }}
            className={`min-h-11 w-full border px-2 py-2 text-xs font-bold uppercase tracking-[0.1em] sm:w-auto sm:px-3 ${trip === type ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold-light)] text-[var(--navy)]"}`}
          >
            {type.replace("-", " ")}
          </button>
        ))}
        <label className="col-span-3 flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--navy)] sm:ml-auto sm:min-h-0">
          <input
            type="checkbox"
            checked={nonstop}
            onChange={(event) => setNonstop(event.target.checked)}
            className="h-4 w-4 accent-[var(--navy)]"
          />
          Nonstop only
        </label>
      </div>
      <SearchGrid className="mt-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr]">
        <Field label={multiCity ? "From — flight 1" : "From"}>
          <AirportAutocomplete value={from} onChange={setFrom} className={bareInput} />
        </Field>
        <Field label={multiCity ? "To — flight 1" : "To"}>
          <AirportAutocomplete value={to} onChange={setTo} className={bareInput} />
        </Field>
        <Field label={multiCity ? "Date — flight 1" : "Departure"}>
          <DateField
            ariaLabel={multiCity ? "Flight 1 date" : "Departure date"}
            value={depart}
            min={today()}
            onChange={(v) => {
              setDepart(v);
              if (!oneWay && !multiCity) setRet((current) => correctedEnd(v, current, "inclusive"));
              if (multiCity) {
                setExtraLegs((current) => {
                  let prev = v;
                  return current.map((leg) => {
                    const date = correctedEnd(prev, leg.date, "inclusive");
                    prev = date || prev;
                    return { ...leg, date };
                  });
                });
              }
            }}
            className={bareInput}
          />
        </Field>
        {multiCity ? (
          <Field label="Return">
            <span className="mt-1 block min-h-11 text-sm text-stone-400">Multi-city</span>
          </Field>
        ) : !oneWay ? (
          <Field label="Return">
            <DateField
              ariaLabel="Return date"
              value={ret}
              min={notBefore(today(), depart)}
              onChange={(v) => setRet(correctedEnd(depart, v, "inclusive"))}
              className={bareInput}
            />
          </Field>
        ) : (
          <Field label="Return">
            <span className="mt-1 block min-h-11 text-sm text-stone-400">One-way</span>
          </Field>
        )}
      </SearchGrid>
      {multiCity
        ? extraLegs.map((leg, index) => {
            const prevDate = index === 0 ? depart : extraLegs[index - 1]?.date;
            return (
              <SearchGrid key={index} className="mt-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr]">
                <Field label={`From — flight ${index + 2}`}>
                  <AirportAutocomplete
                    value={leg.from}
                    onChange={(value) =>
                      setExtraLegs((current) => current.map((item, i) => (i === index ? { ...item, from: value } : item)))
                    }
                    className={bareInput}
                  />
                </Field>
                <Field label={`To — flight ${index + 2}`}>
                  <AirportAutocomplete
                    value={leg.to}
                    onChange={(value) =>
                      setExtraLegs((current) => current.map((item, i) => (i === index ? { ...item, to: value } : item)))
                    }
                    className={bareInput}
                  />
                </Field>
                <Field label={`Date — flight ${index + 2}`}>
                  <DateField
                    ariaLabel={`Flight ${index + 2} date`}
                    value={leg.date}
                    min={notBefore(today(), prevDate)}
                    onChange={(value) =>
                      setExtraLegs((current) => {
                        const next = current.map((item, i) => (i === index ? { ...item, date: value } : item));
                        let prev = value;
                        return next.map((item, i) => {
                          if (i <= index) return item;
                          const date = correctedEnd(prev, item.date, "inclusive");
                          prev = date || prev;
                          return { ...item, date };
                        });
                      })
                    }
                    className={bareInput}
                  />
                </Field>
                <div className="flex items-end bg-[#fcfaf6] px-4 py-2.5">
                  {extraLegs.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setExtraLegs((current) => current.filter((_, i) => i !== index))}
                      className="min-h-11 text-xs font-bold uppercase tracking-[0.1em] text-stone-600"
                    >
                      Remove flight
                    </button>
                  ) : (
                    <span className="mt-1 block min-h-11 text-sm text-stone-400"> </span>
                  )}
                </div>
              </SearchGrid>
            );
          })
        : null}
      {multiCity && extraLegs.length + 1 < MAX_FLIGHT_LEGS ? (
        <button
          type="button"
          onClick={() => {
            const lastTo = extraLegs.length ? extraLegs[extraLegs.length - 1].to : to;
            setExtraLegs((current) => [...current, { from: lastTo, to: "", date: "" }]);
          }}
          className="mt-3 min-h-11 border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)]"
        >
          + Add flight
        </button>
      ) : null}
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      <ActionRow
        onSearch={openAviasales}
        searchLabel="Open Aviasales"
        secondary={{ label: "Compare on Kayak", onClick: openKayak }}
      />
      <PartnerResultsPanel loading={loading} message={liveMessage} detail={liveDetail} rows={rows} />
      <button
        type="button"
        onClick={() => onOpened({ kind: "flight", summary, save: (confirmation) => addToTrip(confirmation) })}
        className="mt-4 min-h-11 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
      >
        I booked it — add it to my trip
      </button>
    </div>
  );
}

function HotelsForm({
  onAdd,
  onOpened,
  prefill,
  liveEnabled = false,
}: {
  onAdd: AddFn;
  onOpened: (b: PendingBooking) => void;
  prefill?: Prefill;
  liveEnabled?: boolean;
}) {
  const [dest, setDest] = useState(prefill?.destination ?? "");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [guests, setGuests] = useState("2");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [liveDetail, setLiveDetail] = useState("");
  const [rows, setRows] = useState<PartnerResultRow[]>([]);

  function validate() {
    if (!dest.trim()) {
      setError("Enter a city or destination.");
      return false;
    }
    if (!checkin || !checkout) {
      setError("Choose check-in and check-out dates.");
      return false;
    }
    if (checkout <= checkin) {
      setError("Check-out must be after check-in.");
      return false;
    }
    setError("");
    return true;
  }

  function handOff() {
    openPartner({
      product: "hotel",
      destination: dest.trim(),
      checkIn: checkin,
      checkOut: checkout,
      adults: Math.max(1, Number(guests) || 1),
      placement: "book-hotels",
    });
    onOpened({
      kind: "hotel",
      summary: `${dest.trim()}, ${checkin} → ${checkout}`,
      save: (confirmation) => addToTrip(confirmation),
    });
  }

  async function search() {
    if (!validate()) return;

    if (liveEnabled) {
      setLoading(true);
      setRows([]);
      setLiveMessage("");
      setLiveDetail("");
      try {
        const response = await fetch("/api/partners/hotels/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: dest.trim(),
            checkIn: checkin,
            checkOut: checkout,
            adults: Math.max(1, Number(guests) || 1),
          }),
        });
        const data = await response.json();
        // A live response with zero stays used to return here with empty rows,
        // skipping the hand-off — the user was told to "open the partner
        // search" with no button to do it. Require at least one stay to take
        // the results path; otherwise fall through to handOff() below.
        if (data?.ok && data.mode === "live" && Array.isArray(data.stays) && data.stays.length > 0) {
          setLiveMessage(data.message ?? "");
          const nextRows: PartnerResultRow[] = data.stays.map(
            (stay: {
              id: string;
              name: string;
              address?: string;
              rating?: number | null;
              stars?: number | null;
              thumbnail?: string | null;
              freeCancellation?: boolean;
              priceTotal?: number | null;
              currency: string;
              nights?: number | null;
              bookUrl: string;
            }) => ({
              id: stay.id,
              title: stay.name,
              subtitle: stay.address,
              meta: [
                stay.stars != null ? `${stay.stars}★` : null,
                stay.rating != null ? `Guest ${stay.rating}` : null,
                stay.freeCancellation ? "Free cancellation" : null,
              ]
                .filter(Boolean)
                .join(" · "),
              priceLabel: moneyLabel(stay.priceTotal, stay.currency),
              priceNote: stay.nights ? `Total for ${stay.nights} night${stay.nights === 1 ? "" : "s"}` : "Total stay",
              imageUrl: stay.thumbnail,
              ctaLabel: "View & book",
              onOpen: () => {
                if (typeof window !== "undefined") {
                  window.open(stay.bookUrl, "_blank", "noopener,noreferrer");
                }
                onOpened({
                  kind: "hotel",
                  summary: `${stay.name}, ${checkin} → ${checkout}`,
                  save: (confirmation) => addToTrip(confirmation),
                });
              },
            }),
          );
          setRows(nextRows);
          setLoading(false);
          return;
        }
        setLiveMessage(data?.message ?? "Live places to stay are not available.");
        setLiveDetail(data?.detail ?? "Opening the partner search instead.");
      } catch {
        setLiveMessage("Live places to stay could not be loaded.");
        setLiveDetail("Opening the partner search instead.");
      }
      setLoading(false);
    }

    handOff();
  }

  function addToTrip(confirmation?: string) {
    if (!validate()) return;
    const lodging: ItinLodging[] = [
      {
        id: uid(),
        type: "hotel",
        name: `Hotel in ${dest.trim()}`,
        address: dest.trim(),
        checkIn: checkin,
        checkOut: checkout,
        bookedOnSite: false,
        confirmation,
      },
    ];
    onAdd({ lodging, dates: [checkin, checkout] });
  }

  return (
    <div>
      <SearchGrid className="sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_.8fr]">
        <Field label="Destination">
          <AddressAutocomplete mode="city" value={dest} onChange={(city) => setDest(city)} placeholder="City or town" className={bareInput} />
        </Field>
        <Field label="Check in">
          <DateField
            ariaLabel="Check-in date"
            value={checkin}
            min={today()}
            onChange={(v) => {
              setCheckin(v);
              setCheckout((c) => correctedEnd(v, c, "exclusive"));
            }}
            className={bareInput}
          />
        </Field>
        <Field label="Check out">
          <DateField
            ariaLabel="Check-out date"
            value={checkout}
            min={notBefore(nextDay(today()), earliestEnd(checkin, "exclusive"))}
            onChange={(v) => setCheckout(correctedEnd(checkin, v, "exclusive"))}
            className={bareInput}
          />
        </Field>
        <Field label="Guests">
          <input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} className={bareInput} />
        </Field>
      </SearchGrid>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      <ActionRow
        onSearch={search}
        searchLabel={liveEnabled ? "Search places to stay" : hotelButtonLabel()}
        busy={loading}
        secondary={
          liveEnabled && rows.length > 0
            ? { label: "Compare all on partner", onClick: handOff }
            : undefined
        }
      />
      <PartnerResultsPanel loading={loading} message={liveMessage} detail={liveDetail} rows={rows} />
    </div>
  );
}

/**
 * Cash cars — the Localrent widget is the search.
 *
 * A White Glove city/dates form in front of this widget made people type the
 * same hire twice. A destination the site already knows is passed in; they
 * fill the rest once, in the partner form.
 */
/**
 * THE CARS TAB HAD NO FORM, which is why nothing could be searched from it.
 *
 * Flights and hotels each ask what you want; cars showed a partner's panel
 * with whatever destination happened to arrive in the page's query string, and
 * arriving at /book and pressing Cars gave a panel with nothing in it and no
 * way to say where or when. That was survivable while the panel was the whole
 * answer and had its own boxes inside it. It stopped being survivable the
 * moment White Glove had prices of its own to show, because prices need a
 * place and two dates and there was nowhere to type them.
 */
function CarsForm({ onAdd, onOpened, prefill }: { onAdd: AddFn; onOpened: (b: PendingBooking) => void; prefill?: Prefill }) {
  const [place, setPlace] = useState(prefill?.destination ?? "");
  const [pickup, setPickup] = useState(prefill?.depart ?? "");
  const [dropoff, setDropoff] = useState(prefill?.ret ?? "");
  // Searched, not typed. Prices reload when the traveler presses the button,
  // not on every keystroke — a ten-second provider called from an onChange
  // would be a queue of abandoned searches.
  const [asked, setAsked] = useState<{ place: string; pickup: string; dropoff: string } | null>(
    prefill?.destination && prefill?.depart && prefill?.ret
      ? { place: prefill.destination, pickup: prefill.depart, dropoff: prefill.ret }
      : null,
  );
  const [error, setError] = useState("");

  const loc = place.trim();
  const summary = loc ? `Rental car — ${loc}` : "Rental car";

  function search() {
    if (!loc) {
      setError("Enter a pick-up city or airport.");
      return;
    }
    if (!pickup || !dropoff) {
      setError("Choose pick-up and drop-off dates.");
      return;
    }
    if (dropoff < pickup) {
      setError("Drop-off must be on or after pick-up.");
      return;
    }
    setError("");
    setAsked({ place: loc, pickup, dropoff });
    // The same reason the tab is in the address bar: a reload halfway through
    // a car search should come back to the car search, with the city and the
    // dates still in it. The page already reads these three on the way in.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("type", "cars");
      url.searchParams.set("destination", loc);
      url.searchParams.set("depart", pickup);
      url.searchParams.set("return", dropoff);
      window.history.replaceState(null, "", url);
    }
  }

  function addToTrip(confirmation?: string) {
    onAdd({
      activities: [
        {
          id: uid(),
          name: summary,
          date: "",
          notes: confirmation ? `Reference ${confirmation}` : "",
          bookedOnSite: false,
        },
      ],
    });
  }

  return (
    <div>
      <SearchGrid className="mb-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
        {/* THE SITE'S OWN LIST, NOT THE PROVIDER'S. RouteStack can resolve a
            place name, but their plan allows four hundred calls a month and an
            autocomplete spends one per keystroke — a single impatient typist
            would eat a week of the allowance. This list is local, free, and
            already knows Kraków whichever way it is spelled. */}
        <Field label="Pick-up city or airport">
          <AirportAutocomplete value={place} onChange={setPlace} placeholder="Kraków" className={bareInput} />
        </Field>
        <Field label="Pick-up">
          <input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} className={bareInput} />
        </Field>
        <Field label="Drop-off">
          <input type="date" value={dropoff} onChange={(e) => setDropoff(e.target.value)} className={bareInput} />
        </Field>
        <div className="flex items-center bg-[#fcfaf6] px-4 py-2.5 sm:py-3">
          <button
            type="button"
            onClick={search}
            className="min-h-11 w-full rounded-xl border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            Search cars
          </button>
        </div>
      </SearchGrid>
      {error ? <p className="mb-4 text-sm font-semibold text-red-700">{error}</p> : null}

      {/* THE PARTNER PANEL IS GONE FROM HERE. It sat under these prices while
          they were unproven, on the reasoning that a page must not be left
          with nothing if a provider fails. It carried a thin, fixed set of
          cars, and White Glove's own list is now both wider and real — so the
          panel had become a second, worse answer under the first one. */}
      <CarPrices destination={asked?.place ?? ""} startDate={asked?.pickup ?? ""} endDate={asked?.dropoff ?? ""} />
      <button
        type="button"
        onClick={() => onOpened({ kind: "car", summary, save: (confirmation) => addToTrip(confirmation) })}
        className="mt-4 min-h-11 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
      >
        I booked it — add it to my trip
      </button>
    </div>
  );
}

/**
 * "Did you book it?"
 *
 * The booking happens on the partner's site, in another tab, where we cannot
 * see it. So the trip has no idea about the flight somebody just paid for
 * unless they come back and say — and nobody thinks to, because as far as they
 * are concerned the job is done.
 *
 * This asks while it is still fresh. It appears the moment the partner opens,
 * behind them, and is waiting when they come back. Not booked, or not yet, is
 * one click; there is nothing to dismiss twice.
 */
function BookedPrompt({ booking, onDone, onDismiss }: { booking: PendingBooking; onDone: () => void; onDismiss: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const what = booking.kind === "flight" ? "flight" : booking.kind === "hotel" ? "hotel" : "car";
  // The keyboard stays in here while it is open, and goes back to whatever
  // opened it when it closes. Escape is "not yet", the same as the button.
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onDismiss);

  return (
    <div className="fixed inset-0 z-[var(--wg-z-modal)] flex items-end justify-center bg-[rgba(13,31,59,.45)] p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="booked-title">
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-lg rounded-3xl border border-[var(--gold)] bg-[#fcfaf6] p-6 shadow-[0_24px_60px_rgba(23,45,82,.35)] outline-none sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Searching in the other tab</p>
        <h2 id="booked-title" className="mt-3 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)] sm:text-3xl">
          When you have booked, come back and tell us.
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Add the {what} here and it goes on your trip, reference included.
        </p>
        <p className="mt-3 border-l-4 border-[var(--gold-light)] bg-white px-3 py-2 text-sm font-semibold text-[var(--navy)]">
          {booking.summary}
        </p>

        <label className="mt-5 block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Booking reference (if you have it)</span>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="e.g. XR4K9T"
            className="mt-1.5 w-full rounded-xl border border-[var(--gold-light)] bg-white px-4 py-3 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)] focus:ring-4 focus:ring-[rgba(170,139,82,.12)]"
          />
        </label>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              booking.save(confirmation.trim());
              onDone();
            }}
            className="min-h-[46px] flex-1 rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            I booked it — add it to my trip
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[46px] rounded-full border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
          >
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  onSearch,
  searchLabel,
  busy,
  secondary,
}: {
  onSearch: () => void;
  searchLabel: string;
  busy?: boolean;
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={onSearch}
        disabled={busy}
        className="min-h-[52px] min-w-0 flex-1 rounded-full bg-[var(--navy)] px-6 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_8px_20px_rgba(23,45,82,.14)] transition hover:bg-[var(--gold)] disabled:opacity-60"
      >
        {busy ? "Searching…" : `${searchLabel} →`}
      </button>
      {secondary ? (
        <button
          type="button"
          onClick={secondary.onClick}
          className="min-h-[52px] rounded-full border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream)]"
        >
          {secondary.label}
        </button>
      ) : null}
    </div>
  );
}

function PayToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative z-10 flex min-h-11 min-w-0 items-center justify-center rounded-full px-3 text-center text-xs font-bold uppercase tracking-[0.1em] transition-colors duration-300 sm:px-5 sm:tracking-[0.12em] ${active ? "text-white" : "text-stone-500 hover:text-[var(--navy)]"}`}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-full px-3 text-xs font-bold uppercase tracking-[0.1em] transition sm:px-5 sm:tracking-[0.14em] ${active ? "bg-[var(--cream-deep)] text-[var(--navy)] shadow-[inset_0_0_0_1px_var(--gold-light)]" : "text-stone-500 hover:bg-[var(--cream)] hover:text-[var(--navy)]"}`}
    >
      {children}
    </button>
  );
}

// ---- Booking with miles & points ---------------------------------------
// Award seats and award nights can only be redeemed inside the traveler's own
// loyalty account — no third party can book them. So each of these does the
// two things that genuinely help: find where the award is, and work out
// whether spending the points beats paying cash.

const FLIGHT_PROGRAMS: Array<{ label: string; award: string }> = [
  { label: "Amex Membership Rewards", award: "https://www.americanexpress.com/en-us/travel/" },
  { label: "Chase Ultimate Rewards", award: "https://ultimaterewards.chase.com/" },
  { label: "Capital One Miles", award: "https://travel.capitalone.com/" },
  { label: "United MileagePlus", award: "https://www.united.com/en/us/book-flight/united-award-travel" },
  { label: "Delta SkyMiles", award: "https://www.delta.com/" },
  { label: "American AAdvantage", award: "https://www.aa.com/" },
  { label: "Air Canada Aeroplan", award: "https://www.aircanada.com/aeroplan" },
  { label: "Flying Blue (Air France/KLM)", award: "https://wwws.airfrance.us/flying-blue" },
  { label: "El Al Matmid", award: "https://www.elal.com/" },
];

const HOTEL_PROGRAMS: Array<{ label: string; award: string }> = [
  { label: "Marriott Bonvoy", award: "https://www.marriott.com/" },
  { label: "Hilton Honors", award: "https://www.hilton.com/" },
  { label: "World of Hyatt", award: "https://www.hyatt.com/" },
  { label: "IHG One Rewards", award: "https://www.ihg.com/" },
  { label: "Accor ALL", award: "https://all.accor.com/" },
  { label: "Wyndham Rewards", award: "https://www.wyndhamhotels.com/wyndham-rewards" },
  { label: "Choice Privileges", award: "https://www.choicehotels.com/choice-privileges" },
  { label: "Amex Membership Rewards (travel portal)", award: "https://www.americanexpress.com/en-us/travel/" },
  { label: "Chase Ultimate Rewards (travel portal)", award: "https://ultimaterewards.chase.com/" },
  { label: "Capital One Miles (travel portal)", award: "https://travel.capitalone.com/" },
];

const CAR_PROGRAMS: Array<{ label: string; award: string }> = [
  { label: "Amex Travel (pay with points)", award: "https://www.americanexpress.com/en-us/travel/car-rental/" },
  { label: "Chase Travel (pay with points)", award: "https://ultimaterewards.chase.com/" },
  { label: "Capital One Travel (pay with miles)", award: "https://travel.capitalone.com/" },
  { label: "Avis Preferred", award: "https://www.avis.com/en/association/partners" },
  { label: "Hertz Gold Plus Rewards", award: "https://www.hertz.com/rentacar/loyalty/gold-plus-rewards" },
  { label: "Sixt Card", award: "https://www.sixt.com/sixt-card/" },
];

function ProgramSelect({ programs, value, onChange, label }: { programs: Array<{ label: string; award: string }>; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${bareInput} -ml-0.5 cursor-pointer`}>
        <option value="">Choose your program…</option>
        {programs.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
      </select>
    </Field>
  );
}

/**
 * Cents per point = (what the cash booking costs, minus anything you still pay
 * on the award) ÷ the points it takes. The standard way to judge a redemption.
 */
function ValueCalculator({ unit, cashLabel, feesLabel, pointsPlaceholder, cashPlaceholder }: {
  unit: string;
  cashLabel: string;
  feesLabel: string;
  pointsPlaceholder: string;
  cashPlaceholder: string;
}) {
  const [points, setPoints] = useState("");
  const [cash, setCash] = useState("");
  const [fees, setFees] = useState("");

  const pointsNum = Number(points.replace(/[^\d.]/g, ""));
  const cashNum = Number(cash.replace(/[^\d.]/g, ""));
  const feesNum = Number(fees.replace(/[^\d.]/g, "")) || 0;
  const cpp = pointsNum > 0 && cashNum > 0 ? ((cashNum - feesNum) / pointsNum) * 100 : null;
  const verdict =
    cpp === null ? null
    : cpp >= 2 ? { text: "Strong value — worth redeeming.", tone: "text-emerald-700" }
    : cpp >= 1.2 ? { text: "Reasonable value.", tone: "text-[var(--navy)]" }
    : { text: "Weak value — paying cash is probably better.", tone: "text-amber-800" };

  return (
    <>
      <SearchGrid className="mt-2 sm:grid-cols-3">
        <Field label={`${unit} required`}><input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} placeholder={pointsPlaceholder} className={bareInput} /></Field>
        <Field label={cashLabel}><input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={cashPlaceholder} className={bareInput} /></Field>
        <Field label={feesLabel}><input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0" className={bareInput} /></Field>
      </SearchGrid>
      {cpp !== null && verdict && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-l-4 border-[var(--gold)] bg-[#fcfaf6] px-4 py-4">
          <p className="font-[family-name:var(--font-display)] text-3xl leading-none text-[var(--navy)]">{cpp.toFixed(2)}¢ <span className="text-base text-stone-500">per point</span></p>
          <p className={`text-sm font-semibold ${verdict.tone}`}>{verdict.text}</p>
          <p className="mt-1 basis-full text-xs leading-5 text-stone-500">
            (Cash price − what you still pay on the award) ÷ points. Around 1.2¢ is typical; 2¢ or more is usually good.
          </p>
        </div>
      )}
    </>
  );
}

function MilesNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-[var(--gold)] bg-white px-4 py-3 text-sm leading-6 text-stone-700">{children}</div>
  );
}

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return <p className="mt-8 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{n} · {children}</p>;
}

const linkPrimary = "inline-flex min-h-[44px] items-center rounded-full border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]";
const linkGhost = "inline-flex min-h-[44px] items-center rounded-full border border-[var(--gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white";

function MilesFlightsForm({ onAdd }: { onAdd: AddFn }) {
  const [program, setProgram] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState("");
  const selected = FLIGHT_PROGRAMS.find((p) => p.label === program);
  const query = from.trim() && to.trim() ? `?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}` : "";

  function addToTrip() {
    const o = airportCode(from);
    const d = airportCode(to);
    if (!o || !d || !when) return;
    if (when < today()) return;
    onAdd({ flights: [{ id: uid(), from: o, to: d, date: when, bookedOnSite: false }], dates: [when] });
  }

  return (
    <div>
      <MilesNote>
        Award seats are booked in your own loyalty account, on the airline&apos;s own site.
      </MilesNote>

      <SearchGrid className="mt-6 sm:grid-cols-2 lg:grid-cols-4">
        <ProgramSelect programs={FLIGHT_PROGRAMS} value={program} onChange={setProgram} label="Your miles" />
        <Field label="From"><AirportAutocomplete value={from} onChange={setFrom} placeholder="City or airport" className={bareInput} /></Field>
        <Field label="To"><AirportAutocomplete value={to} onChange={setTo} placeholder="City or airport" className={bareInput} /></Field>
        <Field label="When"><DateField ariaLabel="Date" value={when} min={today()} onChange={setWhen} className={bareInput} /></Field>
      </SearchGrid>

      <StepLabel n={1}>Find award seats (free tools)</StepLabel>
      <div className="mt-2 flex flex-wrap gap-3">
        <a href={`https://www.pointsyeah.com/search${query}`} target="_blank" rel="noreferrer" className={linkPrimary}>Search award seats on PointsYeah →</a>
        <a href="https://seats.aero/search" target="_blank" rel="noreferrer" className={linkGhost}>Search on seats.aero →</a>
        {selected && <a href={selected.award} target="_blank" rel="noreferrer" className={linkGhost}>Open {program} →</a>}
      </div>
      <StepLabel n={2}>Whether the miles are worth it</StepLabel>
      <ValueCalculator unit="Miles" cashLabel="Cash price of the same ticket" feesLabel="Taxes/fees you still pay" pointsPlaceholder="45000" cashPlaceholder="900" />

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={addToTrip} className={linkGhost}>+ Add this flight to my trip</button>
      </div>
      <p className="mt-6 text-xs leading-5 text-stone-500">
        Card-to-airline transfers are one-way. Confirm the seat first, then transfer, then book.
      </p>
    </div>
  );
}

function MilesHotelsForm({ onAdd }: { onAdd: AddFn }) {
  const [program, setProgram] = useState("");
  const [dest, setDest] = useState("");
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [error, setError] = useState("");
  const selected = HOTEL_PROGRAMS.find((p) => p.label === program);

  function addToTrip() {
    if (!dest.trim() || !checkin || !checkout) { setError("Enter a city and both dates first."); return; }
    if (checkout <= checkin) { setError("Check-out must be after check-in."); return; }
    setError("");
    onAdd({
      lodging: [{ id: uid(), type: "hotel", name: `Award stay in ${dest.trim()}${program ? ` (${program})` : ""}`, address: dest.trim(), checkIn: checkin, checkOut: checkout, bookedOnSite: false }],
      dates: [checkin, checkout],
    });
  }

  return (
    <div>
      <MilesNote>
        Points nights are booked inside your own hotel program, on the chain&apos;s own site.
      </MilesNote>

      <SearchGrid className="mt-6 sm:grid-cols-2 lg:grid-cols-4">
        <ProgramSelect programs={HOTEL_PROGRAMS} value={program} onChange={setProgram} label="Your points" />
        <Field label="Destination"><AddressAutocomplete mode="city" value={dest} onChange={(city) => setDest(city)} placeholder="City or town" className={bareInput} /></Field>
        <Field label="Check in"><DateField ariaLabel="Check-in date" value={checkin} min={today()} onChange={(v) => { setCheckin(v); setCheckout((c) => correctedEnd(v, c, "exclusive")); }} className={bareInput} /></Field>
        {/* A stay is a number of nights, so the earliest check-out is the night
            after the earliest check-in — tomorrow when nothing is chosen yet. */}
        <Field label="Check out"><DateField ariaLabel="Check-out date" value={checkout} min={notBefore(nextDay(today()), earliestEnd(checkin, "exclusive"))} onChange={(v) => setCheckout(correctedEnd(checkin, v, "exclusive"))} className={bareInput} /></Field>
      </SearchGrid>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      <StepLabel n={1}>Find award availability</StepLabel>
      <div className="mt-2 flex flex-wrap gap-3">
        {selected
          ? <a href={selected.award} target="_blank" rel="noreferrer" className={linkPrimary}>Open {program} →</a>
          : <span className="text-sm text-stone-500">Choose your program above and its award booking page opens here.</span>}
        <a href="https://awardmapper.com/" target="_blank" rel="noreferrer" className={linkGhost}>See which chains have hotels here →</a>
      </div>

      <StepLabel n={2}>Whether the points are worth it</StepLabel>
      <ValueCalculator unit="Points" cashLabel="Cash price of the same stay" feesLabel="Resort/other fees still charged" pointsPlaceholder="60000" cashPlaceholder="750" />
      <p className="mt-3 text-xs leading-5 text-stone-500">
        Check the kosher-food situation separately before you commit points.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={addToTrip} className={linkGhost}>+ Add this stay to my trip</button>
      </div>
    </div>
  );
}

function MilesCarsForm({ onAdd }: { onAdd: AddFn }) {
  const [program, setProgram] = useState("");
  const [loc, setLoc] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [error, setError] = useState("");
  const selected = CAR_PROGRAMS.find((p) => p.label === program);

  function addToTrip() {
    if (!loc.trim() || !pickup || !dropoff) { setError("Enter a pick-up city and both dates first."); return; }
    if (dropoff < pickup) { setError("Drop-off must be on or after pick-up."); return; }
    setError("");
    onAdd({
      activities: [{ id: uid(), name: `Rental car — ${loc.trim()}`, date: pickup, notes: `Drop-off ${dropoff}${program ? ` · booking with ${program}` : ""}`, bookedOnSite: false }],
      dates: [pickup, dropoff],
    });
  }

  return (
    <div>
      <MilesNote>
        Rental cars are usually the weakest way to spend points — run the numbers below first.
      </MilesNote>

      <SearchGrid className="mt-6 sm:grid-cols-2 lg:grid-cols-4">
        <ProgramSelect programs={CAR_PROGRAMS} value={program} onChange={setProgram} label="Your program" />
        <Field label="Pick-up location"><AddressAutocomplete mode="city" value={loc} onChange={(city) => setLoc(city)} placeholder="City or airport" className={bareInput} /></Field>
        <Field label="Pick-up date"><DateField ariaLabel="Pick-up date" value={pickup} min={today()} onChange={(v) => { setPickup(v); setDropoff((d) => correctedEnd(v, d)); }} className={bareInput} /></Field>
        <Field label="Drop-off date"><DateField ariaLabel="Drop-off date" value={dropoff} min={notBefore(today(), earliestEnd(pickup))} onChange={(v) => setDropoff(correctedEnd(pickup, v))} className={bareInput} /></Field>
      </SearchGrid>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

      <StepLabel n={1}>Book with your points</StepLabel>
      <div className="mt-2 flex flex-wrap gap-3">
        {selected
          ? <a href={selected.award} target="_blank" rel="noreferrer" className={linkPrimary}>Open {program} →</a>
          : <span className="text-sm text-stone-500">Choose a program above and its booking page opens here.</span>}
        {/* "Check the cash price" is a partner search like any other, and it
            was going straight out to a hand-written kayak.com address —
            untracked, unchangeable, and earning nothing whatever the earnings
            screen said. Exactly the car-hire failure this file's test exists
            for, hiding one tab along in the points section. */}
        {loc.trim() && pickup && dropoff ? (
          <a
            href={goHref({ product: "car", destination: loc.trim(), checkIn: pickup, checkOut: dropoff, page: "/book", placement: "book-cars-miles" })}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className={linkGhost}
          >
            Check the cash price →
          </a>
        ) : (
          <span className="text-sm text-stone-500">Fill in the pick-up and dates to compare the cash price.</span>
        )}
      </div>

      <StepLabel n={2}>Whether the points are worth it</StepLabel>
      <ValueCalculator unit="Points" cashLabel="Cash price of the same rental" feesLabel="Anything still charged at the counter" pointsPlaceholder="30000" cashPlaceholder="300" />

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={addToTrip} className={linkGhost}>+ Add this car to my trip</button>
      </div>
    </div>
  );
}
