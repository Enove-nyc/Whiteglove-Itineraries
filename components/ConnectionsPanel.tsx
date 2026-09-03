import { type Reading, WEIGHT_LABELS, launchSummary, sortForReview } from "@/lib/connections";

/**
 * Everything the site is plugged into, and what stops without it.
 *
 * A SERVER COMPONENT, and deliberately: it is handed only whether each
 * variable is empty, and no value ever reaches the browser. There is nothing
 * here that could leak a key because there is nothing here that holds one.
 *
 * It says SET, never "working". Whether a key is valid, the account is in
 * credit or the service is up is a question only a real request answers —
 * which is what the test buttons on the same page are for. A checklist that
 * said "connected" from the presence of a string would be the exact kind of
 * false comfort this exists to replace.
 */
export default function ConnectionsPanel({ readings }: { readings: Reading[] }) {
  const sorted = sortForReview(readings);
  const missingEssential = sorted.some((r) => !r.ready && r.connection.weight === "essential");

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Before you go live</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">What the site is plugged into</h2>
      <p className={`mt-3 max-w-2xl text-sm leading-6 ${missingEssential ? "font-semibold text-red-700" : "text-stone-600"}`}>
        {launchSummary(readings)}
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-stone-500">
        This says whether each one has been <strong>set</strong> — not whether it works. A key can be present and
        expired, or the account out of credit. The tests further down actually ask.
      </p>

      <ul className="mt-6 space-y-3">
        {sorted.map((reading) => (
          <li
            key={reading.connection.vars[0]}
            className={`border px-4 py-3 ${
              reading.ready
                ? "border-[var(--gold-light)] bg-white"
                : reading.connection.weight === "essential"
                  ? "border-red-300 bg-red-50"
                  : "border-[var(--gold)] bg-white"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--navy)]">{reading.connection.what}</p>
              <span className={`shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] ${reading.ready ? "text-emerald-700" : "text-red-700"}`}>
                {reading.ready ? "Set" : "Not set"}
              </span>
            </div>

            {!reading.ready && (
              <p className="mt-1.5 text-sm leading-6 text-stone-700">
                <strong className="text-[var(--navy)]">Without it:</strong> {reading.connection.without}
              </p>
            )}

            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              {WEIGHT_LABELS[reading.connection.weight]}
              {" · "}
              {/* The names, so somebody can go and set them. A name is not a
                  secret; the value is, and never comes near this page. */}
              <code className="text-[var(--navy)]">{reading.connection.vars.join(", ")}</code>
              {reading.connection.where && <> · {reading.connection.where}</>}
            </p>

            {!reading.ready && reading.missing.length < reading.connection.vars.length && (
              <p className="mt-1 text-xs leading-5 text-stone-500">
                Still needed: <code className="text-red-700">{reading.missing.join(", ")}</code>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
