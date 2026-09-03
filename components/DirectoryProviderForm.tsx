"use client";
import FormDateField from "@/components/FormDateField";
import { FEATURED_REASONS } from "@/lib/features";

import { useActionState } from "react";
import type { DirectoryProvider } from "@prisma/client";
import { type ActionResult, deleteProviderAction, saveProviderAction } from "@/app/admin/directory/actions";

const CATEGORIES: Array<[string, string]> = [
  ["TOUR_OPERATOR", "Tour operator / organizer"],
  ["VACATION_PLANNER", "Vacation planner / concierge"],
  ["TRAVEL_AGENCY", "Travel agency"],
  ["GUIDE_DRIVER", "Tour guide / private driver"],
];

const STATUSES: Array<[string, string]> = [
  ["PUBLISHED", "Published — visible in the directory"],
  ["DRAFT", "Draft — hidden from visitors"],
  ["NEEDS_REVIEW", "Needs review — hidden from visitors"],
];

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

/**
 * A built-in provider, opened for editing.
 *
 * It has no database row, so it cannot be passed as `provider` — the hidden
 * slug that comes with one makes the action UPDATE, and there is nothing to
 * update. Saving one CREATES a row, keeping the built-in's slug so the new row
 * replaces it in the public directory instead of duplicating it.
 */
export type BuiltInDraft = {
  slug: string;
  name: string;
  category: string;
  tagline?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  basedIn?: string;
  regions?: string[];
  languages?: string[];
  specialties?: string[];
  featured?: boolean;
};

export default function DirectoryProviderForm({
  provider,
  draft,
}: {
  provider: DirectoryProvider | null;
  draft?: BuiltInDraft | null;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveProviderAction, null);
  const [delState, delAction, delPending] = useActionState<ActionResult | null, FormData>(deleteProviderAction, null);
  // Defaults come from whichever we have. `provider` alone still decides
  // whether this is an update (hidden slug, delete button) or a create.
  const p = provider ?? (draft ? ({ ...draft, status: "PUBLISHED" } as unknown as DirectoryProvider) : null);

  return (
    <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{p ? `Edit ${p.name}` : "Add a provider"}</h2>
      {!provider && draft && (
        <p className="mt-3 border-l-4 border-[var(--gold)] bg-white px-4 py-3 text-sm leading-6 text-stone-700">
          This one ships with the site. Saving it makes it yours — your version replaces it in the directory, and you can
          change or remove it from then on.
        </p>
      )}

      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        {provider ? (
          <input type="hidden" name="slug" value={provider.slug} />
        ) : draft ? (
          <input type="hidden" name="builtInSlug" value={draft.slug} />
        ) : null}
        <label className="block sm:col-span-2">
          <span className={captionClass}>Business name *</span>
          <input name="name" defaultValue={p?.name ?? ""} className={inputClass} required />
        </label>
        <label className="block">
          <span className={captionClass}>Category</span>
          <select name="category" defaultValue={p?.category ?? "TOUR_OPERATOR"} className={inputClass}>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={captionClass}>Visibility</span>
          <select name="status" defaultValue={p?.status ?? "PUBLISHED"} className={inputClass}>
            {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Tagline</span>
          <input name="tagline" defaultValue={p?.tagline ?? ""} className={inputClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Description</span>
          <textarea name="description" defaultValue={p?.description ?? ""} rows={3} className={inputClass} />
        </label>
        <label className="block">
          <span className={captionClass}>Phone</span>
          <input name="phone" defaultValue={p?.phone ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className={captionClass}>WhatsApp</span>
          <input name="whatsapp" defaultValue={p?.whatsapp ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className={captionClass}>Email</span>
          <input name="email" defaultValue={p?.email ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className={captionClass}>Website</span>
          <input name="website" defaultValue={p?.website ?? ""} className={inputClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Based in</span>
          <input name="basedIn" defaultValue={p?.basedIn ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className={captionClass}>Regions served (comma-separated)</span>
          <input name="regions" defaultValue={p?.regions.join(", ") ?? ""} className={inputClass} placeholder="Ukraine, Poland, Worldwide" />
        </label>
        <label className="block">
          <span className={captionClass}>Languages (comma-separated)</span>
          <input name="languages" defaultValue={p?.languages.join(", ") ?? ""} className={inputClass} placeholder="English, Hebrew, Yiddish" />
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>Specialties (comma-separated)</span>
          <input name="specialties" defaultValue={p?.specialties.join(", ") ?? ""} className={inputClass} placeholder="Uman, kevarim tours, honeymoons" />
        </label>
        <label className="block">
          <span className={captionClass}>How quickly they answer (their words)</span>
          <input name="responseTime" defaultValue={p?.responseTime ?? ""} className={inputClass} placeholder="same day / within a week" />
        </label>
        <label className="block">
          <span className={captionClass}>Date you last checked this listing</span>
          <FormDateField name="verifiedAt" defaultValue={p?.verifiedAt ? p.verifiedAt.toISOString().slice(0, 10) : ""} className={inputClass} ariaLabel="Date you last checked this listing" />
        </label>

        {/* Permission to publish their number. Off unless somebody asked. */}
        <div className="sm:col-span-2 border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="contactConsent" defaultChecked={p?.contactConsent ?? false} className="h-4 w-4" />
            <span className="text-sm font-semibold text-[var(--navy)]">They agreed their phone number may be published</span>
          </label>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Off unless somebody asked them. Many of these are one person with a mobile, and having been given a number
            is not the same as agreeing it goes on a public page. Left off, the number is kept here and the directory
            says a number is held but not publishable — unless the listing has a public source of their own, which is
            its own ground.
          </p>
          <label className="mt-3 block">
            <span className={captionClass}>How they gave it</span>
            <input name="contactConsentNote" defaultValue={p?.contactConsentNote ?? ""} className={inputClass} placeholder="asked by phone, 4 March" />
          </label>
        </div>

        <div className="sm:col-span-2 border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="featured" defaultChecked={p?.featured ?? false} className="h-4 w-4" />
            <span className="text-sm font-semibold text-[var(--navy)]">Featured — shown first in its category</span>
          </label>
          <label className="mt-3 block">
            <span className={captionClass}>Why (your record — visitors are not told which)</span>
            <select name="featuredReason" defaultValue={p?.featuredReason ?? ""} className={inputClass}>
              <option value="">Choose one…</option>
              {FEATURED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            The badge looks the same either way. The directory tells visitors that some featured listings are
            sponsored, without naming them.
          </p>
        </div>
        <div className="sm:col-span-2 flex items-center gap-4">
          <button type="submit" disabled={pending} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--gold)] hover:border-[var(--gold)] disabled:opacity-60">
            {pending ? "Saving…" : provider ? "Save changes" : draft ? "Save as mine" : "Add provider"}
          </button>
          {state && <span className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
        </div>
      </form>

      {provider && (
        <form action={delAction} className="mt-5 border-t border-[var(--gold-light)] pt-4">
          <input type="hidden" name="slug" value={provider.slug} />
          <button type="submit" disabled={delPending} className="text-xs font-bold uppercase tracking-[0.12em] text-red-700 underline decoration-red-300 underline-offset-4 disabled:opacity-60">
            {delPending ? "Removing…" : "Delete this provider"}
          </button>
          {delState && <span className="ml-3 text-sm font-semibold text-stone-600">{delState.message}</span>}
        </form>
      )}
    </div>
  );
}
