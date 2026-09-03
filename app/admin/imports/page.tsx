import Link from "next/link";
import ContentImportReview from "@/components/ContentImportReview";
import { getContentImportDashboard } from "@/lib/content-imports";

export const dynamic = "force-dynamic";

export default async function AdminImportsPage() {
  const dashboard = await getContentImportDashboard();

  return (
    <>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin · directory</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">Bulk imports</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">
          Bring source-backed candidates into a private queue, review each one, then publish individual listings only when their public details are complete.
        </p>
        <Link
          href="/admin/imports/trello"
          className="mt-5 inline-flex min-h-11 items-center border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
        >
          Open editorial Trello workflow
        </Link>
        <Link
          href="/admin/imports/needs-review"
          className="mt-5 ml-3 inline-flex min-h-11 items-center border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
        >
          Needs review queue
        </Link>
      </header>

      {!dashboard.configured && (
        <section className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Database not connected</p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            The source package below is ready for review but is not public and has not been staged. Add <code className="rounded bg-[var(--cream)] px-1">DATABASE_URL</code>, then run the one-time setup on the <Link href="/admin/destinations" className="font-semibold underline decoration-[var(--gold)] underline-offset-4">Destination editor</Link>.
          </p>
        </section>
      )}

      {dashboard.configured && !dashboard.databaseReady && (
        <section className="mt-8 border border-[var(--gold)] bg-[#FAF8F3] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Database setup needed</p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            A database connection was found, but the import tables are not available yet. Run the one-time setup on the <Link href="/admin/destinations" className="font-semibold underline decoration-[var(--gold)] underline-offset-4">Destination editor</Link>, then return here to stage the source package.
          </p>
        </section>
      )}

      <ContentImportReview dashboard={dashboard} />
    </>
  );
}
