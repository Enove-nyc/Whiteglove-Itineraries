import Link from "next/link";
import AdminMembershipForm from "@/components/AdminMembershipForm";
import { membershipPublicLabel } from "@/lib/growth-settings";
import { growthSettingsStoreAvailable, readMembershipSettings } from "@/lib/growth-settings-store";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

export default async function MembershipSettingsPage() {
  const storeReady = growthSettingsStoreAvailable();
  const settings = await readMembershipSettings();

  return (
    <div className="pb-12">
      <header>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Planned product</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">White Glove Plus</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Foundation stub only. Nothing is priced, advertised or sold until you approve a real launch. The free site
              — itinerary planner, recommendations, kosher food finder, booking search — stays useful either way.
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
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Current status</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">
          {membershipPublicLabel(settings)}
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          There is no checkout, no membership paywall and no public Plus page. Account plans (Traveler / Pro / Business)
          remain the existing interest-only tiers — separate from this stub.
        </p>
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Owner notes</h2>
        <AdminMembershipForm current={settings} storeReady={storeReady} />
      </section>
    </div>
  );
}
