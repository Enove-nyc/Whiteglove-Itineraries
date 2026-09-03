import Link from "next/link";
import AdminAccountsTable from "@/components/AdminAccountsTable";
import PlanRequests from "@/components/PlanRequests";
import { listPlanRequests } from "@/lib/account-plan-store";
import { hasAccountStorage, listAllAccounts } from "@/lib/account-store";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  const available = hasAccountStorage();
  const [accounts, requests] = available
    ? await Promise.all([listAllAccounts(), listPlanRequests()])
    : [[], []];
  const verified = accounts.filter((a) => a.verifiedAt).length;
  // Read once on the server, so "3 days ago" is worked out in one place and no
  // component reaches for a clock while it renders.
  const now = new Date().toISOString();

  return (
    <>
      <header>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove admin</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-tight text-[var(--navy)]">Accounts</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">Everyone who has registered on the site. Passwords are stored only in a hashed form and are never shown here.</p>
          </div>
          <Link href="/admin" className="border border-[var(--gold)] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Dashboard</Link>
        </div>
      </header>

      <section className="mt-8">
        {!available ? (
          <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-8">
            <p className="text-sm leading-7 text-stone-600">The private account store isn&apos;t connected, so there are no accounts to show yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-6 border border-[var(--gold-light)] bg-[var(--cream-deep)] p-5">
              <div><p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{accounts.length}</p><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Total accounts</p></div>
              <div><p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{verified}</p><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Email-verified</p></div>
              <div><p className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{accounts.filter((a) => a.hasItinerary).length}</p><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Building an itinerary</p></div>
            </div>

            {accounts.length === 0 ? (
              <div className="border border-dashed border-[var(--gold-light)] p-10 text-center">
                <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">No accounts yet.</p>
                <p className="mt-2 text-sm text-stone-600">Registered travelers will appear here.</p>
              </div>
            ) : (
              <AdminAccountsTable accounts={accounts} />
            )}
            <p className="mt-4 text-xs leading-5 text-stone-400">
              This list is private to the owner. Only handle travelers&apos; details in line with your privacy policy — they entrusted their name, email, and phone to book with you.
            </p>
            <PlanRequests requests={requests} now={now} />
          </>
        )}
      </section>
    </>
  );
}
