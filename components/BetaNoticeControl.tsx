"use client";

import { useActionState } from "react";
import type { BetaNotice } from "@/lib/beta-notice";
import { saveBetaNoticeAction } from "@/app/admin/settings/website/actions";

/**
 * The notice visitors see on their first visit, and the switch that ends it.
 *
 * Here rather than in the code because the day this site stops being new, it
 * has to be possible to turn this off without asking anybody — and because the
 * words are the kind of thing that gets better after a week of watching people
 * read them.
 *
 * The version box is the one that needs explaining, so it explains itself: it
 * is how you make everybody see a notice they have already dismissed.
 */

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function BetaNoticeControl({ notice, storeReady }: { notice: BetaNotice; storeReady: boolean }) {
  const [state, save, saving] = useActionState(saveBetaNoticeAction, null);

  return (
    <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">While the site is new</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">The notice on the first visit</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        Shown once to each visitor, on the first page they land on — never over the admin, and never over a sign-in
        box. Turn it off here when the site is no longer new.
      </p>

      {!storeReady ? (
        <p className="mt-5 border border-[var(--gold-light)] bg-white px-4 py-3 text-sm leading-6 text-stone-600">
          The private store is not connected, so this cannot be changed yet. Until it is, visitors see the built-in
          wording — which is the safe way round: a site that is new is new whether or not the store is connected.
        </p>
      ) : (
        <form action={save} className="mt-5 space-y-4">
          <label className="flex items-start gap-3 border border-[var(--gold-light)] bg-white px-4 py-3">
            <input type="checkbox" name="on" defaultChecked={notice.on} className="mt-1 h-4 w-4 accent-[var(--navy)]" />
            <span className="text-sm leading-6 text-stone-700">
              <strong className="text-[var(--navy)]">Show it.</strong> Untick when the site is finished enough that
              telling people it is not would be the wrong thing to say.
            </span>
          </label>

          <label className="block">
            <span className={captionClass}>Heading</span>
            <input name="heading" defaultValue={notice.heading} className={inputClass} />
          </label>

          <label className="block">
            <span className={captionClass}>What to confirm before travelling</span>
            <textarea name="body" defaultValue={notice.body} rows={3} className={inputClass} />
          </label>

          <label className="block">
            <span className={captionClass}>Version</span>
            <input name="version" defaultValue={notice.version} className={`${inputClass} max-w-[10rem]`} />
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Change this and everybody sees the notice again, including people who have already dismissed it.
              Somebody who agreed to the old wording has not agreed to the new one. Leave it alone for a small
              correction; change it when what you are saying is different.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-md bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save the notice"}
            </button>
            {state && (
              <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
