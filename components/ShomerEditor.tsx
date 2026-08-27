"use client";

import { useActionState, useMemo, useState } from "react";
import { useOnValueChange } from "@/components/useOnValueChange";
import { useOnActionSuccess } from "@/components/useOnActionSuccess";
import SearchableSelect from "@/components/SearchableSelect";
import { useFocusTrap } from "@/components/useFocusTrap";
import { removeShomerAction, retireShomerAction, saveShomerAction, type ActionResult } from "@/app/admin/shomrim/actions";

export type ShomerCemetery = {
  slug: string;
  city: string;
  country: string;
  name: string;
  builtIn: Array<{ label: string; name?: string; phone?: string; email?: string; note: string }>;
  stored: Array<{ id: string; label: string; name: string | null; phone: string | null; email: string | null; note: string | null }>;
};

/**
 * The shomer numbers on a beis hachaim — as a list you press into.
 *
 * Correcting a number used to mean scrolling to a form at the bottom and
 * retyping the contact's label exactly, so a save would match and replace it.
 * Now each number on the page is pressable: it opens a pop-up already filled
 * with what is there, where the same form corrects it, hides a built-in one
 * that no longer answers, or removes a change. "Add a number" opens the same
 * pop-up empty.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const submitClass =
  "min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60";
const addButtonClass =
  "min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]";

type Row = {
  label: string;
  builtIn?: { label: string; name?: string; phone?: string; email?: string; note: string };
  override?: { id: string; label: string; name: string | null; phone: string | null; email: string | null; note: string | null };
  isNew: boolean;
};

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return <p className={`mt-3 text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>;
}

export default function ShomerEditor({ cemeteries }: { cemeteries: ShomerCemetery[] }) {
  const [slug, setSlug] = useState(cemeteries[0]?.slug ?? "");
  const [saveState, saveAction, savePending] = useActionState<ActionResult | null, FormData>(saveShomerAction, null);
  const [removeState, removeAction] = useActionState<ActionResult | null, FormData>(removeShomerAction, null);
  const [retireState, retireAction] = useActionState<ActionResult | null, FormData>(retireShomerAction, null);
  // null = closed; "new" = adding; a row = editing that contact.
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(editing), () => setEditing(null));

  const selected = cemeteries.find((c) => c.slug === slug);

  // What the page actually shows: a stored contact wins over the built-in one
  // with the same label, and one with no phone and no email is retired.
  const rows: Row[] = useMemo(() => {
    const storedByLabel = new Map((selected?.stored ?? []).map((c) => [c.label.trim().toLowerCase(), c]));
    return [
      ...(selected?.builtIn ?? []).map((c) => {
        const override = storedByLabel.get(c.label.trim().toLowerCase());
        return { label: c.label, builtIn: c, override, isNew: false };
      }),
      ...(selected?.stored ?? [])
        .filter((c) => !(selected?.builtIn ?? []).some((b) => b.label.trim().toLowerCase() === c.label.trim().toLowerCase()))
        .map((c) => ({ label: c.label, builtIn: undefined, override: c, isNew: true })),
    ];
  }, [selected]);

  // A save, remove or retire that went through closes the pop-up. During
  // render, not after the commit: as an effect React paints once with the
  // pop-up still open over a save that had already gone through.
  useOnActionSuccess([saveState, removeState, retireState], () => setEditing(null));
  // Switching beis hachaim closes a pop-up that belonged to the old one — and
  // as an effect that painted one frame of the previous beis hachaim's dialog
  // under the new one's heading.
  useOnValueChange(slug, () => setEditing(null));

  const row = editing === "new" ? null : editing;
  const initial = row
    ? {
        label: row.label,
        name: (row.override?.name ?? row.builtIn?.name) ?? "",
        phone: (row.override?.phone ?? row.builtIn?.phone) ?? "",
        email: (row.override?.email ?? row.builtIn?.email) ?? "",
        note: (row.override?.note ?? row.builtIn?.note) ?? "",
      }
    : { label: "", name: "", phone: "", email: "", note: "" };
  const rowRetired = Boolean(row?.override && !row.override.phone?.trim() && !row.override.email?.trim());

  return (
    <div className="space-y-8">
      <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
        {/* 146 batei hachaim: type the town rather than scrolling for it. */}
        <SearchableSelect
          id="shomer-cemetery"
          label="Beis hachaim"
          value={slug}
          onChange={setSlug}
          placeholder="Type a town — Lizhensk, Kraków, Uman…"
          options={cemeteries.map((c) => ({
            value: c.slug,
            label: `${c.city} · ${c.country}`,
            hint: c.name,
            keywords: c.slug,
          }))}
        />
        {selected && (
          <p className="mt-3 text-sm text-stone-600">
            <a href={`/cemeteries/${selected.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
              Open the public page →
            </a>
          </p>
        )}
      </div>

      {selected && (
        <div className="border border-[var(--gold-light)] bg-[#fcfaf6] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Numbers on this page now</h2>
            <button type="button" onClick={() => setEditing("new")} className={addButtonClass}>
              Add a number
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-[var(--gold-light)] bg-white p-5 text-sm leading-6 text-stone-600">
              No contacts yet. Press &ldquo;Add a number&rdquo; to put one on this page.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)] bg-white">
              {rows.map((r) => {
                const live = r.override ?? r.builtIn;
                const retired = Boolean(r.override && !r.override.phone?.trim() && !r.override.email?.trim());
                return (
                  <li key={r.label}>
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#fcfaf6]"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="font-semibold text-[var(--navy)]">{r.label}</span>
                          {live?.name && <span className="text-xs text-stone-500">Ask for {live.name}</span>}
                        </span>
                        <span className={`mt-0.5 block truncate text-sm ${retired ? "text-stone-400 line-through" : "text-stone-700"}`}>
                          {live?.phone || live?.email || "—"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">
                          {retired ? "hidden" : r.override ? (r.isNew ? "added by you" : "edited by you") : "built in"}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">Edit</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Status state={removeState} />
          <Status state={retireState} />
        </div>
      )}

      {editing && selected && (
        <div
          className="fixed inset-0 z-[var(--wg-z-modal,200)] flex items-end justify-center bg-[var(--navy)]/50 p-4 backdrop-blur-[2px] sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shomer-modal-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(23,45,82,.20)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="shomer-modal-title" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                  {row ? row.label : "Add a number"}
                </h3>
                <p className="mt-1 text-xs text-stone-500">{selected.city}, {selected.country}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Close
              </button>
            </div>

            <form action={saveAction} key={row?.label ?? "new"} className="mt-5">
              <input type="hidden" name="slug" value={selected.slug} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={captionClass}>Label</span>
                  <input name="label" list="shomer-labels" defaultValue={initial.label} className={inputClass} placeholder="Shomer" required />
                  <datalist id="shomer-labels">
                    {(selected.builtIn ?? []).map((c) => <option key={c.label} value={c.label} />)}
                    <option value="Shomer" />
                    <option value="Local guide" />
                    <option value="Caretaker" />
                  </datalist>
                </label>
                <label className="block">
                  {/* Kept apart from the label on purpose: the label is what a save
                      matches on to correct an existing number, so a person's name in
                      it means one man spelled two ways becomes two contacts. */}
                  <span className={captionClass}>Who to ask for</span>
                  <input name="name" defaultValue={initial.name} className={inputClass} placeholder="Reb Berel — the name, not the role" />
                </label>
                <label className="block">
                  <span className={captionClass}>Phone</span>
                  <input name="phone" type="tel" defaultValue={initial.phone} className={inputClass} placeholder="+48 …" />
                </label>
                <label className="block">
                  <span className={captionClass}>Email</span>
                  <input name="email" type="email" defaultValue={initial.email} className={inputClass} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={captionClass}>Note</span>
                  <input name="note" defaultValue={initial.note} className={inputClass} placeholder="When to call, what to ask for" />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={savePending} className={submitClass}>{savePending ? "Saving…" : "Save number"}</button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="min-h-[44px] px-4 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
                >
                  Cancel
                </button>
                {saveState && !saveState.ok && <span className="text-sm font-semibold text-red-700">{saveState.message}</span>}
              </div>
              <p className="mt-4 border-l-4 border-[var(--gold)] bg-[#fcfaf6] px-3 py-2 text-xs leading-5 text-stone-600">
                Only enter a number you have confirmed. Travelers ring these from the roadside, and a wrong number is
                worse than none.
              </p>
            </form>

            {/* Hide a built-in number that no longer answers, or undo a change. */}
            {row && !rowRetired && row.builtIn && !row.override && (
              <form
                action={retireAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Hide the ${row.label} number on ${selected.city}? Travelers will not see it.`)) {
                    event.preventDefault();
                  }
                }}
                className="mt-4 border-t border-[var(--gold-light)] pt-4"
              >
                <input type="hidden" name="slug" value={selected.slug} />
                <input type="hidden" name="label" value={row.label} />
                <button type="submit" className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline">
                  Number no longer works — hide it
                </button>
              </form>
            )}
            {row?.override && (
              <form
                action={removeAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Remove “${row.label}” from ${selected.city}?`)) event.preventDefault();
                }}
                className="mt-4 border-t border-[var(--gold-light)] pt-4"
              >
                <input type="hidden" name="id" value={row.override.id} />
                <input type="hidden" name="slug" value={selected.slug} />
                <button type="submit" className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline">
                  {row.isNew ? "Remove this contact" : "Undo my change — the built-in number returns"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
