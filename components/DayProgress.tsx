"use client";

import { useState } from "react";
import type { DayAdjustment } from "@/data/itinerary";
import { dayStanding, formatSpan, fromNeedingLonger, LONGER_BY } from "@/lib/day-progress";

/**
 * "How is today actually going?" — asked on the day, answered in one tap.
 *
 * THE OWNER'S REPORT: the plan allows two hours at the border, somebody gets
 * through in twenty minutes, and from then on every figure on the page is
 * wrong — silently, because the day still reads as though it is on time.
 *
 * ONLY SHOWN ON THE DAY ITSELF. A trip being planned in three weeks has nothing
 * to say here, and a row of "are you running late?" buttons on every day of a
 * fortnight's itinerary would be noise on thirteen of them.
 *
 * THE QUICK ANSWERS ARE THE POINT. Somebody standing at a border with a phone
 * in one hand is not going to type. Three buttons for the common overruns, and
 * one for "we are moving on", which is the case the owner asked for: carry on
 * even though you are ahead.
 */

const pill =
  "min-h-11 rounded-full border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white";

export default function DayProgress({
  dayKey,
  adjustments,
  stopsLeft,
  typicalStopMins,
  onRecord,
  onClear,
}: {
  /** Namespaces this day's answers, so yesterday's border is not today's. */
  dayKey: string;
  adjustments: DayAdjustment[];
  stopsLeft: number;
  typicalStopMins: number;
  onRecord: (adjustment: DayAdjustment) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = adjustments.filter((a) => a.stopId.startsWith(`${dayKey}:`));
  const standing = dayStanding(mine, { stopsLeft, typicalStopMins });

  // The clock is read here, in an event, never while rendering — the same rule
  // the rest of the planner follows.
  const record = (deltaMins: number, kind: DayAdjustment["kind"], slot: string) => {
    const now = new Date().toISOString();
    const stopId = `${dayKey}:${slot}`;
    if (kind === "longer") {
      const made = fromNeedingLonger({ stopId, extraMins: deltaMins, now });
      if (made) onRecord(made);
      return;
    }
    onRecord({ stopId, deltaMins, at: now, kind: "done" });
  };

  const tone =
    standing.state === "ahead"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : standing.state === "behind"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-[var(--gold-light)] bg-[#FAF8F3] text-stone-700";

  return (
    <div className={`mt-4 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold leading-6">{standing.says}</p>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="text-xs font-bold uppercase tracking-[0.1em] underline decoration-[var(--gold)] underline-offset-4"
        >
          {open ? "Close" : standing.answered === 0 ? "How the day went" : "Change"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">The border</p>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              The plan allows a fixed time here, and it is the biggest guess in the day. Put in what it really took.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[10, 30, 60].map((mins) => (
                <button key={mins} type="button" className={pill} onClick={() => record(mins - 120, "done", "border")}>
                  {formatSpan(mins)}
                </button>
              ))}
              <button type="button" className={pill} onClick={() => record(60, "done", "border")}>
                Longer than planned
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Where you are now</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LONGER_BY.map((mins) => (
                <button key={mins} type="button" className={pill} onClick={() => record(mins, "longer", "here")}>
                  I need {formatSpan(mins)} more
                </button>
              ))}
              {/* The case the owner named: carry on, even though you are ahead. */}
              <button type="button" className={pill} onClick={() => record(-30, "done", "here")}>
                Done early, moving on
              </button>
            </div>
          </div>

          {standing.answered > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-bold uppercase tracking-[0.1em] text-red-700 underline underline-offset-4"
            >
              Forget today&rsquo;s adjustments
            </button>
          )}
        </div>
      )}
    </div>
  );
}
