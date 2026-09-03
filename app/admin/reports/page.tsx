import Link from "next/link";
import ForgetSearchButton from "@/components/ForgetSearchButton";
import { buildDemandReport } from "@/lib/demand-data";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

/**
 * What people came looking for, set against what the site has.
 *
 * The checklist already says what is empty, about three hundred times over,
 * and says the same thing about all of them. This says which ones to do first,
 * using the site's own visit log — and, separately, what people asked for and
 * were shown nothing, which no checklist can contain because those records do
 * not exist yet.
 */
export default async function AdminReportsPage() {
  const report = await buildDemandReport();

  return (
    <div className="pb-12">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Reports</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{report.says}</p>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-stone-500">
          Counted since the private store was connected, not this month. Nothing here identifies anybody — it is page
          addresses and search words, with no visitor attached.
        </p>
        <p className="mt-3">
          <Link href="/admin/growth" className="text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Search, booking clicks and alert signups →
          </Link>
        </p>
      </header>

      {!report.counting ? (
        <section className={`${card} mt-7`}>
          <p className="text-sm leading-6 text-stone-600">
            Visits and searches are not being recorded, so this screen has nothing to read. It fills in on its own once{" "}
            <code>UPSTASH_REDIS_REST_URL</code> and <code>_TOKEN</code> are set.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="fill-first" className="mt-8">
            <h2 id="fill-first" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
              Fill these first
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Pages people open that have nothing on them, most-opened at the top. Somebody went looking for these and
              found a name and little else.
            </p>

            {report.fillFirst.length === 0 ? (
              <p className={`${card} mt-4 text-sm leading-6 text-stone-600`}>
                Nothing here. Every page anybody has opened has something on it.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {report.fillFirst.map((gap) => (
                  <li key={gap.path} className={`${card} flex flex-wrap items-start justify-between gap-4`}>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold text-[var(--navy)]">{gap.title}</span>
                        <span className="text-xs uppercase tracking-[0.1em] text-stone-400">{gap.kind}</span>
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{gap.missing}</p>
                      <p className="mt-1 text-xs text-stone-400">{gap.path}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-right">
                        <span className="block font-[family-name:var(--font-display)] text-3xl tabular-nums text-[var(--navy)]">
                          {gap.visits}
                        </span>
                        <span className="block text-[11px] uppercase tracking-[0.1em] text-stone-400">opens</span>
                      </span>
                      <Link
                        href={gap.editHref}
                        className="inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
                      >
                        Fill it in
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Said, never ranked. Nobody having opened a page is not a
                judgement on it — it is nothing known about it, and putting
                those in the list above would bury the pages people really do
                open. */}
            {report.emptyUnvisited > 0 && (
              <p className="mt-3 text-sm leading-6 text-stone-500">
                Another {report.emptyUnvisited} records are empty and nobody has opened them since counting began. They
                are not ranked here — there is nothing to rank them by.{" "}
                <Link href="/admin/inventory" className="underline decoration-[var(--gold)] underline-offset-4">
                  The checklist has all of them.
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="not-found" className="mt-10 border-t border-[var(--gold-light)] pt-8">
            <h2 id="not-found" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
              Asked for, and not here
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Searches that showed nothing at all. These may be records the site does not have — no checklist can list
              a town that was never created.
            </p>

            {report.missing.length === 0 ? (
              <p className={`${card} mt-4 text-sm leading-6 text-stone-600`}>
                Nothing. Everything searched for so far was found.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
                {report.missing.map((thing) => (
                  <li key={thing.term} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--navy)]">{thing.term}</p>
                      <p className="text-sm text-stone-500">
                        {thing.times === 1 ? "once" : `${thing.times} times`}
                        {thing.guess ? ` · looks like ${thing.guess}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/add?q=${encodeURIComponent(thing.term)}`}
                        className="inline-flex min-h-11 items-center border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)]"
                      >
                        Add it
                      </Link>
                      {/* A typo, or something since added. Forgetting one term
                          is not forgetting the count — the search itself is
                          still in the totals. */}
                      <ForgetSearchButton term={thing.term} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {report.paying.length > 0 && (
            <section aria-labelledby="paying" className="mt-10 border-t border-[var(--gold-light)] pt-8">
              <h2 id="paying" className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
                Where the work has paid
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Pages you have filled in that people keep opening. {report.visitsCounted.toLocaleString()} page opens
                counted in all.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {report.paying.slice(0, 10).map((page) => (
                  <li key={page.path} className={`${card} flex items-center justify-between gap-4`}>
                    <span className="min-w-0">
                      <span className="block font-semibold text-[var(--navy)]">{page.title}</span>
                      <span className="block text-xs text-stone-400">{page.path}</span>
                    </span>
                    <span className="shrink-0 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--navy)]">
                      {page.visits}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
