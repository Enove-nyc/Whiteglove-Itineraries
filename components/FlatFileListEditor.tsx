"use client";

import { useActionState, useEffect, useState } from "react";
import { useOnActionSuccess } from "@/components/useOnActionSuccess";
import { useFocusTrap } from "@/components/useFocusTrap";

/**
 * One list-and-pop-up editor for the flat-file admin sets — eruvin, shuls,
 * kosher apartments.
 *
 * They all worked the same way: an add form, and a list underneath where the
 * only thing you could do to an entry you had added was remove it. There was no
 * way to fix a typo in one. This is the shared shape now: the list of what you
 * added, "Add" and pressing an entry both open the same pop-up, and it saves or
 * removes through that set's own server actions. Editing keeps the entry's id
 * (a hidden field), so a change is an update in place rather than a second copy.
 *
 * The built-in entries are curated in code and are not listed here — only the
 * count of them is — so this screen is the owner's own additions, as it was.
 */

type ActionResult = { ok: boolean; message: string } | null;
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult> | ActionResult;

export type FlatFileField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "url";
  required?: boolean;
  /** Span the whole row rather than share it. */
  full?: boolean;
};

export type FlatFileItem = {
  id: string;
  added: boolean;
  title: string;
  subtitle?: string;
  /** The current value of every field, for pre-filling the pop-up. */
  values: Record<string, string>;
};

const inputClass =
  "mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]";
const labelClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function FlatFileListEditor({
  items,
  fields,
  addLabel,
  emptyLabel,
  storeReady,
  saveAction,
  removeAction,
}: {
  items: FlatFileItem[];
  fields: FlatFileField[];
  addLabel: string;
  emptyLabel: string;
  storeReady: boolean;
  saveAction: Action;
  removeAction: Action;
}) {
  const [saveState, save, saving] = useActionState(saveAction, null);
  const [removeState, remove, removing] = useActionState(removeAction, null);
  // null = closed; { item: null } = adding; { item } = editing that entry.
  const [editing, setEditing] = useState<{ item: FlatFileItem | null } | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(editing), () => setEditing(null));

  // A save or a remove that went through closes the pop-up; the list refreshes
  // on its own from the action's revalidate.
  // During render, not after the commit: as an effect React paints once with
  // the pop-up still open over a save that had already gone through.
  useOnActionSuccess([saveState, removeState], () => setEditing(null));

  const added = items.filter((i) => i.added);
  const builtIn = items.length - added.length;
  const item = editing?.item ?? null;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing({ item: null })}
          disabled={!storeReady}
          className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-50"
        >
          {addLabel}
        </button>
        <span className="text-sm text-stone-500">
          {items.length} listed · {added.length} added here · {builtIn} built in
        </span>
        {(saveState || removeState) && (
          <span
            className={`text-xs font-semibold ${(removeState ?? saveState)?.ok ? "text-emerald-700" : "text-red-700"}`}
            role="status"
          >
            {(removeState ?? saveState)?.message}
          </span>
        )}
      </div>

      {!storeReady && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The private store is not connected, so nothing here can be saved yet.
        </p>
      )}

      {added.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-[var(--gold-light)] bg-[#FAF8F3] p-5 text-sm leading-6 text-stone-600">
          {emptyLabel}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)]">
          {added.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setEditing({ item: entry })}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#FAF8F3]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--navy)] underline decoration-[var(--gold-light)] decoration-2 underline-offset-4">
                    {entry.title || "Untitled"}
                  </span>
                  {entry.subtitle && <span className="mt-0.5 block truncate text-xs text-stone-500">{entry.subtitle}</span>}
                </span>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">Edit</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
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
            aria-labelledby="flatfile-modal-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16, 47, 53,.20)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 id="flatfile-modal-title" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                {item ? "Edit" : addLabel}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Close
              </button>
            </div>

            {/* key on the form so the uncontrolled fields reset to this entry's
                values when the pop-up switches from one to another. */}
            <form action={save} key={item?.id ?? "new"} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={item?.id ?? ""} />
              {fields.map((f) => (
                <label key={f.name} className={f.full ? "block sm:col-span-2" : "block"}>
                  <span className={labelClass}>{f.label}</span>
                  <input
                    name={f.name}
                    type={f.type === "url" ? "url" : "text"}
                    required={f.required}
                    disabled={saving}
                    defaultValue={item?.values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    className={f.type === "url" ? `${inputClass} font-mono text-xs` : inputClass}
                  />
                </label>
              ))}

              <div className="mt-2 flex flex-wrap items-center gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving || !storeReady}
                  className="border border-[var(--navy)] bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
                >
                  Cancel
                </button>
                {saveState && !saveState.ok && <span className="text-sm font-semibold text-red-700">{saveState.message}</span>}
              </div>
            </form>

            {item && (
              <form action={remove} className="mt-4 border-t border-[var(--gold-light)] pt-4">
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  disabled={removing}
                  className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove from the list"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
