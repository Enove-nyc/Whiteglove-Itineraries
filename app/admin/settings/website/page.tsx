import Link from "next/link";
import AccessLog from "@/components/AccessLog";
import BetaNoticeControl from "@/components/BetaNoticeControl";
import LockedSectionsControl from "@/components/LockedSectionsControl";
import SiteLockControl from "@/components/SiteLockControl";
import { betaStoreAvailable, getBetaNoticeFresh } from "@/lib/beta-notice-store";
import { getDashboardStats, getLockedPaths } from "@/lib/site-analytics";
import { readSignIns, signInLogAvailable } from "@/lib/signin-log";

export const dynamic = "force-dynamic";

export default async function WebsiteAccessSettings() {
  const [stats, lockedPaths, signIns, betaNotice] = await Promise.all([
    getDashboardStats(),
    getLockedPaths(),
    readSignIns(100),
    // Uncached: this screen has to show what was saved a second ago.
    getBetaNoticeFresh(),
  ]);

  return (
    <>
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Website access</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Close the whole website while you are working on it, or close just a few parts. There are three ways in, and
          you choose which one each person gets.
        </p>
      </header>

      <div className="mt-8 space-y-5">
        <SiteLockControl initialLocked={stats.siteLocked} configured={stats.configured} />
        <LockedSectionsControl initialPaths={lockedPaths} available={stats.configured} />
        <BetaNoticeControl notice={betaNotice} storeReady={betaStoreAvailable()} />

        <section className="border border-[var(--gold-light)] bg-[#FAF8F3] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-[var(--gold-ink)]">Three ways in</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Who can see it while it is closed</h2>
          <dl className="mt-5 space-y-4 text-sm leading-6">
            <div>
              <dt className="font-semibold text-[var(--navy)]">The full code</dt>
              <dd className="text-stone-600">
                They type it once and stay in. For people who should keep coming back.{" "}
                <Link href="/admin/settings/passwords" className="underline decoration-[var(--gold)] underline-offset-2">
                  Change it
                </Link>
                .
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--navy)]">The five-minute code</dt>
              <dd className="text-stone-600">
                For handing to somebody who needs to check one thing. It stops working five minutes after they use it —
                enforced here, not left to their browser, so it cannot be kept.{" "}
                <Link href="/admin/settings/passwords" className="underline decoration-[var(--gold)] underline-offset-2">
                  Change it
                </Link>
                .
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--navy)]">By name, with no code at all</dt>
              <dd className="text-stone-600">
                Add somebody on{" "}
                <Link href="/admin/team" className="underline decoration-[var(--gold)] underline-offset-2">
                  Team
                </Link>{" "}
                and they get in by signing in to their own account. Nothing shared, and you can take it back from the
                same screen without changing anybody else&apos;s code.
              </dd>
            </div>
          </dl>
        </section>

        <AccessLog entries={signIns} available={signInLogAvailable()} />
      </div>
    </>
  );
}
