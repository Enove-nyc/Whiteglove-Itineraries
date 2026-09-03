import Link from "next/link";
import CspClearButton from "@/components/CspClearButton";
import { cspReportStoreAvailable, readCspSummary } from "@/lib/csp-reports";

export const dynamic = "force-dynamic";

/**
 * What the security policy has blocked, so it can be read.
 *
 * The policy in lib/csp-policy.ts now enforces, and still reports: a resource
 * it stops is both blocked and recorded here. Through the report-only phase
 * this table was how the policy was proven; now it is how a block is caught —
 * an empty table is the healthy state, and a row means a real page loaded
 * something the policy does not allow and it was stopped. That is worth seeing
 * fast, which is why enforcing did not also turn reporting off.
 */
export default async function AdminSecurityPage() {
  const summary = await readCspSummary();

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">
              Security policy
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              The site tells the browser which outside services a page is allowed to load — maps, the booking
              search, the card form — and now <strong className="font-semibold text-[var(--navy)]">enforces</strong> it:
              anything not on the list is stopped. It still records what it stops, so a block shows up here rather than
              breaking a page in silence.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              An empty list is the healthy state. A line appearing means a real page loaded a service the rule does not
              allow and it was blocked — worth looking at, since it may be something to add.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4"
          >
            All settings
          </Link>
        </div>
      </header>

      <section className="mx-auto mt-10 max-w-4xl">
        {!cspReportStoreAvailable() ? (
          <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
            <p className="text-sm leading-7 text-stone-600">
              The private store is not connected, so reports cannot be collected. This is the same store the accounts
              system uses; once it is connected, reports appear here on their own.
            </p>
          </div>
        ) : summary.rows.length === 0 ? (
          <div className="border border-[var(--gold)] bg-[#FAF8F3] p-8">
            <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Nothing has been blocked.</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              The policy is enforcing and no page has loaded a service it does not allow. This empty state is the one to
              want — every page, the maps, the booking search and the card form are working within the rule. If a line
              ever appears here, it names a real service that was stopped, and it is worth a look.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              {summary.total.toLocaleString()} report{summary.total === 1 ? "" : "s"} so far, grouped by the service
              that was stopped. Highest first.
            </p>
            <div className="mt-5 overflow-x-auto border border-[var(--gold-light)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--cream-deep)] text-left">
                    <th className="px-4 py-3 font-semibold text-[var(--navy)]">Service that was stopped</th>
                    <th className="px-4 py-3 font-semibold text-[var(--navy)]">What it wanted to do</th>
                    <th className="px-4 py-3 text-right font-semibold text-[var(--navy)]">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={`${row.directive}|${row.blocked}`} className="border-t border-[var(--gold-light)]">
                      <td className="px-4 py-3 font-mono text-[13px] text-[var(--navy)]">{row.blocked}</td>
                      <td className="px-4 py-3 text-stone-600">{describeDirective(row.directive)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-stone-600">{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {summary.samples.length > 0 && (
              <details className="mt-6">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                  The most recent examples, with the page each happened on
                </summary>
                <ul className="mt-3 space-y-1.5 text-[13px] text-stone-600">
                  {summary.samples.map((sample, index) => (
                    <li key={index} className="font-mono">
                      <span className="text-[var(--navy)]">{sample.blocked}</span> — {sample.directive} on{" "}
                      {sample.documentPath}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <CspClearButton />
          </>
        )}
      </section>
    </>
  );
}

/** The directive name, said in words the owner reads rather than a spec term. */
function describeDirective(directive: string): string {
  const map: Record<string, string> = {
    "script-src": "run a script",
    "connect-src": "make a background request",
    "frame-src": "open a frame",
    "img-src": "load an image",
    "style-src": "apply a stylesheet",
    "font-src": "load a font",
    "form-action": "submit a form to it",
    "media-src": "load audio or video",
    "default-src": "load something",
  };
  return map[directive] ?? directive;
}
