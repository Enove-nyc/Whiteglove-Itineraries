import Link from "next/link";
import { cookies } from "next/headers";
import Footer from "@/components/Footer";
import LockedToolCard from "@/components/LockedToolCard";
import Navbar from "@/components/Navbar";
import { advisorPlacesFor } from "@/components/AccountMenu";
import { requireSignedIn } from "@/lib/require-signed-in";
import { accountCookieName, getAccountData, getCurrentAccountData, withTrips } from "@/lib/account-store";
import { getPlan } from "@/lib/account-plan-store";
import { mayServeCompanionClients, mayViewPipelineAnalytics } from "@/lib/account-limits";
import { readChat, readMarkers } from "@/lib/companion-chat-store";
import { needsAttention, pipelineStats, tripStage, TRIP_STAGE_LABEL } from "@/data/trip-pipeline";
import { collectedCents, formatCents, hasBalance, outstandingCents } from "@/data/trip-payments";
import { pageMetadata } from "@/lib/seo";
import { currentBrand } from "@/lib/site-brand";

// The advisor's home — the screen the advisor app opens on. A cockpit: the
// business at a glance (what's owed, who's waiting, what's leaving soon) over
// one press through to every tool. Everything here is read from what already
// exists — each trip's balance, proposal status and chat read-marker — the
// same three the pipeline board reads, so nothing new has to be kept in sync.
export async function generateMetadata() {
  const itineraries = (await currentBrand()) === "itineraries";
  return pageMetadata({
    title: itineraries ? "Advisor dashboard — White Glove Itineraries" : "Advisor dashboard — White Glove Kosher Travel",
    description: "Your trips, clients and money at a glance.",
    path: "/advisor",
    noIndex: true,
  });
}

export const dynamic = "force-dynamic";

function money(pairs: Array<[string, number]>): string {
  if (pairs.length === 0) return "—";
  return pairs.map(([currency, cents]) => formatCents(cents, currency)).join("  ·  ");
}

