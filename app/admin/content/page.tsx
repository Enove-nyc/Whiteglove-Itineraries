import Link from "next/link";
import AdminContentManager from "@/components/AdminContentManager";
import { getCemetery } from "@/data/cemeteries";
import { destinationHref, getDestination } from "@/data/destinations";
import { getAdminContent, getMissingContentReport, type EditSuggestion } from "@/lib/admin-content";
import { draftFromProvider, type DirectoryDraft } from "@/lib/directory-fields";
import { listStoredProviders } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

type Missing = "" | "address" | "coordinates" | "shomer";

/**
 * The page each suggestion is about, where it can be worked out.
 *
 * A suggestion carries a target type and a slug, and until now nothing in the
 * admin turned that back into a page — you read "the address is wrong for
 * Lizhensk" and then went looking for Lizhensk. Only the suggestions actually
 * on screen are resolved, so this stays a handful of lookups rather than a map
 * of every record on the site.
 */
const SITE_PAGES: Record<string, string> = {
  "cemeteries-index": "/cemeteries",
  "kosher-stays-index": "/hotels",
  "attractions-index": "/things-to-do",
  "stops-directory": "/stops",
};

function publicPageFor(suggestion: EditSuggestion): string | undefined {
  if (suggestion.targetType === "site") return SITE_PAGES[suggestion.targetId];
  if (suggestion.targetType === "directory") return "/directory";
  if (suggestion.targetType !== "location") return undefined;
  const cemetery = getCemetery(suggestion.targetId);
  if (cemetery) return `/cemeteries/${cemetery.slug}`;
  const destination = getDestination(suggestion.targetId);
  return destination ? destinationHref(destination) : undefined;
}

function suggestionLinks(suggestions: EditSuggestion[]): Record<string, string> {
  const links: Record<string, string> = {};
  for (const suggestion of suggestions) {
    if (links[suggestion.targetId]) continue;
    const href = publicPageFor(suggestion);
    if (href) links[suggestion.targetId] = href;
  }
  return links;
}

export default async function AdminContentPage({ searchParams }: {
  searchParams: Promise<{ tab?: string; missing?: string }>;
}) {
  const { configured, bundle, readAt } = await getAdminContent();

  // What each listing under review says right now, so the review can show
  // which fields would change rather than only what was sent.
  const providers = await listStoredProviders();
  const currentListings: Record<string, DirectoryDraft> = {};
  const listingConsent: Record<string, boolean> = {};
  for (const suggestion of bundle.suggestions) {
    if (suggestion.targetType !== "directory" || currentListings[suggestion.targetId]) continue;
    const existing = providers.find((p) => p.id === suggestion.targetId);
    if (!existing) continue;
    currentListings[suggestion.targetId] = draftFromProvider(existing);
    listingConsent[suggestion.targetId] = Boolean(existing.contactConsent);
  }
  const report = getMissingContentReport(bundle);
  const query = await searchParams;
  // Which tab to open on, read on the server so the first paint is already
  // right. It used to be a #promotions hash, which a server never sees — the
  // page rendered one thing and the browser immediately replaced it.
  const initialTab =
    query.tab === "locations" || query.tab === "promotions" || query.tab === "accommodations" || query.tab === "suggestions"
      ? (query.tab as "locations" | "promotions" | "accommodations" | "suggestions")
      : undefined;
  const initialMissing = (["address", "coordinates", "shomer"].includes(query.missing ?? "") ? query.missing : "") as Missing;

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">Suggestions</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">Corrections people sent in.</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Missing addresses" value={report.locationsMissingAddress} href="?tab=locations&missing=address" />
          <Metric label="Missing coordinates" value={report.locationsMissingCoordinates} href="?tab=locations&missing=coordinates" />
          <Metric label="Missing shomer" value={report.locationsMissingShomer} href="?tab=locations&missing=shomer" />
          <Metric label="Missing accommodations" value={report.accommodationsMissing} href="?tab=accommodations" />
          {/* These two used to both open the locations list — pressing
              "pending suggestions" showed you locations. */}
          <Metric label="Waiting for review" value={report.pendingSuggestions} href="?tab=suggestions" />
        </div>
      </section>

      <AdminContentManager
        initialBundle={bundle}
        configured={configured}
        initialTab={initialTab}
        initialMissing={initialMissing}
        suggestionLinks={suggestionLinks(bundle.suggestions)}
        currentListings={currentListings}
        listingConsent={listingConsent}
        readAt={readAt}
      />
    </>
  );
}

// Each count opens the list of the records it counts. A number nobody can act
// on is a number that gets ignored.
function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="block border border-[var(--gold-light)] bg-[#FAF8F3] p-5 transition hover:border-[var(--gold)] hover:shadow-md">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">{value}</p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-400">Show them →</p>
    </Link>
  );
}
