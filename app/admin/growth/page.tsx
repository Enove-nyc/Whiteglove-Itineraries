import Link from "next/link";
import { buildGrowthReport } from "@/lib/growth-report";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

function Table({
  title,
  intro,
  rows,
  empty,
}: {
  title: string;
  intro: string;
  rows: Array<{ label: string; count: number }>;
  empty: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{intro}</p>
      {rows.length === 0 ? (
        <p className={`${card} mt-3 text-sm text-stone-600`}>{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className={`${card} flex justify-between gap-4 text-sm`}>
              <span className="min-w-0 break-words text-[var(--navy)]">{row.label}</span>
              <span className="shrink-0 tabular-nums text-stone-500">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminGrowthPage() {
  const report = await buildGrowthReport();
  const selectionRate =
    report.searchToSelection.searches > 0
      ? Math.round((report.searchToSelection.selections / report.searchToSelection.searches) * 1000) / 10
      : null;

  return (
    <div className="pb-12">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Demand &amp; conversion</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Growth</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{report.says}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/admin/reports" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Empty pages &amp; missing searches →
          </Link>
          <Link href="/admin/alerts" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Email alert signups →
          </Link>
          <Link href="/admin/settings/earnings" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            Partner earnings setup →
          </Link>
        </div>
      </header>

      {!report.configured ? (
        <section className={`${card} mt-7`}>
          <p className="text-sm leading-6 text-stone-600">
            Connect UPSTASH_REDIS_REST_URL and _TOKEN to start counting visits, searches and booking clicks.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className={card}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Search events</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
                {report.searchToSelection.searches}
              </p>
            </div>
            <div className={card}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Result opens</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
                {report.searchToSelection.selections}
              </p>
              {selectionRate !== null && (
                <p className="mt-1 text-xs text-stone-500">{selectionRate}% of search volume opened a result kind</p>
              )}
            </div>
            <div className={card}>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Alert signups</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{report.alertTotal}</p>
            </div>
          </section>

          <Table
            title="Common searches"
            intro="What people typed into search, most often first."
            rows={report.topSearches}
            empty="No searches recorded yet."
          />
          <Table
            title="Searches with nothing to show"
            intro="Asked for, and not here — the queue of places or services to add."
            rows={report.emptySearches}
            empty="No empty searches recorded."
          />
          <Table
            title="Result kinds opened"
            intro="Which kinds of results people open from search — not the query text."
            rows={report.searchKinds}
            empty="No result opens recorded yet."
          />
          <Table
            title="Filters used"
            intro="Facet labels only (e.g. country or kind) — never personal data."
            rows={report.searchFilters}
            empty="No filter usage recorded yet. Instrumentation is ready when search emits filter events."
          />

          <section className="mt-10">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Destinations viewed</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Visits, booking-partner clicks and alert signups per destination slug.
            </p>
            {report.topDestinations.length === 0 ? (
              <p className={`${card} mt-3 text-sm text-stone-600`}>No destination pages counted yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {report.topDestinations.map((row) => (
                  <li key={row.label} className={`${card} grid gap-2 text-sm sm:grid-cols-[1fr_auto_auto_auto]`}>
                    <span className="font-semibold text-[var(--navy)]">{row.label}</span>
                    <span className="text-stone-500">{row.visits} visits</span>
                    <span className="text-stone-500">{row.clicks} clicks</span>
                    <span className="text-stone-500">{row.alerts} alerts</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Busy pages with no booking clicks</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Destination pages with at least five visits and zero tracked partner clicks — often a placement or partner gap.
            </p>
            {report.highTrafficLowEngagement.length === 0 ? (
              <p className={`${card} mt-3 text-sm text-stone-600`}>Nothing in this band yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {report.highTrafficLowEngagement.map((row) => (
                  <li key={row.path} className={`${card} flex justify-between gap-4 text-sm`}>
                    <span className="text-[var(--navy)]">{row.path}</span>
                    <span className="text-stone-500">{row.visits} visits</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Table
            title="Affiliate clicks by product"
            intro="Hotel, flight, car and other products pressed through /go."
            rows={report.affiliateByProduct}
            empty="No affiliate clicks recorded yet."
          />
          <Table
            title="Affiliate clicks by placement"
            intro="Named positions on the page — useful to see which destination blocks earn."
            rows={report.affiliateByPlacement}
            empty="No placement clicks recorded yet."
          />

          <section className="mt-10">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Recent booking clicks</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Anonymous session clicks only — destination, page, partner category and whether a referral was recorded.
            </p>
            {report.recentClicks.length === 0 ? (
              <p className={`${card} mt-3 text-sm text-stone-600`}>No clicks in the ledger yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {report.recentClicks.map((click, i) => (
                  <li key={`${click.at}-${i}`} className={`${card} text-sm text-stone-600`}>
                    <span className="font-semibold text-[var(--navy)]">{click.product}</span>
                    {" · "}
                    {click.destinationSlug || "no destination"}
                    {" · "}
                    {click.placement || "unnamed"}
                    {" · "}
                    {click.page || "unknown page"}
                    {" · "}
                    {click.earns ? "earning" : "not earning"}
                    <span className="block text-xs text-stone-400">{click.at}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Table
            title="Alert topics"
            intro="What people asked to be emailed about."
            rows={report.alertTopics}
            empty="No alert signups counted yet."
          />
        </>
      )}
    </div>
  );
}
