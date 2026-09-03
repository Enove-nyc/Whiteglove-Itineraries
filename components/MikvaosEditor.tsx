"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useOnActionSuccess } from "@/components/useOnActionSuccess";
import Link from "next/link";
import { useFocusTrap } from "@/components/useFocusTrap";

/**
 * A list-and-pop-up editor for the mikvah listings.
 *
 * Mikvaos are PracticalPlace rows that belong to a town, so this screen does
 * not add one — it lists every mikvah on the site and lets the owner fix the
 * ones held in the database in place, without hunting through the town editor.
 * The seed-catalog rows live in code; those still open in their own town.
 */

type ActionResult = { ok: boolean; message: string } | null;
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult> | ActionResult;
type Status = "PUBLISHED" | "DRAFT" | "NEEDS_REVIEW";

export type MikvahRow = {
  id: string;
  name: string;
  city: string;
  country: string;
  status: Status;
  sourceUrl: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  website: string | null;
  notes: string | null;
  fromDatabase: boolean;
  /** Where a seed row is edited — its town in the destination editor. */
  townHref: string;
};

const inputClass =
  "mt-1 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]";
const labelClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

function statusLabel(row: MikvahRow): { text: string; tone: string } {
  if (row.status === "PUBLISHED" && !row.sourceUrl) return { text: "Needs source", tone: "text-amber-800" };
  if (row.status === "PUBLISHED") return { text: "Published", tone: "text-emerald-800" };
  if (row.status === "NEEDS_REVIEW") return { text: "Needs review", tone: "text-amber-800" };
  return { text: "Draft", tone: "text-stone-500" };
}

export default function MikvaosEditor({
  rows,
  dbConnected,
  saveAction,
  deleteAction,
}: {
  rows: MikvahRow[];
  dbConnected: boolean;
  saveAction: Action;
  deleteAction: Action;
}) {
  const [saveState, save, saving] = useActionState(saveAction, null);
  const [removeState, remove, removing] = useActionState(deleteAction, null);
  const [editing, setEditing] = useState<MikvahRow | null>(null);
  const [query, setQuery] = useState("");
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(editing), () => setEditing(null));

  // During render, not after the commit: as an effect React paints once with
  // the pop-up still open over a save that had already gone through.
  useOnActionSuccess([saveState, removeState], () => setEditing(null));

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("en");
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.city, row.country].some((field) => field.toLocaleLowerCase("en").includes(q)),
    );
  }, [rows, query]);

  const editable = rows.filter((row) => row.fromDatabase).length;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, city or country"
          className="min-w-0 flex-1 rounded-md border border-[var(--gold-light)] bg-white px-4 py-2.5 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)] sm:max-w-sm"
        />
        <span className="text-sm text-stone-500">
          {rows.length} listed · {editable} editable here
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

      {!dbConnected && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The content database is not connected, so these listings can be viewed but not edited here.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-[var(--gold-light)] bg-[#FAF8F3] p-5 text-sm leading-6 text-stone-600">
          {rows.length === 0 ? "No mikvah listings yet." : "Nothing matches that search."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)]">
          {shown.map((row) => {
            const badge = statusLabel(row);
            const canEdit = row.fromDatabase && dbConnected;
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--navy)]">{row.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">
                    {[row.city, row.country].filter(Boolean).join(", ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${badge.tone}`}>{badge.text}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold-ink)]">
                    {canEdit ? "Edit" : "In its town →"}
                  </span>
                </span>
              </>
            );
            return (
              <li key={row.id}>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#FAF8F3]"
                  >
                    {body}
                  </button>
                ) : (
                  <Link
                    href={row.townHref}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#FAF8F3]"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
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
            aria-labelledby="mikvah-modal-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16, 47, 53,.20)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="mikvah-modal-title" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                  Edit mikvah
                </h3>
                <p className="mt-1 text-xs text-stone-500">{[editing.city, editing.country].filter(Boolean).join(", ")}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Close
              </button>
            </div>

            <form action={save} key={editing.id} className="mt-5 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="placeId" value={editing.id} />
              <label className="block sm:col-span-2">
                <span className={labelClass}>Name</span>
                <input name="name" required disabled={saving} defaultValue={editing.name} className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Status</span>
                <select name="status" disabled={saving} defaultValue={editing.status} className={inputClass}>
                  <option value="PUBLISHED">Published</option>
                  <option value="NEEDS_REVIEW">Needs review</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Phone</span>
                <input name="phone" disabled={saving} defaultValue={editing.phone ?? ""} className={inputClass} />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Address</span>
                <input name="address" disabled={saving} defaultValue={editing.address ?? ""} className={inputClass} />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Hours</span>
                <input
                  name="hours"
                  disabled={saving}
                  defaultValue={editing.hours ?? ""}
                  placeholder="By appointment"
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Website (https://…)</span>
                <input
                  name="website"
                  type="url"
                  disabled={saving}
                  defaultValue={editing.website ?? ""}
                  placeholder="https://…"
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Source link (https://…)</span>
                <input
                  name="sourceUrl"
                  type="url"
                  disabled={saving}
                  defaultValue={editing.sourceUrl}
                  placeholder="https://…"
                  className={`${inputClass} font-mono text-xs`}
                />
                <span className="mt-1 block text-xs text-stone-500">
                  A published listing needs a source before it shows on the public page.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Notes</span>
                <textarea
                  name="notes"
                  rows={3}
                  disabled={saving}
                  defaultValue={editing.notes ?? ""}
                  className={inputClass}
                />
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving || !dbConnected}
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

            <form action={remove} className="mt-4 border-t border-[var(--gold-light)] pt-4">
              <input type="hidden" name="placeId" value={editing.id} />
              <button
                type="submit"
                disabled={removing}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove this mikvah"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
