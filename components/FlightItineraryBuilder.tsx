"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { addFlightItineraryAction } from "@/app/admin/flight-itineraries/actions";

/**
 * The form the owner writes a flight itinerary in.
 *
 * The flights are split into an outbound journey and a return journey — each a
 * list that can hold one flight or several — and travel to the server as two
 * JSON fields so the action does not have to guess how many rows there were or
 * which way they were going.
 *
 * WHAT IT KEEPS. Everything typed is mirrored into the browser's own storage as
 * it changes, so closing the tab or a reload does not lose a half-written
 * itinerary — it comes back exactly as it was left. The draft is cleared the
 * moment a save succeeds, and the form empties itself for the next customer.
 */

type LegDraft = {
  key: string;
  /** "", "airline" or "separate" — how this flight connects from the one before. */
  connectionType: string;
  airline: string;
  flightNumber: string;
  from: string;
  to: string;
  departDate: string;
  departTime: string;
  arriveDate: string;
  arriveTime: string;
  cabin: string;
  confirmation: string;
  notes: string;
};

type ListName = "outbound" | "returnLegs";

type FormState = {
  title: string;
  passengers: string;
  reference: string;
  notes: string;
  outbound: LegDraft[];
  returnLegs: LegDraft[];
};

const field =
  // min-w-0 so a native date input can shrink inside a two-up grid on a narrow
  // phone instead of forcing the row wider than the screen.
  "mt-1 w-full min-w-0 rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

function blankLeg(key: string): LegDraft {
  return {
    key,
    connectionType: "",
    airline: "",
    flightNumber: "",
    from: "",
    to: "",
    departDate: "",
    departTime: "",
    arriveDate: "",
    arriveTime: "",
    cabin: "",
    confirmation: "",
    notes: "",
  };
}

function emptyForm(): FormState {
  return { title: "", passengers: "", reference: "", notes: "", outbound: [blankLeg("out-0")], returnLegs: [] };
}

const DRAFT_KEY = "white-glove:flight-itinerary-draft";

/** A leg as it is stored and sent — the client-only key left off. */
function legForSaving(leg: LegDraft) {
  const { key: _key, ...rest } = leg;
  void _key;
  return rest;
}

/** Nothing worth keeping — every field blank across both journeys. */
function isEmptyForm(form: FormState): boolean {
  if (form.title || form.passengers || form.reference || form.notes) return false;
  const anyLegFilled = [...form.outbound, ...form.returnLegs].some((leg) =>
    Object.entries(leg).some(([k, v]) => k !== "key" && v.trim() !== ""),
  );
  return !anyLegFilled;
}

function loadDraft(): FormState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    // Rebuild through the known shape so a stale or hand-edited draft cannot
    // put an unexpected field into state. Keys are re-minted fresh and in
    // order, so nothing a later add() makes can collide with them.
    let n = 0;
    const list = (value: unknown): LegDraft[] =>
      Array.isArray(value)
        ? value.map((leg) => ({ ...blankLeg(`d-${n++}`), ...pickLeg(leg) }))
        : [];
    const outbound = list((parsed as FormState).outbound);
    return {
      title: str((parsed as FormState).title),
      passengers: str((parsed as FormState).passengers),
      reference: str((parsed as FormState).reference),
      notes: str((parsed as FormState).notes),
      outbound: outbound.length ? outbound : [blankLeg(`d-${n++}`)],
      returnLegs: list((parsed as FormState).returnLegs),
    };
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickLeg(leg: unknown): Partial<LegDraft> {
  const source = (leg ?? {}) as Record<string, unknown>;
  const out: Partial<LegDraft> = {};
  for (const k of [
    "connectionType",
    "airline",
    "flightNumber",
    "from",
    "to",
    "departDate",
    "departTime",
    "arriveDate",
    "arriveTime",
    "cabin",
    "confirmation",
    "notes",
  ] as const) {
    if (typeof source[k] === "string") out[k] = source[k] as string;
  }
  return out;
}

