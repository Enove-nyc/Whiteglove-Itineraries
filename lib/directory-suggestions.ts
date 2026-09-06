import { getAdminContent } from "@/lib/admin-content";
import { applyDraft, draftFromProvider, type DirectoryDraft } from "@/lib/directory-fields";
import { listStoredProviders, saveStoredProvider, type StoredProvider } from "@/lib/directory-store";
import { publishSubmittedPlace } from "@/lib/content-admin";

/**
 * Accepting a directory submission, as one press.
 *
 * The listing arrives as fields — the same fields the owner has in the admin —
 * so accepting can write it. Before this, accepting recorded a word and the
 * owner still had to open the admin, find the listing and retype the
 * paragraph, which is not accepting; it is doing the work twice.
 */

/**
 * The listing a suggestion is about, if it is about an existing one.
 *
 * A new submission carries the placeholder targetId "directory" and matches
 * nothing, which is correct — it becomes a new listing.
 */
export async function existingListingFor(targetId: string): Promise<StoredProvider | null> {
  if (!targetId || targetId === "directory") return null;
  const providers = await listStoredProviders();
  return providers.find((p) => p.id === targetId) ?? null;
}

/** What is published now, as a draft, so a review can show what would change. */
export async function currentDraftFor(targetId: string): Promise<DirectoryDraft> {
  const existing = await existingListingFor(targetId);
  return existing ? draftFromProvider(existing) : {};
}

export type ApplyResult = boolean | "missing" | "not-a-listing";

/**
 * Write the submitted listing.
 *
 * NEW LISTINGS ARE NOT PUBLISHED BY ACCEPTING. Accepting says the details are
 * right, which is not the same as deciding a business belongs in the
 * directory; those are two judgements and pressing one button should not make
 * both. It lands unpublished, in the admin, one tick from going live.
 *
 * An edit to a listing that is already published stays published — the
 * decision to list them was made before and is not being revisited.
 *
 * Consent travels with the submission: a business that filled in its own
 * listing and said its number may be published has given permission, and that
 * is recorded here with who gave it. Anything else leaves consent alone rather
 * than clearing what the owner may already have recorded by hand.
 */
export async function applyDirectorySuggestion(id: string): Promise<ApplyResult> {
  const { bundle } = await getAdminContent();
  const suggestion = bundle.suggestions.find((item) => item.id === id);
  if (!suggestion) return "missing";
  if (suggestion.targetType !== "directory" || !suggestion.draft) return "not-a-listing";

  const existing = await existingListingFor(suggestion.targetId);
  const merged = applyDraft(existing ?? {}, suggestion.draft) as Partial<StoredProvider> & { name?: string };

  const next: Partial<StoredProvider> & { name?: string } = {
    ...merged,
    id: existing?.id,
    // A new one arrives hidden; an existing one keeps whatever it was.
    published: existing ? existing.published !== false : false,
    ...(suggestion.contactConsent
      ? { contactConsent: true, contactConsentNote: suggestion.contactConsentNote }
      : existing
        ? { contactConsent: existing.contactConsent, contactConsentNote: existing.contactConsentNote }
        : {}),
  };

  const saved = await saveStoredProvider(next);
  return Boolean(saved);
}

export type PlaceApplyResult = boolean | "missing" | "not-a-place";

/**
 * Accepting a place a traveller sent in from their itinerary — publish it.
 *
 * Mirrors applyDirectorySuggestion but for the planner "send it in" path: the
 * submission carries a structured `place` rather than a directory `draft`, and
 * a stop/stay becomes a real thing-to-do / where-to-stay listing rather than a
 * service-provider entry. "not-a-place" tells the caller this suggestion is not
 * one of these, so it can fall through to the directory path.
 */
export async function applyPlaceSuggestion(id: string): Promise<PlaceApplyResult> {
  const { bundle } = await getAdminContent();
  const suggestion = bundle.suggestions.find((item) => item.id === id);
  if (!suggestion) return "missing";
  if (suggestion.targetType !== "new" || !suggestion.place) return "not-a-place";
  try {
    await publishSubmittedPlace(suggestion.place);
    return true;
  } catch (error) {
    console.error("[place-suggestion] could not publish", error);
    return false;
  }
}
