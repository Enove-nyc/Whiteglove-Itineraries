"use client";

import { useActionState, useState } from "react";
import DateField from "@/components/DateField";
import { clearCrossingAction, saveCrossingAction, type ActionResult } from "@/app/admin/borders/actions";
import {
  CROSSING_STATES,
  STATE_WORDS,
  type Crossing,
  bordersCovered,
  checkAge,
  describeCrossing,
} from "@/lib/border-crossings";

/**
 * Where somebody writes down what the border was actually like.
 *
 * The route planner has always said "allow several hours" at an external EU
 * border. That is true and it is all it could say: the rule behind it knew
 * nothing about which crossings exist, so it could not tell somebody to use
 * Korczowa rather than Medyka, and nobody could correct it when one shut.
 *
 * The crossings themselves ship with the site and are not edited here in the
 * usual case — they do not move. What is entered here is the part that does:
 * open or queueing or shut, roughly how long, and THE DAY IT WAS CHECKED. The
 * date is required alongside the state, because the failure that matters is
 * not a missing note — it is March's queue length still being quoted in
 * August as though somebody had just looked.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const submitClass =
  "min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p role="status" className={`mt-3 text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
      {state.message}
    </p>
  );
}

function StateBadge({ crossing, today }: { crossing: Crossing; today: string }) {
  const age = checkAge(crossing.checkedAt, today);
  if (!age.fresh || !crossing.state) {
    return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500">Not checked</span>;
  }
  const tone =
    crossing.state === "open"
      ? "bg-emerald-100 text-emerald-900"
      : crossing.state === "slow"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-900";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{STATE_WORDS[crossing.state].short}</span>;
}

/** The form on one crossing. Its own component so each row keeps its own date. */
function CheckForm({
  crossing,
  today,
  action,
  onDone,
}: {
  crossing: Crossing;
  today: string;
  action: (payload: FormData) => void;
  onDone: () => void;
}) {
  const [checkedAt, setCheckedAt] = useState(crossing.checkedAt ?? today);
  const [state, setState] = useState<string>(crossing.state ?? "");

  return (
    <form action={action} className="mt-4 border-t border-[var(--gold-light)] pt-4">
      <input type="hidden" name="id" value={crossing.id} />
      <input type="hidden" name="name" value={crossing.name} />
      {/* What the note box was filled with. Recording a queue length should
          not quietly turn the note that ships with the site into the owner's
          own copy of it — only actually changing the words should. */}
      <input type="hidden" name="noteWas" value={crossing.note ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={captionClass}>What was it like?</span>
          <select name="state" value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
            <option value="">Not checked</option>
            {CROSSING_STATES.map((value) => (
              <option key={value} value={value}>
                {STATE_WORDS[value].short}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={captionClass}>The day you checked</span>
          {/* Required as soon as a state is chosen. Without it the answer
              would be shown as current forever. */}
          <DateField value={checkedAt} onChange={setCheckedAt} name="checkedAt" ariaLabel="The day you checked" />
        </label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="block">
          <span className={captionClass}>How long, in your own words</span>
          <input
            name="wait"
            defaultValue={crossing.wait ?? ""}
            className={inputClass}
            placeholder="About two hours for a coach, less before six in the morning"
          />
        </label>
        <label className="block">
          {/* A separate number, because the planner has to add it up and no
              amount of reading "less before six" turns into arithmetic it can
              trust. Left empty, the planner allows its standing figure and
              says that is what it is doing. */}
          <span className={captionClass}>Minutes, for the planner</span>
          <input
            name="waitMinutes"
            type="number"
            min={0}
            max={1440}
            inputMode="numeric"
            defaultValue={crossing.waitMinutes ?? ""}
            className={inputClass}
            placeholder="120"
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className={captionClass}>Anything permanent worth saying</span>
        <input
          name="note"
          defaultValue={crossing.note ?? ""}
          className={inputClass}
          placeholder="Coach lane on the right; no facilities on the Ukrainian side"
        />
      </label>
      <label className="mt-4 flex items-start gap-3 text-sm text-stone-700">
        <input type="checkbox" name="hidden" defaultChecked={crossing.hidden} className="mt-1 h-4 w-4 accent-[var(--navy)]" />
        <span>
          Take it off the list travellers see.
          <span className="block text-stone-500">What you have written stays here.</span>
        </span>
      </label>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" className={submitClass}>Save</button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-stone-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Forgetting what was recorded.
 *
 * Its own form, beside the check rather than inside it — a form cannot be
 * nested in a form, and this posts somewhere different. A built-in crossing
 * comes back unchecked; the road is still there, and clearing a note is not a
 * statement that the crossing has gone.
 */
function ClearButton({ crossing, action }: { crossing: Crossing; action: (payload: FormData) => void }) {
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={crossing.id} />
      <button
        type="submit"
        className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
      >
        {crossing.added ? "Delete it" : "Forget the check"}
      </button>
    </form>
  );
}

export default function BorderCrossingsEditor({
  crossings,
  today,
  storageReady,
  needACheck,
}: {
  crossings: Crossing[];
  today: string;
  storageReady: boolean;
  needACheck: string[];
}) {
  const [saveState, saveAction] = useActionState<ActionResult | null, FormData>(saveCrossingAction, null);
  const [clearState, clearAction] = useActionState<ActionResult | null, FormData>(clearCrossingAction, null);
  const [addState, addAction, addPending] = useActionState<ActionResult | null, FormData>(saveCrossingAction, null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = bordersCovered(crossings);

  return (
    <div className="space-y-8">
      {!storageReady && (
        <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Writing down what you checked needs the private store connected. The crossings below still show on the
          website — they just all read as unchecked, which is the truth until somebody checks them.
        </p>
      )}

      {/* Clearing happens from a row that then closes, so its answer belongs
          here rather than beside a form that is no longer on screen. */}
      <Status state={clearState} />

      {needACheck.length > 0 && (
        <section className="border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-4 py-3">
          <p className="text-sm leading-6 text-stone-700">
            {/* Not a scolding — a list of thirty crossings does not answer
                "where do I look next" on its own. */}
            <strong className="text-[var(--navy)]">Nothing checked lately on:</strong> {needACheck.join(", ")}.
          </p>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.key} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            {group.countries[0]} – {group.countries[1]}
          </h2>
          <ul className="mt-4 divide-y divide-[var(--gold-light)]">
            {group.crossings.map((crossing) => (
              <li key={crossing.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-[var(--navy)]">
                      {crossing.name}
                      <StateBadge crossing={crossing} today={today} />
                      {crossing.hidden && (
                        <span className="rounded-full bg-stone-200 px-2.5 py-1 text-[11px] font-bold text-stone-600">Hidden</span>
                      )}
                      {crossing.added && (
                        <span className="rounded-full bg-[var(--gold-light)] px-2.5 py-1 text-[11px] font-bold text-[var(--navy)]">Yours</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{describeCrossing(crossing, today)}</p>
                  </div>
                  {open !== crossing.id && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpen(crossing.id)}
                        className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)]"
                      >
                        {crossing.checkedAt ? "Update" : "Record a check"}
                      </button>
                      {(crossing.checkedAt || crossing.state || crossing.hidden || crossing.added) && (
                        <ClearButton crossing={crossing} action={clearAction} />
                      )}
                    </div>
                  )}
                </div>
                {open === crossing.id && (
                  <>
                    {/* Keyed on what is stored, so a save that lands leaves
                        the form showing what was actually saved rather than
                        whatever was typed a moment ago. */}
                    <CheckForm
                      key={`${crossing.id}:${crossing.state ?? ""}:${crossing.checkedAt ?? ""}`}
                      crossing={crossing}
                      today={today}
                      action={saveAction}
                      onDone={() => setOpen(null)}
                    />
                    <Status state={saveState} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Add a crossing</h2>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="min-h-[44px] border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)]"
            >
              Add one
            </button>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Only if one is missing. The list already has the road crossings on the borders these trips cross.
        </p>
        {adding && (
          <form action={addAction} className="mt-5">
            <input type="hidden" name="added" value="1" />
            <label className="block">
              <span className={captionClass}>What it is called *</span>
              <input name="name" required className={inputClass} placeholder="Korczowa – Krakovets" />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={captionClass}>Country on one side *</span>
                <input name="countryA" required className={inputClass} placeholder="Poland" />
              </label>
              <label className="block">
                <span className={captionClass}>Country on the other *</span>
                <input name="countryB" required className={inputClass} placeholder="Ukraine" />
              </label>
              <label className="block">
                <span className={captionClass}>Town on the first side *</span>
                <input name="townA" required className={inputClass} placeholder="Korczowa" />
              </label>
              <label className="block">
                <span className={captionClass}>Town on the other *</span>
                <input name="townB" required className={inputClass} placeholder="Krakovets" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className={captionClass}>Road</span>
              <input name="road" className={inputClass} placeholder="A4 / M10" />
            </label>
            <label className="mt-4 block">
              <span className={captionClass}>Anything permanent worth saying</span>
              <input name="note" className={inputClass} placeholder="Takes coaches; busy at the end of a week" />
            </label>
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-3 text-sm text-stone-700">
                <input type="checkbox" name="coaches" defaultChecked className="h-4 w-4 accent-[var(--navy)]" />
                Takes coaches and minibuses
              </label>
              <label className="flex items-center gap-3 text-sm text-stone-700">
                <input type="checkbox" name="pedestrians" className="h-4 w-4 accent-[var(--navy)]" />
                Takes people on foot
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={addPending || !storageReady} className={submitClass}>
                {addPending ? "Saving…" : "Add it"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="min-h-[44px] border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-stone-500"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        <Status state={addState} />
      </section>
    </div>
  );
}
