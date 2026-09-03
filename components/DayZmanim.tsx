"use client";

import type { ZmanimDay } from "@/lib/zmanim-day";

/**
 * The day's zmanim, on the day's own card.
 *
 * Read standing up, on a phone, by somebody who wants one number: how long
 * until sof zman Shema, or what time to light. So the times are the largest
 * thing here and the labels are small, and the whole block stays quiet on an
 * ordinary Tuesday — an occasion, a fast, a Shabbos is what earns colour.
 */

function spanLabel(span: ZmanimDay["blocks"][number]["span"], placeName: string) {
  if (span === "morning") return `Morning — ${placeName}`;
  if (span === "evening") return `Afternoon and evening — ${placeName}`;
  return placeName;
}

export default function DayZmanim({ zmanim }: { zmanim: ZmanimDay | undefined }) {
  if (!zmanim) return null;

  const split = zmanim.blocks.length > 1;

  return (
    <section
      className={`mt-4 rounded-xl border p-4 ${
        zmanim.restDay ? "border-[var(--gold)] bg-[var(--cream)]" : "border-[var(--gold-light)] bg-[#FAF8F3]"
      }`}
      aria-label={`Zmanim for ${zmanim.date}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--gold-ink)]">Zmanim</h4>
        {zmanim.occasion && (
          <span className="rounded-full border border-[var(--gold)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
            {zmanim.occasion}
          </span>
        )}
      </div>

      {zmanim.unavailable ? (
        <p className="mt-2 text-sm leading-6 text-stone-500">{zmanim.unavailable}</p>
      ) : (
        <>
          {/* Two places only when the day genuinely has two — see lib/zmanim-day.ts. */}
          {split && (
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The day starts and ends far enough apart to move the clock, so the times are given for both.
            </p>
          )}

          <div className={split ? "mt-3 grid gap-4 sm:grid-cols-2" : "mt-3"}>
            {zmanim.blocks.map((block) => (
              <div key={block.span}>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">
                  {spanLabel(block.span, block.placeName)}
                </p>
                <dl className="mt-1.5">
                  {block.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-baseline justify-between gap-3 border-b border-[var(--gold-light)] py-1 last:border-b-0"
                    >
                      <dt className="min-w-0 text-sm leading-6 text-stone-600">{entry.label}</dt>
                      <dd className="shrink-0 font-[family-name:var(--font-display)] text-lg tabular-nums text-[var(--navy)]">
                        {entry.time}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
