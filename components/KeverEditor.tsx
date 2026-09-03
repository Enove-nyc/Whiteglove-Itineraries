"use client";

import AddressAndCoordinate from "@/components/AddressAndCoordinate";
import { useActionState, useState } from "react";
import type { Photo } from "@prisma/client";
import MixedText from "@/components/MixedText";
import PhotoManager from "@/components/PhotoManager";
import SearchableSelect from "@/components/SearchableSelect";
import {
  addCemeteryForPersonAction,
  addPersonToCemeteryAction,
  reattachBurialAction,
  removePersonAction,
  type ActionResult,
} from "@/app/admin/kevarim/actions";

export type EditorCemetery = {
  slug: string;
  city: string;
  country: string;
  name: string;
  /**
   * People in the built-in record. They live in code, but saving one by name
   * now stores an override that the public page layers on top — see
   * mergeBurials in lib/cemeteries-view.ts — so they ARE editable here.
   */
  builtIn: Array<{ name: string; yiddishName?: string; knownAs?: string; seforim?: string; yahrzeit?: string; note?: string }>;
  /** People added through this screen. */
  stored: Array<{
    id: string;
    name: string;
    yiddishName: string;
    knownAs: string | null;
    seforim: string | null;
    yahrzeit: string | null;
    note: string | null;
  }>;
  /** Pictures uploaded for this beis hachaim, published or still draft. */
  photos: Photo[];
};

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const cardClass = "border border-[var(--gold-light)] bg-[#FAF8F3] p-6";
const submitClass =
  "min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return <p className={`mt-3 text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>;
}

// useActionState with the tuple typed once rather than at each of the three calls.
function useFormAction(action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>) {
  return useActionState<ActionResult | null, FormData>(action, null);
}

/** What the form holds, whether it was typed or filled in from a record. */
export type PersonDraft = {
  name: string;
  yiddishName?: string;
  knownAs?: string | null;
  seforim?: string | null;
  yahrzeit?: string | null;
  note?: string | null;
};

/**
 * The six fields that describe a person, shared by both directions.
 *
 * `values` fills the boxes from an existing record. The form is remounted with
 * a fresh key when the record changes, because defaultValue is only read on
 * mount — without that, pressing Edit on a second person would leave the first
 * one's details on screen.
 */
function PersonFields({ idPrefix, values }: { idPrefix: string; values?: PersonDraft }) {
  return (
    <>
      <label className="block">
        <span className={captionClass}>Name *</span>
        <input name="name" defaultValue={values?.name ?? ""} className={inputClass} placeholder="Rabbi Elimelech Weisblum" required />
      </label>
      <label className="block">
        <span className={captionClass}>Name in Hebrew</span>
        <input name="yiddishName" defaultValue={values?.yiddishName ?? ""} dir="rtl" lang="yi" className={inputClass} placeholder="רבי אלימלך מליזענסק" />
      </label>
      <label className="block">
        <span className={captionClass}>Known as</span>
        <input name="knownAs" defaultValue={values?.knownAs ?? ""} className={inputClass} placeholder="The Noam Elimelech" />
      </label>
      <label className="block">
        <span className={captionClass}>Yahrzeit</span>
        <input name="yahrzeit" defaultValue={values?.yahrzeit ?? ""} className={inputClass} placeholder="כ״א אדר · 5547 / 1787" />
      </label>
      <label className="block sm:col-span-2">
        <span className={captionClass}>Seforim</span>
        <input name="seforim" defaultValue={values?.seforim ?? ""} dir="rtl" lang="yi" className={inputClass} placeholder="נועם אלימלך" />
      </label>
      <label className="block sm:col-span-2">
        <span className={captionClass}>A line about him</span>
        <textarea name="note" defaultValue={values?.note ?? ""} rows={2} className={inputClass} placeholder="Whose son, whose talmid, and anything that keeps him from being confused with someone of the same name." id={`${idPrefix}-note`} />
      </label>
    </>
  );
}

/** Somebody in the database, attached to no beis hachaim. */
export type OrphanedBurial = {
  id: string;
  name: string;
  yiddishName: string;
  knownAs: string | null;
  yahrzeit: string | null;
};

/**
 * The people a re-import detached, and the box to put them back.
 *
 * Not a normal part of this screen — it appears only when there is something
 * in it, and for most databases there never will be. But somebody whose
 * re-import already orphaned a kever has the row sitting there with nothing
 * pointing at it, and no other screen on the site would ever show it to him.
 */
