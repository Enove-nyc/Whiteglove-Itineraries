"use client";

import { startTransition, useActionState, useState } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";
import { saveGearAction } from "@/app/admin/settings/travel-gear/actions";
import {
  describeGearItem,
  describeGearItems,
  gearCtaFor,
  gearItemProblem,
  gearListProblem,
  gearLooksUnfinished,
  GEAR_IDEAS,
  MAX_GEAR_ITEMS,
  priceCheckedLabel,
  type TravelGearItem,
} from "@/lib/travel-gear";

/**
 * The travel-gear shelf, as a LIST and a POP-UP — not one long stacked form.
 *
 * WHY THIS SHAPE. Every item used to be a full card of eight fields, all open
 * at once, so a shelf of a dozen things was a page you scrolled for a minute to
 * find the one you wanted to change. Now the page is the list of names; adding
 * opens a blank form over it, and pressing a name opens the same form filled in.
 * That is the whole of the "make it user-friendly" the owner asked for.
 *
 * SAVED ON EACH CHANGE. The form still posts the whole list to the one server
 * action (the browser owns adds and removes), but it does so the moment the
 * pop-up is saved or an item removed — so the list on the page is always what is
 * stored, with no separate "save the shelf" step to forget.
 *
 * NO AUTO-FILL FROM A LINK. Amazon's Product Advertising API is the only
 * sanctioned way to pull a picture, description and price from a link, and it is
 * not granted until an Associates account has 3 qualifying sales — see
 * lib/travel-gear.ts. So every field here is typed in.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const blank = (name = ""): TravelGearItem => ({
  id: `g${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
  name,
  description: "",
  imageUrl: "",
  price: "",
  priceCheckedAt: "",
  url: "",
  cta: "",
});

/** The one-word state of a row, for the list. */
function rowStatus(item: TravelGearItem): { text: string; className: string } {
  if (gearItemProblem(item)) return { text: "Not shown", className: "border-amber-300 bg-amber-50 text-amber-800" };
  if (gearLooksUnfinished(item)) return { text: "Draft", className: "border-stone-300 bg-stone-50 text-stone-600" };
  return { text: "Shown", className: "border-emerald-300 bg-emerald-50 text-emerald-800" };
}

type Editing = { item: TravelGearItem; isNew: boolean };

