import Link from "next/link";
import AddEntryForms from "@/components/AddEntryForms";
import { isDbEnabled } from "@/lib/content-admin";
import { listInfoPages } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function AdminAddPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // Arrives from the "asked for, and not here" report — somebody searched for
  // this and the site had never heard of it. Carried into the name field so
  // the owner does not have to retype the word they just read.
  const wanted = (await searchParams).q?.trim().slice(0, 80) || "";
  const dbReady = isDbEnabled();
  let infoPages: Awaited<ReturnType<typeof listInfoPages>> = [];
  let needsSetup = false;
  if (dbReady) {
    try {
      infoPages = await listInfoPages();
    } catch {
      needsSetup = true;
    }
  }

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">Add</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              Add a cemetery, a tzadik, or a new page — save what you have now and fill in the rest later. Your additions are kept even when built-in content is re-imported.
            </p>
          </div>
        </div>
      </header>

      {wanted && (
        <p className="mt-6 border-l-4 border-[var(--gold)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-700">
          Somebody searched for <strong className="text-[var(--navy)]">{wanted}</strong> and this site showed them
          nothing. It is filled in below — change it to whatever the entry should really be called.
        </p>
      )}

      <section className="mt-8">
        {!dbReady ? (
          <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Not connected yet</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">Connect the content database (add <code className="rounded bg-[var(--cream)] px-1">DATABASE_URL</code> and run setup on the Destination editor) before adding new entries.</p>
          </div>
        ) : needsSetup ? (
          <div className="border border-[var(--gold)] bg-[#FAF8F3] p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">One-time setup needed</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">Run the database import once on the <Link href="/admin/destinations" className="underline">Destination editor</Link>, then come back here.</p>
          </div>
        ) : (
          <>
            <AddEntryForms prefillName={wanted || undefined} />

            {infoPages.length > 0 && (
              <div className="mt-10 border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Your info pages</p>
                <ul className="mt-4 divide-y divide-[var(--gold-light)]">
                  {infoPages.map((page) => (
                    <li key={page.slug} className="flex items-center justify-between gap-3 py-3">
                      <Link href={`/info/${page.slug}`} className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">{page.title}</Link>
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-stone-400">{page.status !== "PUBLISHED" ? page.status : `/info/${page.slug}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
