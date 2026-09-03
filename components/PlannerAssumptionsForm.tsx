"use client";

import { useActionState, useState } from "react";
import { BUILT_IN_ASSUMPTIONS, type PlannerAssumptions } from "@/data/planner-assumptions";
import { type AssumptionField, assumptionProblem, describeDay, FIELDS, GROUPS, workedExample } from "@/lib/planner-settings";
import { resetPlannerAction, savePlannerAction } from "@/app/admin/planner/actions";

/**
 * The figures the route planner judges a day by.
 *
 * THE WORKED EXAMPLE IS THE POINT. A number here does not change a label — it
 * changes whether a traveller is told his day is over-packed or wide open, and
 * a wrong one stays invisible until somebody plans a day around it. So the four
 * real legs at the top are recomputed as you type, before anything is saved:
 * change the motorway speed and watch Lizhensk → Uman move.
 *
 * Recomputing in the browser rather than on save is deliberate. Somebody
 * deciding whether 88 km/h is right for that road needs to see the answer while
 * he is deciding, not after he has committed it to every trip on the site.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";

function ResetButton() {
  const [state, act, busy] = useActionState(resetPlannerAction, null);
  return (
    <form action={act} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy} className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50">
        {busy ? "Putting them back…" : "Back to the built-in figures"}
      </button>
      {state && <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
    </form>
  );
}

function Field({ field, value, onChange }: { field: AssumptionField; value: string; onChange: (next: string) => void }) {
  const builtIn = String(BUILT_IN_ASSUMPTIONS[field.key]);
  const changed = value !== builtIn;
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
      </span>
      <input name={field.key} type={field.kind === "time" ? "time" : "number"} step={field.step} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
      <span className="mt-1 block text-xs leading-5 text-stone-500">
        {field.changes}
        {/* What the site ships with, always visible, so it is obvious what has
            been decided here and what is simply the figure it came with. */}
        {changed && <span className="ml-1 font-semibold text-[var(--gold-ink)]">Was {builtIn}.</span>}
      </span>
    </label>
  );
}

export default function PlannerAssumptionsForm({ current, storeReady }: { current: PlannerAssumptions; storeReady: boolean }) {
  const [state, save, saving] = useActionState(savePlannerAction, null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(current[f.key])])));

  // What the numbers as typed amount to. A plain read rather than memoised —
  // it is four distance sums, and a stale example would be worse than a
  // recomputed one.
  const typed: PlannerAssumptions = { ...current };
  for (const field of FIELDS) {
    const raw = values[field.key] ?? "";
    if (field.kind === "time") Object.assign(typed, { [field.key]: raw });
    else Object.assign(typed, { [field.key]: raw === "" ? Number.NaN : Number(raw) });
  }
  const problem = assumptionProblem(typed);
  const example = problem ? [] : workedExample(typed);
  const changedCount = FIELDS.filter((f) => String(typed[f.key]) !== String(BUILT_IN_ASSUMPTIONS[f.key])).length;

  if (!storeReady) {
    return (
      <p className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        The private store is not connected, so nothing can be changed yet. Every trip on the site is being planned with
        the figures below, which are the ones it ships with. {describeDay(current)}
      </p>
    );
  }

  return (
    <>
      <form action={save} className="mt-8 space-y-8">
        <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">What these figures make of it</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Four real legs</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{describeDay(typed)}</p>

          {problem ? (
            <p className="mt-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{problem}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {example.map((leg) => (
                <li key={leg.label} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--gold-light)] pb-2 text-sm">
                  {/* One leg per speed band, named, so it is obvious which
                      figure below moves which line. */}
                  <span className="text-[var(--navy)]">
                    {leg.label} <span className="text-stone-500">· {leg.band}</span>
                  </span>
                  <span className="text-stone-600">
                    {leg.km} km as the crow flies · <strong className="text-[var(--navy)]">≈ {leg.says}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 max-w-2xl text-xs leading-5 text-stone-500">
            These are the fallback estimates. When a real road time can be fetched for a leg, that is used instead and
            none of these figures touch it — which is why the driving speeds matter most on the days routing could not
            be reached.
          </p>
        </section>

        {GROUPS.map((group) => (
          <section key={group.id} className="border border-[var(--gold-light)] bg-white p-6">
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{group.title}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{group.note}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.filter((f) => f.group === group.id).map((field) => (
                <Field key={field.key} field={field} value={values[field.key] ?? ""} onChange={(next) => setValues((v) => ({ ...v, [field.key]: next }))} />
              ))}
            </div>
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={saving || Boolean(problem)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save these figures"}
          </button>
          <span className="text-sm text-stone-600">
            {changedCount === 0
              ? "Nothing differs from the figures the site ships with."
              : `${changedCount} figure${changedCount === 1 ? "" : "s"} differ${changedCount === 1 ? "s" : ""} from the built-in set.`}
          </span>
          {state && <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
        </div>
      </form>

      {/* OUTSIDE the form above, and it has to be: a <form> inside a <form> is
          not valid HTML, so the browser drops the inner one — the reset button
          would have submitted the save it is meant to undo, and the page would
          not hydrate. */}
      <div className="mt-8 border-t border-[var(--gold-light)] pt-6">
        <ResetButton />
      </div>
    </>
  );
}