export default function TravelGearForm({ current, storeReady }: { current: TravelGearItem[]; storeReady: boolean }) {
  const [rows, setRows] = useState<TravelGearItem[]>(current);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [state, act, busy] = useActionState(saveGearAction, null);

  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(editing), () => setEditing(null));
  const unused = GEAR_IDEAS.filter((idea) => !rows.some((r) => r.name.trim().toLowerCase() === idea.toLowerCase()));

  /** Persist the whole list through the one action, and keep the page in step. */
  function persist(next: TravelGearItem[]) {
    setRows(next);
    const fd = new FormData();
    fd.set("items", JSON.stringify(next));
    startTransition(() => act(fd));
  }

  function openAdd(name = "") {
    if (!storeReady || rows.length >= MAX_GEAR_ITEMS) return;
    setModalError(null);
    setEditing({ item: blank(name), isNew: true });
  }

  function openEdit(row: TravelGearItem) {
    setModalError(null);
    setEditing({ item: { ...row }, isNew: false });
  }

  const patch = (p: Partial<TravelGearItem>) =>
    setEditing((e) => (e ? { ...e, item: { ...e.item, ...p } } : e));

  function saveModal() {
    if (!editing) return;
    const item = editing.item;
    const problem = gearItemProblem(item);
    if (problem) {
      setModalError(problem);
      return;
    }
    const next = editing.isNew ? [...rows, item] : rows.map((r) => (r.id === item.id ? item : r));
    const listProblem = gearListProblem(next);
    if (listProblem) {
      setModalError(listProblem);
      return;
    }
    persist(next);
    setEditing(null);
  }

  function removeModal() {
    if (!editing || editing.isNew) {
      setEditing(null);
      return;
    }
    persist(rows.filter((r) => r.id !== editing.item.id));
    setEditing(null);
  }

  return (
    <section className="mt-6">
      <p className="text-sm leading-6 text-stone-600">{describeGearItems(rows)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openAdd()}
          disabled={!storeReady || rows.length >= MAX_GEAR_ITEMS}
          className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-50"
        >
          Add one
        </button>
        {rows.length >= MAX_GEAR_ITEMS && (
          <span className="text-xs text-stone-500">That is the most this shelf holds ({MAX_GEAR_ITEMS}).</span>
        )}
        {busy && <span className="text-xs font-semibold text-stone-500">Saving…</span>}
        {!busy && state && (
          <span className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {state.ok ? "Saved." : state.message}
          </span>
        )}
      </div>

      {unused.length > 0 && storeReady && rows.length < MAX_GEAR_ITEMS && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-500">or start from —</span>
          {unused.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => openAdd(idea)}
              className="rounded-full border border-[var(--gold-light)] px-3 py-1.5 text-xs text-[var(--navy)] transition hover:border-[var(--gold)]"
            >
              {idea}
            </button>
          ))}
        </div>
      )}

      {/* The list: a name per row, pressable to edit. This is what the page is
          now — the fields live in the pop-up, not stacked down the screen. */}
      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-[var(--gold-light)] bg-[#FAF8F3] p-5 text-sm leading-6 text-stone-600">
          Nothing on the shelf yet. Press <strong className="text-[var(--navy)]">Add one</strong> to put the first item up.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--gold-light)] rounded-lg border border-[var(--gold-light)]">
          {rows.map((row) => {
            const status = rowStatus(row);
            const sub = priceCheckedLabel(row) || row.description.trim() || row.url.trim();
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#FAF8F3]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--navy)]">
                      {row.name.trim() || "Untitled item"}
                    </span>
                    {sub && <span className="mt-0.5 block truncate text-xs text-stone-500">{sub}</span>}
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${status.className}`}
                  >
                    {status.text}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* The pop-up — the same form for adding and for editing. */}
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
            aria-labelledby="gear-modal-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gold-light)] bg-white p-6 shadow-[0_24px_60px_rgba(16, 47, 53,.20)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="gear-modal-title" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                {editing.isNew ? "Add an item" : "Edit item"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Name</span>
                <input
                  type="text"
                  value={editing.item.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Travel Shabbos blech"
                  className={input}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className={label}>Button words</span>
                <input
                  type="text"
                  value={editing.item.cta ?? ""}
                  onChange={(e) => patch({ cta: e.target.value })}
                  placeholder={gearCtaFor({ ...editing.item, cta: "" })}
                  className={input}
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className={label}>Description</span>
              <input
                type="text"
                value={editing.item.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Folds flat, fits a carry-on, keeps food warm without a flame."
                className={input}
              />
            </label>

            <label className="mt-3 block">
              <span className={label}>Amazon (or other) link</span>
              <input
                type="text"
                value={editing.item.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="Paste your affiliate link"
                className={`${input} font-mono text-xs`}
              />
            </label>

            <label className="mt-3 block">
              <span className={label}>Picture link (optional)</span>
              <input
                type="text"
                value={editing.item.imageUrl}
                onChange={(e) => patch({ imageUrl: e.target.value })}
                placeholder="Paste a link to a picture — Amazon does not hand one over automatically yet"
                className={`${input} font-mono text-xs`}
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Price</span>
                <input
                  type="text"
                  value={editing.item.price}
                  onChange={(e) => {
                    const price = e.target.value;
                    patch({
                      price,
                      priceCheckedAt: price.trim() && !editing.item.priceCheckedAt ? today() : editing.item.priceCheckedAt,
                    });
                  }}
                  placeholder="$24.99"
                  className={input}
                />
              </label>
              <label className="block">
                <span className={label}>Price checked on</span>
                <input
                  type="date"
                  value={editing.item.priceCheckedAt}
                  onChange={(e) => patch({ priceCheckedAt: e.target.value })}
                  className={input}
                />
              </label>
            </div>

            {editing.item.imageUrl.trim() && (
              // `contain`, not `cover`, so this preview shows what the shelf will.
              // eslint-disable-next-line @next/next/no-img-element -- a preview of an owner-pasted external URL
              <img
                src={editing.item.imageUrl}
                alt=""
                className="mt-3 h-24 w-24 rounded-md border border-[var(--gold-light)] bg-[var(--cream)] object-contain p-1"
              />
            )}

            <p className={`mt-3 text-xs leading-5 ${gearItemProblem(editing.item) ? "text-red-700" : "text-stone-500"}`}>
              {describeGearItem(editing.item)}
            </p>
            {modalError && <p className="mt-2 text-sm font-semibold text-red-700">{modalError}</p>}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--gold-light)] pt-5">
              <button
                type="button"
                onClick={saveModal}
                disabled={busy || !storeReady}
                className="bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-stone-500 transition hover:text-[var(--navy)]"
              >
                Cancel
              </button>
              {!editing.isNew && (
                <button
                  type="button"
                  onClick={removeModal}
                  disabled={busy}
                  className="ml-auto text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline disabled:opacity-50"
                >
                  Remove from shelf
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
