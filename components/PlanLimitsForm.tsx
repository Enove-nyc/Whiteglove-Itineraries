"use client";

import { useActionState, useState } from "react";
import { saveLimitsAction } from "@/app/admin/settings/limits/actions";
import { PLAN_LABELS } from "@/lib/account-plans";
import { BUILT_IN_LIMITS, describeLimits, type LimitOverrides, limitsFor, UNLIMITED } from "@/lib/account-limits";
import { PAID_PLANS } from "@/lib/plan-billing";

/**
 * The two numbers, per plan.
 *
 * BLANK MEANS NO LIMIT, and it says so beside every box rather than once at the
 * top — a blank field that quietly means "unlimited" and a blank field that
 * means "nothing set yet" look identical, and getting them the wrong way round
 * would either lock everybody out or let everybody through.
 *
 * The sentence under each plan is the one a traveller reads on their own
 * account page, shown here before it is saved. The last time a limit went in
 * without that, nobody could check what anybody had been told.
 */

const input =
  "mt-1.5 w-28 rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

const boxValue = (v: number | null) => (v === UNLIMITED ? "" : String(v));

export default function PlanLimitsForm({ current, storeReady }: { current: LimitOverrides; storeReady: boolean }) {
  const [draft, setDraft] = useState<LimitOverrides>(() => {
    const start: LimitOverrides = {};
    for (const plan of PAID_PLANS) start[plan] = limitsFor(plan, current);
    return start;
  });
  const [state, act, busy] = useActionState(saveLimitsAction, null);

  const set = (plan: (typeof PAID_PLANS)[number], field: "trips" | "printsPerWeek", raw: string) => {
    const n = raw.trim() === "" ? UNLIMITED : Number(raw);
    setDraft({ ...draft, [plan]: { ...draft[plan], [field]: Number.isFinite(n as number) ? n : UNLIMITED } });
  };

  return (
    <form action={act} className="mt-8 space-y-6">
      {!storeReady && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          The private store is not connected, so nothing here can be saved. The built-in numbers are in force:
          nothing can be planned before a plan is chosen, and {PLAN_LABELS.one_trip} is capped at{" "}
          {BUILT_IN_LIMITS.one_trip.trips} trip.
        </p>
      )}

      {PAID_PLANS.map((plan) => {
        const shown = limitsFor(plan, draft);
        return (
          <div key={plan} className="rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">{PLAN_LABELS[plan]}</h3>
            <div className="mt-3 flex flex-wrap gap-6">
              <label className="block">
                <span className={label}>Trips at a time</span>
                <input
                  name={`${plan}-trips`}
                  type="number"
                  min={1}
                  value={boxValue(shown.trips)}
                  onChange={(e) => set(plan, "trips", e.target.value)}
                  placeholder="No limit"
                  className={input}
                />
                <span className="mt-1 block text-xs leading-5 text-stone-500">Blank means no limit.</span>
              </label>
              <label className="block">
                <span className={label}>Printable copies a week</span>
                <input
                  name={`${plan}-prints`}
                  type="number"
                  min={1}
                  value={boxValue(shown.printsPerWeek)}
                  onChange={(e) => set(plan, "printsPerWeek", e.target.value)}
                  placeholder="No limit"
                  className={input}
                />
                <span className="mt-1 block text-xs leading-5 text-stone-500">Blank means no limit.</span>
              </label>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-600">{describeLimits(plan, shown)}</p>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !storeReady}
          className="bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {state && (
          <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
