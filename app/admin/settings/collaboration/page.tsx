import Link from "next/link";
import AdminCollaborationForm from "@/components/AdminCollaborationForm";
import { growthSettingsStoreAvailable, readCollaborationSettings } from "@/lib/growth-settings-store";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

export default async function CollaborationSettingsPage() {
  const storeReady = growthSettingsStoreAvailable();
  const settings = await readCollaborationSettings();

  return (
    <div className="pb-12">
      <header>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Itinerary planner</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Collaboration</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Voting, shared favorites and room groupings for families planning together. Private trip contents are not
              listed here — only whether each tool is available.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]"
          >
            Settings
          </Link>
        </div>
      </header>

      <section className={`${card} mt-7`}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Feature switches</h2>
        <AdminCollaborationForm current={settings} storeReady={storeReady} />
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">Privacy</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Shared trips stay with the account that owns them. Admins are not given a browse-all-trips screen. If someone
          reports abuse of a share link, handle it through Contact / visitor accounts the same way as today.
        </p>
      </section>
    </div>
  );
}