export default function FlightItineraryBuilder({ storeReady }: { storeReady: boolean }) {
  const [state, act, busy] = useActionState(addFlightItineraryAction, null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [nextKey, setNextKey] = useState(1);
  // False until the mount effect has had its chance to restore a draft. It
  // stops the autosave effect from writing the empty first render over a draft
  // before that restore runs.
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);

  // Restore a saved draft once, after mount — deliberately not in the initial
  // state, which has to match the server's empty render to hydrate cleanly.
  // This is the sanctioned "read a client-only store after mount" use of an
  // effect (localStorage is not reactive, so useSyncExternalStore buys
  // nothing), hence the scoped disable of the no-setState-in-effect rule.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const draft = loadDraft();
    if (draft && !isEmptyForm(draft)) {
      setForm(draft);
      setRestored(true);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mirror the form to storage as it changes, and clear it once there is
  // nothing worth keeping (a fresh form, or a just-saved one).
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      if (isEmptyForm(form)) window.localStorage.removeItem(DRAFT_KEY);
      else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // A full or blocked store (private mode, quota) just means no draft —
      // never a broken form.
    }
  }, [form, hydrated]);

  // After a save the server sends back ok:true. Empty the form so the next
  // itinerary starts clean. Conditional setState during render, the pattern
  // React documents for reacting to a new value — no effect, no cascade.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setForm(emptyForm());
      setNextKey(1);
      setRestored(false);
    }
  }

  function setField(name: "title" | "passengers" | "reference" | "notes", value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function addLeg(listName: ListName) {
    setForm((current) => ({ ...current, [listName]: [...current[listName], blankLeg(`k-${nextKey}`)] }));
    setNextKey((value) => value + 1);
  }

  function removeLeg(listName: ListName, key: string) {
    setForm((current) => {
      const next = current[listName].filter((leg) => leg.key !== key);
      // The outbound journey always keeps at least one flight; the return one
      // may be emptied entirely for a one-way trip.
      if (listName === "outbound" && next.length === 0) return current;
      return { ...current, [listName]: next };
    });
  }

  function update(listName: ListName, key: string, part: Partial<LegDraft>) {
    setForm((current) => ({
      ...current,
      [listName]: current[listName].map((leg) => (leg.key === key ? { ...leg, ...part } : leg)),
    }));
  }

  const legsOutboundJson = JSON.stringify(form.outbound.map(legForSaving));
  const legsReturnJson = JSON.stringify(form.returnLegs.map(legForSaving));

  function legFieldset(listName: ListName, leg: LegDraft, index: number, count: number) {
    return (
      <fieldset key={leg.key} className="rounded-xl border border-[var(--gold-light)] bg-[#fffdf9] p-5">
        <div className="flex items-center justify-between">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
            Flight {index + 1}
          </legend>
          {(listName === "returnLegs" || count > 1) && (
            <button
              type="button"
              onClick={() => removeLeg(listName, leg.key)}
              disabled={busy}
              className="text-xs font-semibold text-stone-400 transition hover:text-red-700 disabled:opacity-50"
            >
              Remove flight
            </button>
          )}
        </div>

        {index > 0 && (
          <label className="mt-3 block rounded-md border border-[var(--gold-light)] bg-[#fcfaf6] p-3">
            <span className={label}>Connection from the flight above</span>
            <select
              value={leg.connectionType}
              onChange={(e) => update(listName, leg.key, { connectionType: e.target.value })}
              disabled={busy}
              className={field}
            >
              <option value="">Just show it as a connection</option>
              <option value="airline">One ticket — a stopover the airline protects</option>
              <option value="separate">Separate booking — a self-transfer</option>
            </select>
            <span className="mt-2 block text-xs leading-5 text-stone-500">
              {leg.connectionType === "airline"
                ? "One booking: the airline checks bags through and rebooks a missed connection."
                : leg.connectionType === "separate"
                  ? "Two bookings: the customer re-checks bags and carries the risk of a missed connection — the page warns them."
                  : "Pick one only if this flight changes from the one above."}
            </span>
          </label>
        )}

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Airline</span>
            <input value={leg.airline} onChange={(e) => update(listName, leg.key, { airline: e.target.value })} disabled={busy} className={field} placeholder="El Al" />
          </label>
          <label className="block">
            <span className={label}>Flight number</span>
            <input value={leg.flightNumber} onChange={(e) => update(listName, leg.key, { flightNumber: e.target.value })} disabled={busy} className={field} placeholder="LY 315" />
          </label>
          <label className="block">
            <span className={label}>From</span>
            <input value={leg.from} onChange={(e) => update(listName, leg.key, { from: e.target.value })} disabled={busy} className={field} placeholder="JFK — New York" />
          </label>
          <label className="block">
            <span className={label}>To</span>
            <input value={leg.to} onChange={(e) => update(listName, leg.key, { to: e.target.value })} disabled={busy} className={field} placeholder="TLV — Tel Aviv" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>Departs — date</span>
              <input type="date" value={leg.departDate} onChange={(e) => update(listName, leg.key, { departDate: e.target.value })} disabled={busy} className={field} />
            </label>
            <label className="block">
              <span className={label}>Time</span>
              <input value={leg.departTime} onChange={(e) => update(listName, leg.key, { departTime: e.target.value })} disabled={busy} className={field} placeholder="23:40" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>Arrives — date</span>
              <input type="date" value={leg.arriveDate} onChange={(e) => update(listName, leg.key, { arriveDate: e.target.value })} disabled={busy} className={field} />
            </label>
            <label className="block">
              <span className={label}>Time</span>
              <input value={leg.arriveTime} onChange={(e) => update(listName, leg.key, { arriveTime: e.target.value })} disabled={busy} className={field} placeholder="17:05" />
            </label>
          </div>
          <label className="block">
            <span className={label}>Cabin (optional)</span>
            <input value={leg.cabin} onChange={(e) => update(listName, leg.key, { cabin: e.target.value })} disabled={busy} className={field} placeholder="Economy" />
          </label>
          <label className="block">
            <span className={label}>Confirmation (optional)</span>
            <input value={leg.confirmation} onChange={(e) => update(listName, leg.key, { confirmation: e.target.value })} disabled={busy} className={field} placeholder="ABC123" />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Note for this flight (optional)</span>
            <input value={leg.notes} onChange={(e) => update(listName, leg.key, { notes: e.target.value })} disabled={busy} className={field} placeholder="Seats 14A–14C · Terminal 4" />
          </label>
        </div>
      </fieldset>
    );
  }

  return (
    <form action={act} className="mt-6 grid gap-6">
      {!storeReady && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The private store is not connected. An itinerary cannot be saved until it is.
        </p>
      )}

      <p className="text-xs leading-5 text-stone-500">
        This form saves as you type. Close the page and come back — what you entered will still be here, until you save
        it.
        {restored ? <span className="font-semibold text-[var(--gold-ink)]"> Draft restored.</span> : null}
      </p>

      <input type="hidden" name="legsOutbound" value={legsOutboundJson} />
      <input type="hidden" name="legsReturn" value={legsReturnJson} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Itinerary name</span>
          <input name="title" value={form.title} onChange={(e) => setField("title", e.target.value)} disabled={busy} className={field} placeholder="Cohen family — Sukkos flights" />
        </label>
        <label className="block">
          <span className={label}>Passenger(s)</span>
          <input name="passengers" value={form.passengers} onChange={(e) => setField("passengers", e.target.value)} disabled={busy} className={field} placeholder="Mr &amp; Mrs Cohen + 3" />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Booking reference (optional)</span>
          <input name="reference" value={form.reference} onChange={(e) => setField("reference", e.target.value)} disabled={busy} className={field} placeholder="A trip-wide reference, if there is one" />
        </label>
      </div>

      <section className="grid gap-5">
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Outbound flights</h3>
            <span className="text-xs text-stone-500">{form.outbound.length} {form.outbound.length === 1 ? "flight" : "flights"}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            One flight per leg, in order. For a connection, add the next flight — when it leaves from where the last one
            landed, the customer&rsquo;s page shows it as a connection with the layover.
          </p>
        </div>

        {form.outbound.map((leg, index) => legFieldset("outbound", leg, index, form.outbound.length))}

        <div>
          <button type="button" onClick={() => addLeg("outbound")} disabled={busy} className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--gold-light)] disabled:opacity-50">
            + Add another outbound flight
          </button>
        </div>
      </section>

      <section className="grid gap-5 border-t border-[var(--gold-light)] pt-6">
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Return flights</h3>
            <span className="text-xs text-stone-500">
              {form.returnLegs.length === 0 ? "none" : `${form.returnLegs.length} ${form.returnLegs.length === 1 ? "flight" : "flights"}`}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Leave this empty for a one-way trip. Add the flights home the same way — connections work here too.
          </p>
        </div>

        {form.returnLegs.map((leg, index) => legFieldset("returnLegs", leg, index, form.returnLegs.length))}

        <div>
          <button type="button" onClick={() => addLeg("returnLegs")} disabled={busy} className="inline-flex min-h-11 items-center rounded-md border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--gold-light)] disabled:opacity-50">
            {form.returnLegs.length === 0 ? "+ Add a return flight" : "+ Add another return flight"}
          </button>
        </div>
      </section>

      <label className="block">
        <span className={label}>Closing note for the customer (optional)</span>
        <textarea name="notes" value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3} disabled={busy} className={field} placeholder="Check in online 24 hours before each flight. Bags: one checked, one cabin." />
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy || !storeReady} className="inline-flex min-h-11 items-center rounded-md border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-50">
          {busy ? "Saving…" : "Save itinerary"}
        </button>
        {state && (
          <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
