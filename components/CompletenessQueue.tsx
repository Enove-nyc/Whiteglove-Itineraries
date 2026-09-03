import Link from "next/link";
import { destinationDatabase } from "@/data/destination-database";
import { NOTHING_ENTERED, readDestinationFacts } from "@/lib/completeness-source";
import { completeness, destinationTrust } from "@/lib/verification";

/**
 * The work queue: which destination records are thinnest, and exactly what is
 * missing from each.
 *
 * This is the only place a completeness percentage appears. It is useful here
 * — it sorts 297 records into an order worth working through — and it would
 * be actively misleading on a public page, where a number beside a kever
 * reads as a rating of the kever rather than of our own record-keeping.
 *
 * It counts what is in the database where there is one, so a hospital or a
 * Shabbos note entered in the editor actually moves the number. Without a
 * database it falls back to the built-in content and counts what it can —
 * a queue that empties itself because a database blinked would say the work
 * was done.
 */
export default async function CompletenessQueue({ limit = 12 }: { limit?: number }) {
  const facts = await readDestinationFacts();
  const scored = destinationDatabase
    .map((record) => {
      // A destination the database has no row for has nothing entered, which
      // is an answer — not the same as not being able to ask. Only a database
      // that would not answer at all leaves every section unmeasured.
      const forThis = facts ? facts.get(record.id) ?? NOTHING_ENTERED : undefined;
      return { record, score: completeness(record, forThis), trust: destinationTrust(record) };
    })
    .sort((a, b) => a.score.score - b.score.score || a.record.city.localeCompare(b.record.city));

  const total = scored.length;
  const average = Math.round(scored.reduce((sum, item) => sum + item.score.score, 0) / Math.max(1, total));
  const empty = scored.filter((item) => item.score.score === 0).length;
  const notTracked = scored[0]?.score.notTracked ?? [];

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Completeness</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
        What needs filling in
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        {total} records, averaging {average}% of the content standard. {empty} have nothing practical on them yet.
        Visitors never see these numbers — they see what has been checked, and when.
      </p>
      {/* Which of the two it is counting. A number that quietly changed
          meaning because a database was or was not reachable would be worse
          than either number on its own. */}
      <p className="mt-2 text-xs leading-5 text-stone-500">
        {facts
          ? "Counted from what you have entered, every section included."
          : "Counted from the built-in content — the database is not connected, so the newer sections cannot be answered and are listed below as untracked."}
      </p>

      <ol className="mt-4 space-y-2">
        {scored.slice(0, limit).map(({ record, score, trust }) => (
          <li key={record.id} className="rounded-md border border-[var(--gold-light)] bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link href={`/admin/destinations?slug=${record.id}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
                {record.city}
              </Link>
              <span className="text-xs font-bold tabular-nums text-stone-500">
                {score.score}% · {score.filled}/{score.total}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              <span aria-hidden="true">{trust.glyph}</span> {trust.text}
            </p>
            {score.missing.length > 0 && (
              <p className="mt-1 text-xs leading-5 text-stone-600">
                Missing: {score.missing.slice(0, 6).join(", ")}
                {score.missing.length > 6 ? ` and ${score.missing.length - 6} more` : ""}
              </p>
            )}
          </li>
        ))}
      </ol>

      {notTracked.length > 0 && (
        <p className="mt-4 border-t border-[var(--gold-light)] pt-3 text-xs leading-5 text-stone-500">
          Counted as missing everywhere, because the record has nowhere to put them yet:{" "}
          <strong className="text-[var(--navy)]">{notTracked.join(", ")}</strong>. Adding those fields is a schema
          change, not data entry — until then no record can score 100%.
        </p>
      )}
    </section>
  );
}
