"use client";

import { useActionState } from "react";
import { createDestinationAction, type ActionResult } from "@/app/admin/destinations/actions";

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm transition focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";

export default function CreateDestinationForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createDestinationAction, null);
  return (
    <details className="border border-[var(--gold)] bg-[#FAF8F3] p-5">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
        + Create destination
      </summary>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        Creates a hidden town shell. It does not go public until its details and listings are reviewed.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <label className="block text-xs font-bold uppercase tracking-[0.1em] text-stone-500">
          City *
          <input name="city" required className={inputClass} />
        </label>
        <label className="block text-xs font-bold uppercase tracking-[0.1em] text-stone-500">
          Country *
          <input name="country" required className={inputClass} />
        </label>
        <label className="block text-xs font-bold uppercase tracking-[0.1em] text-stone-500">
          Yiddish / Hebrew name
          <input name="yiddishCity" className={inputClass} />
        </label>
        <label className="block text-xs font-bold uppercase tracking-[0.1em] text-stone-500">
          Source URL
          <input name="sourceUrl" type="url" placeholder="https://…" className={inputClass} />
        </label>
        <button disabled={pending} className="w-full bg-[var(--navy)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-60">
          {pending ? "Creating…" : "Create private destination"}
        </button>
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
            {state.message}
          </p>
        )}
      </form>
    </details>
  );
}
