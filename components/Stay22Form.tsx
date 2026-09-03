"use client";

import { useActionState, useState } from "react";
import { saveStay22Action } from "@/app/admin/settings/earnings/actions";
import { aidProblem, describeStay22, hotelButtonLabel, PROVIDERS, type Stay22Settings } from "@/lib/stay22";

/**
 * The Stay22 ID, and which desk it sends people to.
 *
 * ONE FIELD THAT MATTERS. Everything else about the hotel search — the place,
 * the dates, the number of adults — the site already has, so there is nothing
 * to paste and no format to get wrong. The mistakes worth catching are pasting
 * the whole Allez link instead of the ID out of it, or pasting the embed
 * script; both look official and neither is the ID.
 *
 * THE BUTTON'S WORDS ARE SHOWN BACK, because turning this on changes what a
 * traveller sees and where they land. Somebody should be able to read that
 * before saving rather than discovering it on the live site.
 */

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function Stay22Form({ current, storeReady }: { current: Stay22Settings; storeReady: boolean }) {
  const [settings, setSettings] = useState<Stay22Settings>(current);
  const [state, act, busy] = useActionState(saveStay22Action, null);
  const problem = aidProblem(settings.aid);

  return (
    <form action={act} className="mt-6 space-y-5">
      <p className="text-sm leading-6 text-stone-600">{describeStay22(settings)}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Stay22 ID</span>
          <input
            name="aid"
            type="text"
            value={settings.aid}
            onChange={(e) => setSettings({ ...settings, aid: e.target.value })}
            placeholder="The short code on your dashboard"
            className={`${input} font-mono text-xs`}
          />
          {problem ? (
            <span className="mt-1.5 block text-xs leading-5 text-red-700">{problem}</span>
          ) : (
            <span className="mt-1.5 block text-xs leading-5 text-stone-500">
              Just the ID — not the whole link and not the script. Empty means hotels go to Booking.com as before, and Kayak flights and cars only earn if a wrap is pasted below.
            </span>
          )}
        </label>

        <label className="block">
          <span className={label}>Where they land</span>
          <select
            name="provider"
            value={settings.provider}
            onChange={(e) => setSettings({ ...settings, provider: e.target.value as Stay22Settings["provider"] })}
            className={input}
          >
            {PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs leading-5 text-stone-500">
            {PROVIDERS.find((p) => p.key === settings.provider)?.note}
          </span>
        </label>
      </div>

      <p className="rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        The search button will read “<span className="text-[var(--navy)]">{hotelButtonLabel()}</span>”, so
        nobody is sent somewhere without being told first.
      </p>

      <p className="rounded-md border border-[var(--gold-light)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        The Stay22 <span className="font-semibold text-[var(--navy)]">ID above is for tracked links</span> (Allez
        hand-off for hotels, and Kayak flights and cars). Live places to stay and prices on /book need a separate server key: set{" "}
        <code className="rounded bg-white px-1.5 py-0.5 text-xs">STAY22_API_KEY</code> in{" "}
        <code className="rounded bg-white px-1.5 py-0.5 text-xs">.env.local</code> and Vercel (from hub.stay22.com →
        Settings → API). Without that key, searches still open via the ID.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !storeReady || Boolean(problem)}
          className="bg-[var(--navy)] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {state && !problem && (
          <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