function Orphans({ orphans, cemeteries }: { orphans: OrphanedBurial[]; cemeteries: EditorCemetery[] }) {
  const [target, setTarget] = useState<Record<string, string>>({});
  const [state, action] = useFormAction(reattachBurialAction);
  if (!orphans.length) return null;

  return (
    <section className="border-2 border-amber-400 bg-amber-50 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Found in the database</p>
      <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
        {orphans.length === 1 ? "Somebody is" : `${orphans.length} people are`} not on any beis hachaim
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
        A re-import used to delete a beis hachaim before writing it back, which left anyone you had added to it
        attached to nothing — still saved, on no page. That has been fixed, but {orphans.length === 1 ? "this one was" : "these were"} caught
        by it. Say where {orphans.length === 1 ? "he belongs" : "they belong"} and {orphans.length === 1 ? "he is" : "they are"} back.
      </p>

      <ul className="mt-5 space-y-4">
        {orphans.map((person) => (
          <li key={person.id} className="border border-amber-300 bg-white p-4">
            <p className="font-semibold text-[var(--navy)]">
              {person.name}
              {person.knownAs && <span className="font-normal text-stone-500"> · {person.knownAs}</span>}
            </p>
            {person.yahrzeit && <p className="mt-1 text-sm text-stone-500"><MixedText text={person.yahrzeit} /></p>}
            <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={person.id} />
              <input type="hidden" name="slug" value={target[person.id] ?? ""} />
              <div className="min-w-[16rem] flex-1">
                <SearchableSelect
                  id={`orphan-${person.id}`}
                  label="Which beis hachaim?"
                  value={target[person.id] ?? ""}
                  onChange={(value) => setTarget((current) => ({ ...current, [person.id]: value }))}
                  placeholder="Type a town…"
                  options={cemeteries.map((c) => ({ value: c.slug, label: `${c.city} · ${c.country}`, hint: c.name, keywords: c.slug }))}
                />
              </div>
              <button type="submit" disabled={!target[person.id]} className={submitClass}>
                Put him back
              </button>
            </form>
          </li>
        ))}
      </ul>
      <Status state={state} />
    </section>
  );
}

