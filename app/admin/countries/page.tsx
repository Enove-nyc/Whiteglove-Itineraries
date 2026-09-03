import Link from "next/link";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

/**
 * Countries are counted on the dashboard, but there is no country editor yet.
 *
 * The count on Home is derived from destinations and batei hachaim — there is
 * no separate countries table to maintain. This screen exists so the dashboard
 * tile has somewhere honest to land, rather than looking clickable and going
 * nowhere, or inventing a fake list of countries to manage.
 */
export default function AdminCountriesPage() {
  return (
    <div className="pb-12">
      <header>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Directory</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Countries</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              There is no countries editor yet. The number on the dashboard counts distinct countries that already
              appear on destinations and batei hachaim — nothing separate is stored or invented here.
            </p>
          </div>
          <Link
            href="/admin"
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <section className={`${card} mt-7`}>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Current status</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Not set up yet</p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          To change which country a place belongs to, edit that town or beis hachaim. A dedicated countries screen
          can wait until there is something real to manage beyond those fields.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/destinations"
            className="inline-flex min-h-11 items-center border border-[var(--navy)] bg-[var(--navy)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)]"
          >
            Towns
          </Link>
          <Link
            href="/admin/kevarim"
            className="inline-flex min-h-11 items-center border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--navy)]"
          >
            Kevarim
          </Link>
          <Link
            href="/admin/directory"
            className="inline-flex min-h-11 items-center border border-[var(--gold-light)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:border-[var(--gold)]"
          >
            Directory
          </Link>
        </div>
      </section>
    </div>
  );
}
