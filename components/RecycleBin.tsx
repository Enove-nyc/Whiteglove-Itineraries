"use client";

import { useActionState } from "react";
import { forgetAction, restoreAction, type ActionResult } from "@/app/admin/recycle/actions";
import { KIND_WORDS, type Deleted, binSummary, describeDeleted, groupedByKind } from "@/lib/recycle";

/**
 * The bin, as a list of things with a way back.
 *
 * Restore is the loud button and "throw away" is the quiet one, because the
 * screen exists for the first. Somebody arrives here having just lost
 * something; the first thing under their thumb should be the one that returns
 * it.
 */

function Row({ row, today }: { row: Deleted; today: string }) {
  const [restoreState, restore, restoring] = useActionState<ActionResult | null, FormData>(restoreAction, null);
  const [forgetState, forget, forgetting] = useActionState<ActionResult | null, FormData>(forgetAction, null);
  const said = restoreState ?? forgetState;

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-[var(--navy)]">{row.title}</p>
        {row.detail && <p className="mt-0.5 text-sm text-stone-600">{row.detail}</p>}
        <p className="mt-1 text-xs text-stone-500">{describeDeleted(row, today)}</p>
        {said && (
          <p role="status" className={`mt-2 text-sm font-semibold ${said.ok ? "text-emerald-700" : "text-red-700"}`}>
            {said.message}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <form action={restore}>
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            disabled={restoring || forgetting}
            className="inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60"
          >
            {restoring ? "Putting it back…" : "Put it back"}
          </button>
        </form>
        <form action={forget}>
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            disabled={restoring || forgetting}
            className="inline-flex min-h-11 items-center border border-[var(--gold-light)] px-3 text-xs font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700 disabled:opacity-60"
          >
            Throw away
          </button>
        </form>
      </div>
    </li>
  );
}

export default function RecycleBin({
  rows,
  today,
  storageReady,
}: {
  rows: Deleted[];
  today: string;
  storageReady: boolean;
}) {
  if (!storageReady) {
    return (
      <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        There is no bin on this deployment — keeping deleted records needs the private store connected. Deleting still
        works, but nothing removed can be put back. Ask for <code>UPSTASH_REDIS_REST_URL</code> and <code>_TOKEN</code>{" "}
        to be set.
      </p>
    );
  }

  const groups = groupedByKind(rows);

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-stone-600">{binSummary(rows)}</p>

      {groups.map((group) => (
        <section key={group.kind} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
            {KIND_WORDS[group.kind].one}
            {group.rows.length > 1 ? "s" : ""}
          </h2>
          <ul className="mt-2 divide-y divide-[var(--gold-light)]">
            {group.rows.map((row) => (
              <Row key={row.id} row={row} today={today} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