export default async function AdvisorDashboardPage() {
  await requireSignedIn("/advisor");
  const cookie = (await cookies()).get(accountCookieName())?.value;
  const account = await getCurrentAccountData(cookie);
  const plan = account ? await getPlan(account.email) : "free";
  const allowed = mayServeCompanionClients(plan);

  if (!account?.email || !allowed) {
    return (
      <main className="min-h-screen bg-[var(--cream)]">
        <Navbar minimal />
        <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Advisor</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
            Advisor dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Your trips, clients and money in one place — with everything one press away.
          </p>
          <LockedToolCard
            toolLabel="The advisor dashboard"
            plan={plan}
            bullets={[
              "See what every client still owes, and who's waiting on you.",
              "Jump straight to the pipeline, proposals, payments and your client forms.",
              "Built for a phone — run your trips on the go.",
            ]}
          />
        </section>
        <Footer />
      </main>
    );
  }

  const showAnalytics = mayViewPipelineAnalytics(plan);
  const data = await getAccountData(account.email);
  const { trips } = withTrips(data);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await Promise.all(
    trips.map(async (t) => {
      let unread = false;
      if (t.shareId) {
        const [messages, markers] = await Promise.all([readChat(t.shareId), readMarkers(t.shareId)]);
        const last = messages[messages.length - 1];
        unread = Boolean(last && last.from === "client" && (!markers.advisor || last.at > markers.advisor));
      }
      const stage = tripStage(
        { pipelineStage: t.pipelineStage, proposal: t.proposal, startDate: t.itinerary?.startDate, endDate: t.itinerary?.endDate },
        today,
      );
      const bal = t.balance && hasBalance(t.balance) ? t.balance : null;
      return {
        id: t.id,
        name: t.name,
        client: (t.client ?? "").trim(),
        startDate: t.itinerary?.startDate ?? "",
        stage,
        unread,
        attention: needsAttention(t.proposal),
        outstandingCents: bal ? outstandingCents(bal) : 0,
        collectedCents: bal ? collectedCents(bal) : 0,
        currency: bal?.currency ?? "USD",
        commissionCents: t.commissionCents,
        commissionCurrency: t.commissionCurrency ?? "USD",
      };
    }),
  );

  const stats = pipelineStats(
    rows.map((r) => ({
      stage: r.stage,
      startDate: r.startDate,
      outstandingCents: r.outstandingCents || undefined,
      currency: r.currency,
      commissionCents: showAnalytics ? r.commissionCents : undefined,
      commissionCurrency: r.commissionCurrency,
    })),
    today,
  );

  const collectedByCurrency = new Map<string, number>();
  for (const r of rows) {
    if (r.collectedCents > 0) collectedByCurrency.set(r.currency, (collectedByCurrency.get(r.currency) ?? 0) + r.collectedCents);
  }
  const unreadCount = rows.filter((r) => r.unread).length;
  const attentionCount = rows.filter((r) => r.attention || r.unread).length;
  const upcoming = rows.filter((r) => r.startDate && r.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const nextDep = upcoming[0] ?? null;
  const noTrips = trips.length === 0;

  // The tools grid — reuse the same gated list the account menu shows, minus a
  // link back to this page, plus the planner as the way to start a new trip.
  const places = advisorPlacesFor(plan).filter((p) => p.href !== "/advisor");

  const firstName = (account.record.name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <main className="min-h-screen bg-[var(--cream)]">
      <Navbar minimal />
      <section className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--gold-ink)]">Advisor</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
          {firstName ? `Welcome back, ${firstName}` : "Your dashboard"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Your business at a glance. Tap any card to open it.
        </p>

        {/* Quick actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/itinerary"
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            New trip
          </Link>
          <Link
            href="/pipeline"
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold)] px-5 text-sm font-semibold text-[var(--navy)] transition hover:bg-white"
          >
            Open pipeline
          </Link>
        </div>

        {noTrips ? (
          <div className="mt-8 rounded-2xl border border-[var(--gold-light)] bg-white p-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Start your first trip</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Build an itinerary in the planner, then send it to your client as their own app. Your dashboard fills in as
              you go — what&apos;s owed, who&apos;s waiting, what&apos;s leaving soon.
            </p>
            <Link
              href="/itinerary"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Open the planner
            </Link>
          </div>
        ) : (
          <>
            {/* Headline numbers */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DashTile href="/payments" label="Owed to you" value={money(stats.outstandingByCurrency)} tone={stats.outstandingByCurrency.length ? "gold" : "calm"} />
              <DashTile href="/pipeline" label="Needs you" value={String(attentionCount)} sub={attentionCount ? "waiting on a reply" : "all caught up"} tone={attentionCount ? "gold" : "calm"} />
              <DashTile href="/pipeline" label="Active trips" value={String(stats.activeCount)} sub={nextDep ? `next ${nextDep.startDate}` : undefined} tone="calm" />
              <DashTile href="/pipeline" label="Unread" value={String(unreadCount)} sub={unreadCount ? "client messages" : "no new messages"} tone={unreadCount ? "gold" : "calm"} />
            </div>

            {(collectedByCurrency.size > 0 || (showAnalytics && stats.commissionByCurrency.length > 0)) && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {collectedByCurrency.size > 0 && (
                  <DashTile href="/payments" label="Collected" value={money([...collectedByCurrency.entries()])} tone="calm" wide />
                )}
                {showAnalytics && stats.commissionByCurrency.length > 0 && (
                  <DashTile href="/pipeline" label="Your earnings recorded" value={money(stats.commissionByCurrency)} tone="calm" wide />
                )}
              </div>
            )}

            {/* Departing soon */}
            {nextDep && (
              <div className="mt-3 rounded-2xl border border-[var(--gold-light)] bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Next departure</p>
                <p className="mt-1 text-sm text-stone-700">
                  <span className="font-semibold text-[var(--navy)]">{nextDep.name || nextDep.client || "Trip"}</span>
                  {nextDep.client ? ` — ${nextDep.client}` : ""} · {TRIP_STAGE_LABEL[nextDep.stage]} · leaves {nextDep.startDate}
                </p>
              </div>
            )}
          </>
        )}

        {/* Every tool, one press away */}
        <h2 className="mt-10 font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Your tools</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {places.map((place) => (
            <Link
              key={place.href}
              href={place.href}
              className="flex min-h-[64px] items-center rounded-2xl border border-[var(--gold-light)] bg-white px-5 py-4 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--gold)] hover:shadow-sm"
            >
              {place.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="flex min-h-[64px] items-center rounded-2xl border border-[var(--gold-light)] bg-white px-5 py-4 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--gold)] hover:shadow-sm"
          >
            Account &amp; plan
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function DashTile({
  href,
  label,
  value,
  sub,
  tone,
  wide,
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
  tone: "gold" | "calm";
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col justify-between rounded-2xl border bg-white p-5 transition hover:shadow-sm ${
        tone === "gold" ? "border-[var(--gold)]" : "border-[var(--gold-light)]"
      } ${wide ? "" : "min-h-[104px]"}`}
    >
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{label}</span>
      <span className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{value}</span>
      {sub ? <span className="mt-1 text-xs text-stone-500">{sub}</span> : null}
    </Link>
  );
}