export default function KeverEditor({ cemeteries, orphans = [] }: { cemeteries: EditorCemetery[]; orphans?: OrphanedBurial[] }) {
  const [slug, setSlug] = useState(cemeteries[0]?.slug ?? "");

  const [addState, addAction, addPending] = useFormAction(addPersonToCemeteryAction);
  // Who the form is filled in for, if anybody. Correcting somebody IS adding
  // him — saveCemeteryBurial upserts by name — so Edit fills this one form
  // rather than opening a second one that could drift away from it.
  const [draft, setDraft] = useState<PersonDraft | null>(null);
  const [newState, newAction, newPending] = useFormAction(addCemeteryForPersonAction);
  const [removeState, removeAction] = useFormAction(removePersonAction);

  const selected = cemeteries.find((c) => c.slug === slug) ?? cemeteries[0];
  const activeSlug = selected?.slug ?? "";

  return (
    <div className="space-y-8">
      {/* Anything a re-import detached, before anything else — it is the only
          screen that can show it. */}
      <Orphans orphans={orphans} cemeteries={cemeteries} />

      {/* ---- Direction 1: a person into a beis hachaim we already have ---- */}
      <section className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Add a person to a beis hachaim</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Someone buried in a place we already have</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Find the beis hachaim, see who is listed there now, and add whoever is missing. He appears on that
          cemetery&apos;s page straight away.
        </p>

        {/* One control instead of a search box beside a dropdown: type the
            town and pick it. */}
        <div className="mt-5 max-w-xl">
          <SearchableSelect
            id="kever-cemetery"
            label="Beis hachaim"
            value={activeSlug}
            onChange={setSlug}
            placeholder="Type a town — Lizhensk, Kraków, Uman…"
            options={cemeteries.map((c) => ({
              value: c.slug,
              label: `${c.city} · ${c.country}`,
              hint: c.name,
              keywords: c.slug,
            }))}
          />
        </div>

        {selected && (
          <>
            <div className="mt-6 border border-[var(--gold-light)] bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Buried here now</h3>
                <a
                  href={`/cemeteries/${selected.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2"
                >
                  Open the public page →
                </a>
              </div>
              {selected.builtIn.length === 0 && selected.stored.length === 0 ? (
                <p className="mt-3 text-sm text-stone-600">Nobody is listed yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-[var(--gold-light)]">
                  {selected.builtIn.map((b) => (
                    <li key={`builtin-${b.name}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <span className="text-sm text-stone-700">
                        <span className="font-semibold text-[var(--navy)]">{b.name}</span>
                        {b.knownAs && <span className="text-stone-500"> · {b.knownAs}</span>}
                        {b.yahrzeit && <span className="text-stone-400"> · <MixedText text={b.yahrzeit} /></span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                        type="button"
                        onClick={() => {
                          setDraft(b);
                          document.getElementById("kever-person-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-[var(--navy)] hover:text-[var(--navy)]"
                      >
                        Edit
                      </button>
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">built in</span>
                      </span>
                    </li>
                  ))}
                  {selected.stored.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <span className="text-sm text-stone-700">
                        <span className="font-semibold text-[var(--navy)]">{b.name}</span>
                        {b.knownAs && <span className="text-stone-500"> · {b.knownAs}</span>}
                        {b.yahrzeit && <span className="text-stone-400"> · <MixedText text={b.yahrzeit} /></span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                        type="button"
                        onClick={() => {
                          setDraft(b);
                          document.getElementById("kever-person-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-[var(--navy)] hover:text-[var(--navy)]"
                      >
                        Edit
                      </button>
                      <form action={removeAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="slug" value={selected.slug} />
                        <button
                          type="submit"
                          className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Status state={removeState} />
            </div>

            <form action={addAction} className="mt-6" id="kever-person-form" key={draft?.name ?? "new"}>
              <input type="hidden" name="slug" value={selected.slug} />
              <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">
                {draft ? `Correcting ${draft.name}` : `Add someone to ${selected.city}`}
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                {draft
                  ? "Change what needs changing and save. A box left blank keeps whatever the record already has rather than clearing it."
                  : "Typing a name that is already here corrects that entry instead of listing him twice."}
                {draft ? (
                  <button type="button" onClick={() => setDraft(null)} className="ml-2 underline decoration-[var(--gold)] underline-offset-2">
                    start a new one instead
                  </button>
                ) : null}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <PersonFields idPrefix="add" values={draft ?? undefined} />
              </div>
              <div className="mt-5">
                <button type="submit" disabled={addPending} className={submitClass}>
                  {addPending ? "Saving…" : draft ? "Save the correction" : "Add to this beis hachaim"}
                </button>
              </div>
              <Status state={addState} />
            </form>

            {/* Pictures of the beis hachaim. What somebody wants before they
                travel is the gate, the path, the ohel — so they know they are
                in the right place when they arrive at night. */}
            <div className="mt-8 border-t border-[var(--gold-light)] pt-6">
              <PhotoManager
                key={selected.slug}
                target={{ kind: "cemetery", ref: selected.slug }}
                slug={selected.slug}
                photos={selected.photos}
                heading={`Pictures of ${selected.city}`}
                intro="The gate, the path, the ohel — what a traveler needs to recognise the place when they arrive. A picture goes on the page only once it has a credit; whoever took it owns it."
              />
            </div>
          </>
        )}
      </section>

      {/* ---- Direction 2: a beis hachaim for a person we don't have yet ---- */}
      <section className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Add a beis hachaim to a person</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Someone whose town isn&apos;t on the site yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Start from the person. Give the town he is buried in and both are created together — the beis hachaim
          appears in the directory with him in it.
        </p>

        <form action={newAction} className="mt-5">
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">The person</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PersonFields idPrefix="new" />
          </div>

          <h3 className="mt-8 font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Where he is buried</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={captionClass}>Town *</span>
              <input name="city" className={inputClass} placeholder="Leżajsk" required />
            </label>
            <label className="block">
              <span className={captionClass}>Town in Hebrew</span>
              <input name="yiddishCity" dir="rtl" lang="yi" className={inputClass} placeholder="ליזענסק" />
            </label>
            <label className="block">
              <span className={captionClass}>Country</span>
              <input name="country" className={inputClass} placeholder="Poland" />
            </label>
            <label className="block sm:col-span-2">
              <span className={captionClass}>Name of the beis hachaim</span>
              <input name="cemeteryName" className={inputClass} placeholder="Leave blank and we call it “Leżajsk — Jewish cemetery”" />
            </label>
            <label className="block sm:col-span-2">
              <span className={captionClass}>Name in Hebrew</span>
              <input name="cemeteryYiddishName" dir="rtl" lang="yi" className={inputClass} />
            </label>
            {/* The address and the coordinate together, so the second can be
                checked against the first. They used to sit in different halves
                of the form with nothing comparing them. */}
            <AddressAndCoordinate
              addressPlaceholder="Górna 16, 37-300 Leżajsk, Poland"
              captionClass={captionClass}
              inputClass={inputClass}
            />
            <label className="block sm:col-span-2">
              <span className={captionClass}>Getting in</span>
              <textarea name="accessNote" rows={2} className={inputClass} placeholder="Who holds the key, when the gate is open." />
            </label>
            <label className="block sm:col-span-2">
              <span className={captionClass}>Source</span>
              <input name="sourceUrl" className={inputClass} placeholder="Where this came from" />
            </label>
          </div>

          <div className="mt-5">
            <button type="submit" disabled={newPending} className={submitClass}>
              {newPending ? "Saving…" : "Create the beis hachaim with him in it"}
            </button>
          </div>
          <Status state={newState} />
        </form>
      </section>

      <p className="border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        Leave a coordinate blank unless you know the actual grave. Travelers drive to whatever this page gives
        them, and an approximate pin at the wrong end of a town is worse than an address and a phone call.
      </p>
    </div>
  );
}
