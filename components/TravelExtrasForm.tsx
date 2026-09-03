"use client";

import { useActionState, useState } from "react";
import { saveExtrasAction } from "@/app/admin/settings/earnings/actions";
import {
  ctaFor,
  describeExtra,
  describeExtras,
  extraProblem,
  IDEAS,
  listProblem,
  MAX_EXTRAS,
  type TravelExtra,
} from "@/lib/travel-extras";

/**
 * Adding an eSIM, insurance, or anything else worth offering.
 *
 * EVERY ROW SAYS WHETHER IT EARNS, and neither answer is refused. A link
 * straight to the partner works perfectly and pays nothing, and there is no way
 * to tell the two apart by looking at the page — so the screen says which it is
 * rather than leaving it to be discovered from an empty statement six months
 * later.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

const blank = (name = ""): TravelExtra => ({
  // Not crypto.randomUUID: this runs during render on some browsers that do not
  // have it, and the value only has to be unique within one list.
  id: `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
  name,
  blurb: "",
  url: "",
  cta: "",
});

export default function TravelExtrasForm({ current, storeReady }: { current: TravelExtra[]; storeReady: boolean }) {
  const [rows, setRows] = useState<TravelExtra[]>(current);
  const [state, act, busy] = useActionState(saveExtrasAction, null);

  const update = (id: string, patch: Partial<TravelExtra>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const problem = listProblem(rows);
  const unused = IDEAS.filter((idea) => !rows.some((r) => r.name.trim().toLowerCase() === idea.toLowerCase()));

  return (
    <form action={act} className="mt-6 space-y-6">
      {/* The whole list travels as one field. Rows are added and removed in the
          browser, so posting them individually would mean a name for every row
          and a way to say which were deleted. */}
      <input type="hidden" name="extras" value={JSON.stringify(rows)} />

      <p className="text-sm leading-6 text-stone-600">{describeExtras(rows)}</p>

      {rows.map((row, index) => (
        <div key={row.id} className="rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <div className="flex items-start justify-between gap-4">
            <span className={label}>Offer {index + 1}</span>
            <button
              type="button"
              onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700 underline"
            >
              Remove
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Name</span>
              <input
                type="text"
                value={row.name}
                onChange={(e) => update(row.id, { name: e.target.value })}
                placeholder="eSIM data"
                className={input}
              />
            </label>
            <label className="block">
              <span className={label}>Button words</span>
              <input
                type="text"
                value={row.cta ?? ""}
                onChange={(e) => update(row.id, { cta: e.target.value })}
                placeholder={ctaFor({ ...row, cta: "" })}
                className={input}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={label}>The line underneath</span>
            <input
              type="text"
              value={row.blurb}
              onChange={(e) => update(row.id, { blurb: e.target.value })}
              placeholder="Data the moment you land, without swapping your SIM."
              className={input}
            />
          </label>

          <label className="mt-3 block">
            <span className={label}>Link</span>
            <input
              type="text"
              value={row.url}
              onChange={(e) => update(row.id, { url: e.target.value })}
              placeholder="Paste the affiliate link from your dashboard"
              className={`${input} font-mono text-xs`}
            />
          </label>

          <p className={`mt-2 text-xs leading-5 ${extraProblem(row) ? "text-red-700" : "text-stone-500"}`}>
            {describeExtra(row)}
          </p>
        </div>
      ))}

      {rows.length < MAX_EXTRAS && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRows([...rows, blank()])}
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Add one
          </button>
          {unused.length > 0 && <span className="text-xs text-stone-500">or start from —</span>}
          {unused.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setRows([...rows, blank(idea)])}
              className="rounded-full border border-[var(--gold-light)] px-3 py-1.5 text-xs text-[var(--navy)] hover:border-[var(--gold)]"
            >
              {idea}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !storeReady || Boolean(problem)}
          className="bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save the offers"}
        </button>
        {problem && <span className="text-sm font-semibold text-red-700">{problem}</span>}
        {state && !problem && (
          <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
