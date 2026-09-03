"use client";

import { useMemo, useState } from "react";
import { responseNote, verifiedLabel } from "@/lib/provider-contact";
// From the data file, not the read layer: this runs in the browser, and
// lib/directory.ts reaches for Prisma and Redis.
import { PROVIDER_CATEGORY_LABELS, PROVIDER_CATEGORY_ORDER, type ProviderCat, type PublicProvider } from "@/data/directory";

const telHref = (value: string) => `tel:${value.replace(/[^+\d]/g, "")}`;
const waHref = (value: string) => `https://wa.me/${value.replace(/[^\d]/g, "")}`;

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block border border-[var(--gold-light)] bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-600">{children}</span>;
}

export default function DirectoryBrowser({
  providers,
  featuredNote,
}: {
  providers: PublicProvider[];
  /**
   * What "Featured" means here. Always present — the default makes no claim
   * about payment either way, so the badge never appears unexplained. See
   * lib/features.ts.
   */
  featuredNote: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCat | "ALL">("ALL");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("");
  const [specialty, setSpecialty] = useState("");

  // Regions, languages and specialties were on every record and shown on
  // none of them — you could not find "somebody in Ukraine who speaks
  // Yiddish", which is the question the directory exists to answer.
  const options = useMemo(() => {
    const collect = (pick: (p: PublicProvider) => string[]) =>
      [...new Set(providers.flatMap(pick).map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      regions: collect((p) => p.regions),
      languages: collect((p) => p.languages),
      specialties: collect((p) => p.specialties),
    };
  }, [providers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (category !== "ALL" && p.category !== category) return false;
      if (region && !p.regions.includes(region)) return false;
      if (language && !p.languages.includes(language)) return false;
      if (specialty && !p.specialties.includes(specialty)) return false;
      if (!q) return true;
      const haystack = [p.name, p.tagline, p.description, p.basedIn, ...p.regions, ...p.specialties, ...p.languages]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [providers, query, category, region, language, specialty]);

  const tabs: Array<{ key: ProviderCat | "ALL"; label: string }> = [
    { key: "ALL", label: "All" },
    ...PROVIDER_CATEGORY_ORDER.map((key) => ({ key, label: PROVIDER_CATEGORY_LABELS[key].english })),
  ];

  return (
    <div>
      <div className="flex flex-col gap-4">
        <input
          type="search"
          aria-label="Search the provider directory"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, region, or specialty (e.g. Uman, Poland, honeymoon)…"
          className="w-full rounded-md border border-[var(--gold-light)] bg-white px-4 py-3 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]"
        />
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = category === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategory(tab.key)}
                className={`min-h-11 border px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition ${
                  active ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold-light)] text-[var(--navy)] hover:bg-[var(--cream-deep)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Only offered when there is something to choose between — a select
          with one option in it is furniture, not a filter. */}
      {(options.regions.length > 1 || options.languages.length > 1 || options.specialties.length > 1) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {options.regions.length > 1 && (
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
              Works in
              <select value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1.5 block min-h-11 w-full min-w-48 rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--navy)]">
                <option value="">Anywhere</option>
                {options.regions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
          {options.languages.length > 1 && (
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
              Speaks
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1.5 block min-h-11 w-full min-w-48 rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--navy)]">
                <option value="">Any language</option>
                {options.languages.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
          {options.specialties.length > 1 && (
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
              Specialises in
              <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="mt-1.5 block min-h-11 w-full min-w-48 rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--navy)]">
                <option value="">Anything</option>
                {options.specialties.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500" role="status">{filtered.length === providers.length ? "All providers" : "Filtered providers"}</p>
        {(region || language || specialty || category !== "ALL" || query) && (
          <button
            type="button"
            onClick={() => { setQuery(""); setCategory("ALL"); setRegion(""); setLanguage(""); setSpecialty(""); }}
            className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Said once, plainly, above the listings — not buried in a tooltip on
          one badge. */}
      {providers.some((p) => p.featured) && (
        <p className="mt-3 rounded-md border-l-4 border-[var(--gold)] bg-[var(--cream)] px-3 py-2 text-xs leading-5 text-stone-600">
          <strong className="text-[var(--navy)]">About ★ Featured:</strong> {featuredNote}
        </p>
      )}

      <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <article key={p.slug} className="wg-card flex flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{PROVIDER_CATEGORY_LABELS[p.category].english}</p>
              {p.featured && (
                <span title={featuredNote} className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">★ Featured</span>
              )}
            </div>
            {/* h2, not h3: the page's only heading above this is its h1, and
                a jump from h1 to h3 reads to a screen reader as a section that
                is missing rather than a size choice. */}
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{p.name}</h2>
            {p.tagline && <p className="mt-1 text-sm font-semibold text-stone-500">{p.tagline}</p>}
            {p.description && <p className="mt-3 text-sm leading-6 text-stone-600">{p.description}</p>}

            {(p.basedIn || p.regions.length > 0) && (
              <p className="mt-3 text-xs text-stone-500">
                {p.basedIn && <>Based in {p.basedIn}. </>}
                {p.regions.length > 0 && <>Serves: {p.regions.join(", ")}.</>}
              </p>
            )}

            {p.languages.length > 0 && (
              <p className="mt-2 text-xs text-stone-500">Speaks: {p.languages.join(", ")}.</p>
            )}

            {p.specialties.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.specialties.map((s) => <Tag key={s}>{s}</Tag>)}
              </div>
            )}

            {/* Only ever a positive claim, and only with a date behind it.
                An unchecked listing gets nothing rather than "unverified":
                this is somebody else's business, and stamping a judgement on
                a public page is a different act from marking our own content
                unfinished. The blanket line at the foot of the page covers
                the rest. */}
            {verifiedLabel(p.verifiedAt) && (
              <p className="mt-3 text-xs font-semibold text-[var(--navy)]">
                <span aria-hidden="true">✓</span> {verifiedLabel(p.verifiedAt)}
              </p>
            )}
            {responseNote(p.responseTime) && (
              <p className="mt-1 text-xs text-stone-500">Says they answer: {responseNote(p.responseTime)}</p>
            )}

            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              {p.phone && <a href={telHref(p.phone)} className="inline-flex min-h-11 items-center border border-[var(--gold)] px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Call</a>}
              {p.whatsapp && <a href={waHref(p.whatsapp)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center border border-[var(--gold-light)] px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">WhatsApp</a>}
              {p.email && <a href={`mailto:${p.email}`} className="inline-flex min-h-11 items-center border border-[var(--gold-light)] px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Email</a>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center border border-[var(--gold-light)] px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white">Website ↗</a>}
            </div>

            {/* Said, rather than silently leaving the card without a Call
                button. Somebody who can see there is a number and cannot see
                the number knows to use another way; somebody shown nothing
                assumes there is nothing. */}
            {p.contactWithheld && (
              <p className="mt-3 text-xs leading-5 text-stone-500">
                We hold a phone number for them but have not been given permission to publish it.
                {p.email || p.website ? " Reach them by the buttons above." : " Ask us and we will pass a message on."}
              </p>
            )}

            {/* A phone number that has stopped working is worse than no
                number — somebody stands at a kever ringing it. The form is
                the same one the owner has in the admin and opens on what is
                published, so a correction arrives as fields and accepting it
                is one press. */}
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-6 border border-dashed border-[var(--gold-light)] p-10 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">No providers match your search.</p>
          <p className="mt-2 text-sm text-stone-600">Try a different word, or clear the filter.</p>
        </div>
      )}
    </div>
  );
}
