"use client";

import { useActionState, useState } from "react";
import {
  BULK_CONTENT_KINDS,
  bulkContentKindLabel,
  type BulkContentKind,
} from "@/lib/bulk-content";
import type { ContentImportCandidateView } from "@/lib/content-imports";
import { reviewContentImportCandidateAction } from "@/app/admin/imports/actions";
import ListingCategoryField from "@/components/ListingCategoryField";
import { normalizeListingCategory } from "@/data/listing-categories";

const fieldClass = "mt-1 w-full border border-[var(--gold-light)] bg-white px-3 py-2 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]";
const labelClass = "block text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]";

export default function ContentImportCandidateEditor({ candidate }: { candidate: ContentImportCandidateView }) {
  const [kind, setKind] = useState<BulkContentKind>(candidate.kind);
  const [state, action, pending] = useActionState(reviewContentImportCandidateAction, null);
  const editable = candidate.status !== "PUBLISHED";
  const categoryDefault = normalizeListingCategory(candidate.category) ?? candidate.category ?? "";

  return (
    <>
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={candidate.id} />

      {state && (
        <p className={`border-l-4 px-4 py-3 text-sm leading-6 ${state.ok ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-rose-500 bg-rose-50 text-rose-900"}`}>
          {state.message}
        </p>
      )}

      <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Review state</p>
        <p className="mt-2 text-lg font-semibold text-[var(--navy)]">{candidate.status.replace(/_/g, " ").toLocaleLowerCase("en")}</p>
        {candidate.duplicateOf && (
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Possible duplicate of {candidate.duplicateOf}. Merge copies unique names onto that listing; keep both if they are different places.
          </p>
        )}
        {candidate.publishBlockers.length > 0 && (
          <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-900">Publish blockers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-950">
              {candidate.publishBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        )}
        {candidate.status === "PUBLISHED" && (
          <p className="mt-3 text-sm leading-6 text-emerald-900">
            Published as {candidate.publishedKind}. This source candidate remains here as an audit record.
          </p>
        )}
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Fields below are prefilled from the source pack and any matching place already on the site. Check them, then save or publish — nothing goes live until you publish.
        </p>
      </section>

      <fieldset disabled={!editable || pending} className="space-y-8 disabled:opacity-60">
        <section className="grid gap-4 border border-[var(--gold-light)] bg-[#FAF8F3] p-5 md:grid-cols-2">
          <label className={labelClass}>
            Type
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as BulkContentKind)}
              className={fieldClass}
            >
              {BULK_CONTENT_KINDS.map((value) => <option key={value} value={value}>{bulkContentKindLabel(value)}</option>)}
            </select>
          </label>
          <ListingCategoryField
            name="category"
            defaultValue={categoryDefault}
            className={fieldClass}
            labelClassName={labelClass}
            label="Category"
            required
            disabled={!editable || pending}
          />
          <label className={labelClass}>
            Canonical name
            <input name="name" required defaultValue={candidate.name} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Aliases
            <input name="aliases" defaultValue={candidate.aliases.join(", ")} className={fieldClass} />
          </label>
          <label className={labelClass}>
            City
            <input name="city" required defaultValue={candidate.city} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Region
            <input name="region" defaultValue={candidate.region ?? ""} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Country
            <input name="country" required defaultValue={candidate.country} className={fieldClass} />
          </label>
          {(kind === "PRACTICAL" || kind === "KOSHER_FOOD") && (
            <label className={labelClass}>
              Destination slug
              <input name="destinationSlug" defaultValue={candidate.destinationSlug ?? ""} placeholder="e.g. miami" className={fieldClass} />
            </label>
          )}
        </section>

        <section className="grid gap-4 border border-[var(--gold-light)] bg-[#FAF8F3] p-5 md:grid-cols-2">
          <label className={`${labelClass} md:col-span-2`}>
            Customer-ready summary
            <textarea name="summary" defaultValue={candidate.summary ?? ""} rows={4} className={fieldClass} />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Published address
            <input name="address" defaultValue={candidate.address ?? ""} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Coordinates
            <input name="coordinates" defaultValue={candidate.coordinates ?? ""} placeholder="41.8921, 12.4780" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Website (confirm before publishing)
            <input type="url" name="website" defaultValue={candidate.website ?? ""} className={fieldClass} />
          </label>
        </section>

        {kind === "PLACE_TO_STAY" && (
          <section className="grid gap-4 border border-[var(--gold-light)] bg-[#FAF8F3] p-5 md:grid-cols-2">
            <p className="md:col-span-2 text-sm leading-6 text-stone-600">
              A place to stay is published only with the quarter or shul it is near. These coordinates belong to the anchor, not the hotel. Kosher status is completed in the destination editor, not from a bulk source.
            </p>
            <label className={labelClass}>
              Quarter or shul
              <input name="anchorName" defaultValue={candidate.anchorName ?? ""} className={fieldClass} />
            </label>
            <label className={labelClass}>
              Anchor coordinates
              <input name="anchorCoords" defaultValue={candidate.anchorCoords ?? ""} placeholder="41.8921, 12.4780" className={fieldClass} />
            </label>
            <input type="hidden" name="kosherClaim" value="none" />
          </section>
        )}

        {kind === "KOSHER_FOOD" && (
          <section className="border border-amber-300 bg-amber-50 p-5">
            <p className="text-sm leading-6 text-amber-950">
              This queue can preserve an official directory source, but it cannot publish a kosher claim. Confirm it in the destination editor before it becomes public.
            </p>
            <input type="hidden" name="kosherClaim" value={candidate.kosherClaim === "reported" ? "reported" : "none"} />
            <label className={`${labelClass} mt-4`}>
              Official community or certification source
              <input type="url" name="kosherSourceUrl" defaultValue={candidate.kosherSourceUrl ?? ""} className={fieldClass} />
            </label>
          </section>
        )}

        <section className="grid gap-4 border border-[var(--gold-light)] bg-[#FAF8F3] p-5 md:grid-cols-2">
          <label className={`${labelClass} md:col-span-2`}>
            Source record URL
            <input type="url" name="sourceUrl" required defaultValue={candidate.sourceUrl} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Stable source ID
            <input name="sourceId" required defaultValue={candidate.sourceId} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Source name
            <input name="sourceName" required defaultValue={candidate.sourceName} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Attribution
            <input name="attribution" required defaultValue={candidate.attribution} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Licence
            <input name="license" defaultValue={candidate.license ?? ""} className={fieldClass} />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Source evidence / review note
            <textarea
              name="sourceEvidence"
              defaultValue={candidate.sourceEvidence == null
                ? ""
                : typeof candidate.sourceEvidence === "string"
                  ? candidate.sourceEvidence
                  : JSON.stringify(candidate.sourceEvidence, null, 2)}
              rows={5}
              placeholder="What was checked on the source page, including the date when useful."
              className={fieldClass}
            />
          </label>
        </section>
      </fieldset>

      {candidate.sourceEvidence != null && (
        <details className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--navy)]">Source evidence preserved with this candidate</summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-stone-600">{JSON.stringify(candidate.sourceEvidence, null, 2)}</pre>
        </details>
      )}

      {editable && (
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="save" disabled={pending} className="min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save private review"}
          </button>
          {candidate.status === "NEEDS_REVIEW" && (
            <button
              type="submit"
              name="intent"
              value="publish"
              disabled={pending}
              onClick={(event) => {
                if (!window.confirm(`Publish “${candidate.name}”? Visitors will see it.`)) event.preventDefault();
              }}
              className="min-h-11 border border-emerald-700 bg-emerald-700 px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            >
              Save and publish
            </button>
          )}
          {kind === "KOSHER_FOOD" && (candidate.status === "NEEDS_REVIEW" || candidate.status === "DUPLICATE") && (
            <button type="submit" name="intent" value="confirm-linked" disabled={pending} className="min-h-11 border border-emerald-700 bg-emerald-700 px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
              Link verified public listing
            </button>
          )}
          {candidate.status === "REJECTED" ? (
            <button type="submit" name="intent" value="reopen" disabled={pending} className="min-h-11 border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50">
              Return to review
            </button>
          ) : (
            <button
              type="submit"
              name="intent"
              value="reject"
              disabled={pending}
              onClick={(event) => {
                if (!window.confirm(`Reject “${candidate.name}”? It stays in the private audit trail.`)) event.preventDefault();
              }}
              className="min-h-11 border border-rose-300 px-5 text-xs font-bold uppercase tracking-[0.12em] text-rose-800 disabled:opacity-50"
            >
              Reject candidate
            </button>
          )}
        </div>
      )}
    </form>
    {editable && candidate.duplicateOf && (
      <div className="mt-6 flex flex-wrap gap-3 border border-amber-200 bg-amber-50 p-5">
        <p className="w-full text-sm leading-6 text-amber-950">
          Flagged against {candidate.duplicateOf}. Merge never deletes a record.
        </p>
        <form action={action}>
          <input type="hidden" name="id" value={candidate.id} />
          <button
            type="submit"
            name="intent"
            value="merge"
            disabled={pending}
            onClick={(event) => {
              if (!window.confirm(`Merge unique names from “${candidate.name}” onto the existing listing? This candidate stays as a duplicate record.`)) {
                event.preventDefault();
              }
            }}
            className="min-h-11 border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
          >
            Merge unique names
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="id" value={candidate.id} />
          <button
            type="submit"
            name="intent"
            value="keep-both"
            disabled={pending}
            className="min-h-11 border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] disabled:opacity-50"
          >
            Keep both
          </button>
        </form>
      </div>
    )}
    </>
  );
}
