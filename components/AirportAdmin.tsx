"use client";

import { type ReactNode, useActionState, useState } from "react";
import { useOnActionSuccess } from "@/components/useOnActionSuccess";
import { useFocusTrap } from "@/components/useFocusTrap";
import type { AddedAirport, AddedMetro } from "@/lib/airport-admin";
import { describeMetro, isBuiltInMetro } from "@/lib/airport-admin";
import type { Airport } from "@/data/airports";
import { removeAirportAction, saveAirportAction, saveMetroAction } from "@/app/admin/airports/actions";

/**
 * Adding, correcting and grouping airports — as a list you press into.
 *
 * The old screen kept both add forms open all the time and let you only
 * *remove* an airport you had added; a wrong coordinate could not be fixed
 * except by retyping the whole entry from memory. Now the airports and the
 * city groups are each a list: "Add" and pressing a row both open the same
 * pop-up, pre-filled when you are editing, and the same form saves or removes.
 *
 * The built-in list is curated in a file and is not editable here — a form
 * that appeared to delete JFK would be lying about what it does — so this
 * screen lists what the owner has added, with the built-in ones counted.
 * Saving an entry whose code already exists corrects it rather than making a
 * second one, so a regional field near a kever town and a fix to a shipped
 * airport are the same gesture.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const caption = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const addButtonClass =
  "min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-50";
const rowClass =
  "flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#fcfaf6]";

function Modal({
  title,
  onClose,
  labelledBy,
  children,
}: {
  title: string;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div
      className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(23,45,82,.20)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id={labelledBy} className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AirportAdmin({
  merged,
  added,
  metros,
  addedMetros,
  storeReady,
}: {
  merged: Airport[];
  added: AddedAirport[];
  metros: Record<string, { label: string; country: string }>;
  addedMetros: AddedMetro[];
  storeReady: boolean;
}) {
  const [airportState, saveAirport, savingAirport] = useActionState(saveAirportAction, null);
  const [metroState, saveMetro, savingMetro] = useActionState(saveMetroAction, null);
  const [removeState, removeItem, removing] = useActionState(removeAirportAction, null);

  // null = closed; "new" = adding; an entry = editing it.
  const [airportModal, setAirportModal] = useState<AddedAirport | "new" | null>(null);
  const [metroModal, setMetroModal] = useState<AddedMetro | "new" | null>(null);

  // During render, not after the commit: as an effect React paints once with
  // the pop-up still open over a save that had already gone through.
  useOnActionSuccess([airportState, removeState], () => setAirportModal(null));
  useOnActionSuccess([metroState, removeState], () => setMetroModal(null));

  if (!storeReady) {
    return (
      <p className="mt-8 border border-[var(--gold-light)] bg-[#fcfaf6] px-4 py-3 text-sm leading-6 text-stone-600">
        The private store is not connected, so nothing can be added yet. The {merged.length} built-in airports and{" "}
        {Object.keys(metros).length} city groups are working as they always have.
      </p>
    );
  }

  const builtInAirports = merged.length - added.length;
  const editingAirport = airportModal === "new" ? null : airportModal;
  const editingMetro = metroModal === "new" ? null : metroModal;

  return (
    <div className="mt-8 space-y-8">
      {/* Airports */}
      <section className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Add or correct</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Airports</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          A regional field near a kever town, or a correction to one of the {merged.length} already here. Saving a code
          that already exists replaces it — that is how a wrong coordinate or a missing spelling gets fixed.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setAirportModal("new")} className={addButtonClass}>
            Add an airport
          </button>
          <span className="text-sm text-stone-500">
            {added.length} added here · {builtInAirports} built in
          </span>
          {(airportState || removeState) && (
            <span
              className={`text-xs font-semibold ${(removeState ?? airportState)?.ok ? "text-emerald-700" : "text-red-700"}`}
              role="status"
            >
              {(removeState ?? airportState)?.message}
            </span>
          )}
        </div>

        {added.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-[var(--gold-light)] bg-white p-5 text-sm leading-6 text-stone-600">
            Nothing added yet. Airports you add or correct appear here, alongside the built-in list the flight search
            already uses.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)] bg-white">
            {added.map((a) => (
              <li key={a.code}>
                <button type="button" onClick={() => setAirportModal(a)} className={rowClass}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--navy)]">
                      {a.code} — {a.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-stone-500">
                      {a.city}
                      {a.cityCode ? ` · in ${a.cityCode}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">Edit</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* City groups */}
      <section className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Searched together</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">City groups</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Somebody flying to a city with two airports usually does not mind which. A group is offered above the
          individual airports, and searches them together. <strong className="text-[var(--navy)]">Put the airports in
          the group first</strong> — set each one&apos;s city group on the airport — then name it here.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setMetroModal("new")} className={addButtonClass}>
            Add a city group
          </button>
          {metroState && (
            <span className={`text-xs font-semibold ${metroState.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
              {metroState.message}
            </span>
          )}
        </div>

        <ul className="mt-5 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)] bg-white">
          {Object.entries(metros).map(([code, area]) => {
            const builtIn = isBuiltInMetro(code);
            const own = addedMetros.find((m) => m.code.toUpperCase() === code);
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--navy)]">
                    {code} — {area.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">{describeMetro(code, merged)}</span>
                </span>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
                  {builtIn && !own ? "Built in" : "Edit"}
                </span>
              </>
            );
            return (
              <li key={code}>
                {own ? (
                  <button type="button" onClick={() => setMetroModal(own)} className={rowClass}>
                    {body}
                  </button>
                ) : (
                  <div className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {addedMetros.length === 0 && (
          <p className="mt-3 text-xs leading-5 text-stone-500">The groups above came with the site. Anything you add appears here too.</p>
        )}
      </section>

      {/* Airport add / edit */}
      {airportModal && (
        <Modal
          title={editingAirport ? `Edit ${editingAirport.code}` : "Add an airport"}
          labelledBy="airport-modal-title"
          onClose={() => setAirportModal(null)}
        >
          <form action={saveAirport} key={editingAirport?.code ?? "new"} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className={caption}>Code</span>
              <input name="code" required maxLength={3} defaultValue={editingAirport?.code ?? ""} placeholder="RZE" className={`${inputClass} uppercase`} />
            </label>
            <label className="block sm:col-span-2">
              <span className={caption}>Name</span>
              <input name="name" required defaultValue={editingAirport?.name ?? ""} placeholder="Rzeszów — Jasionka" className={inputClass} />
            </label>
            <label className="block">
              <span className={caption}>City or town it serves</span>
              <input name="city" required defaultValue={editingAirport?.city ?? ""} placeholder="Rzeszów" className={inputClass} />
            </label>
            <label className="block">
              <span className={caption}>Country</span>
              <input name="country" required defaultValue={editingAirport?.country ?? ""} placeholder="Poland" className={inputClass} />
            </label>
            <label className="block">
              <span className={caption}>City group (optional)</span>
              <input name="cityCode" maxLength={3} defaultValue={editingAirport?.cityCode ?? ""} placeholder="NYC" className={`${inputClass} uppercase`} />
            </label>
            <label className="block">
              <span className={caption}>Latitude</span>
              <input name="lat" required inputMode="decimal" defaultValue={editingAirport ? String(editingAirport.lat) : ""} placeholder="50.11" className={inputClass} />
            </label>
            <label className="block">
              <span className={caption}>Longitude</span>
              <input name="lng" required inputMode="decimal" defaultValue={editingAirport ? String(editingAirport.lng) : ""} placeholder="22.02" className={inputClass} />
            </label>
            <label className="block lg:col-span-3">
              <span className={caption}>Also searched by</span>
              <input name="aliases" defaultValue={editingAirport?.aliases?.join(", ") ?? ""} placeholder="lizhensk, lezajsk, lancut" className={inputClass} />
              <span className="mt-1 block text-xs leading-5 text-stone-500">
                Commas between them. The towns and spellings people actually type — this is what makes somebody
                searching &ldquo;lizhensk&rdquo; find the airport an hour away.
              </span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3 lg:col-span-3">
              <button type="submit" disabled={savingAirport} className={addButtonClass}>
                {savingAirport ? "Saving…" : "Save the airport"}
              </button>
              <button
                type="button"
                onClick={() => setAirportModal(null)}
                className="min-h-11 px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Cancel
              </button>
              {airportState && !airportState.ok && <span className="text-sm font-semibold text-red-700">{airportState.message}</span>}
            </div>
          </form>

          {editingAirport && (
            <form action={removeItem} className="mt-4 border-t border-[var(--gold-light)] pt-4">
              <input type="hidden" name="code" value={editingAirport.code} />
              <input type="hidden" name="kind" value="airport" />
              <button type="submit" disabled={removing} className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline disabled:opacity-50">
                {removing ? "Removing…" : "Remove — any built-in entry for it comes back"}
              </button>
            </form>
          )}
        </Modal>
      )}

      {/* City group add / edit */}
      {metroModal && (
        <Modal
          title={editingMetro ? `Edit ${editingMetro.code}` : "Add a city group"}
          labelledBy="metro-modal-title"
          onClose={() => setMetroModal(null)}
        >
          <form action={saveMetro} key={editingMetro?.code ?? "new"} className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={caption}>Group code</span>
              <input name="code" required maxLength={3} defaultValue={editingMetro?.code ?? ""} placeholder="KRW" className={`${inputClass} uppercase`} />
            </label>
            <label className="block sm:col-span-2">
              <span className={caption}>What a traveller sees</span>
              <input name="label" required defaultValue={editingMetro?.label ?? ""} placeholder="Kraków — all airports" className={inputClass} />
            </label>
            <label className="block sm:col-span-3">
              <span className={caption}>Country</span>
              <input name="country" required defaultValue={editingMetro?.country ?? ""} placeholder="Poland" className={inputClass} />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3 sm:col-span-3">
              <button type="submit" disabled={savingMetro} className={addButtonClass}>
                {savingMetro ? "Saving…" : "Save the group"}
              </button>
              <button
                type="button"
                onClick={() => setMetroModal(null)}
                className="min-h-11 px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Cancel
              </button>
              {metroState && !metroState.ok && <span className="text-sm font-semibold text-red-700">{metroState.message}</span>}
            </div>
          </form>

          {editingMetro && (
            <form action={removeItem} className="mt-4 border-t border-[var(--gold-light)] pt-4">
              <input type="hidden" name="code" value={editingMetro.code} />
              <input type="hidden" name="kind" value="metro" />
              <button type="submit" disabled={removing} className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline disabled:opacity-50">
                {removing ? "Removing…" : "Remove this group"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
