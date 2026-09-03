import Link from "next/link";
import AdminReferralForm from "@/components/AdminReferralForm";
import { publicReferralStatus } from "@/lib/referral";
import { listAttributions, readReferralSettings, referralStoreAvailable } from "@/lib/referral-store";

export const dynamic = "force-dynamic";

const card = "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-5 sm:p-6";

export default async function ReferralSettingsPage() {
  const storeReady = referralStoreAvailable();
  const settings = await readReferralSettings();
  const status = publicReferralStatus(settings);
  const attributions = settings.enabled ? await listAttributions(50) : [];

  return (
    <div className="pb-12">
      <header>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Growth</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Referrals</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Friend invites with unique codes and attribution. Stays off until you enable it and write real reward
              rules. Do not invent amounts here.
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
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Visitor-facing status</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">{status.headline}</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">{status.body}</p>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
          {settings.enabled ? "Enabled — live for visitors who open the status page" : "Disabled by default"}
        </p>
      </section>

      <section className={`${card} mt-8`}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Settings</h2>
        <AdminReferralForm current={settings} storeReady={storeReady} />
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Attribution log</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Shown only when the programme is on. Self-referrals are recorded as blocked. No reward amounts are calculated.
        </p>
        {!settings.enabled ? (
          <p className={`${card} mt-3 text-sm text-stone-600`}>Turn the programme on to collect attributions.</p>
        ) : attributions.length === 0 ? (
          <p className={`${card} mt-3 text-sm text-stone-600`}>No attributions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attributions.map((row, i) => (
              <li key={`${row.at}-${i}`} className={`${card} text-sm text-stone-600`}>
                <span className="font-semibold text-[var(--navy)]">{row.code}</span>
                {" → "}
                {row.referred}
                {" · "}
                {row.status}
                {row.blockReason ? ` (${row.blockReason})` : ""}
                <span className="block text-xs text-stone-400">{row.at}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
