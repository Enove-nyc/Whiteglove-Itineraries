import AdminNavLink from "@/components/AdminNavLink";
import { passwordStorageAvailable } from "@/lib/access-passwords";
import { teamStorageAvailable } from "@/lib/admin-roles";
import { membershipPublicLabel } from "@/lib/growth-settings";
import { readCollaborationSettings, readMembershipSettings } from "@/lib/growth-settings-store";
import { publicReferralStatus } from "@/lib/referral";
import { readReferralSettings } from "@/lib/referral-store";
import { getDashboardStats } from "@/lib/site-analytics";

export const dynamic = "force-dynamic";

// Settings is a menu, not a wall. Each card says what it is for in the words
// the owner would use, and how it stands right now, so you can tell at a glance
// whether anything needs doing without opening every one.

function Card({ href, title, detail, state }: { href: string; title: string; detail: string; state?: string }) {
  return (
    <AdminNavLink
      href={href}
      className="group flex flex-col border border-[var(--gold-light)] bg-[#FAF8F3] p-6 transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]"
    >
      <span className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{title}</span>
      <span className="mt-2 text-sm leading-6 text-stone-600">{detail}</span>
      {state && <span className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{state}</span>}
    </AdminNavLink>
  );
}

export default async function AdminSettingsPage() {
  const [stats, referral, collaboration, membership] = await Promise.all([
    getDashboardStats(),
    readReferralSettings(),
    readCollaborationSettings(),
    readMembershipSettings(),
  ]);
  const referralStatus = publicReferralStatus(referral);

  return (
    <>
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Settings</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Access, money, and the services the site depends on.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">The website itself</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            href="/admin/settings/words"
            title="Words"
            detail="Headline, contact line and footer."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/about"
            title="About"
            detail="Optional fields. Blank stays hidden."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/proof"
            title="Case studies"
            detail="Trip outcomes with permission."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/limits"
            title="Limits"
            detail="Trip and print limits."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/plans"
            title="Paid plans"
            detail="Whether they are offered, and how."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/earnings"
            title="Earnings"
            detail="Partners, extras and destination placements."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/travel"
            title="Travel providers"
            detail="Who supplies flights, hotels and cars — and who sees them."
          />
          {/* The cards live inside "What the site earns" — see lib/admin-nav.ts.
              Pointed straight at the section rather than at the old address,
              which only redirects there. */}
          <Card
            href="/admin/settings/earnings#travel-essentials"
            title="Travel Essentials"
            detail="Insurance, eSIM, transfers and tours."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/travel-gear"
            title="Travel gear"
            detail="The Amazon shelf."
            state={stats.configured ? undefined : "Needs the private store"}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Growth programmes</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
          Off until you turn them on.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            href="/admin/alerts"
            title="Alerts"
            detail="Destination and seasonal signups."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/growth"
            title="Growth"
            detail="Searches, empty results and clicks."
            state={stats.configured ? "Open the dashboard" : "Needs the private store"}
          />
          <Card
            href="/admin/settings/referral"
            title="Referrals"
            detail="Off until reward rules are final."
            state={referralStatus.open ? "On for visitors" : "Disabled by default"}
          />
          <Card
            href="/admin/settings/collaboration"
            title="Collaboration"
            detail="Voting, favorites and rooms."
            state={
              collaboration.votingEnabled || collaboration.sharedFavoritesEnabled || collaboration.roomGroupsEnabled
                ? "Tools available"
                : "All tools off"
            }
          />
          <Card
            href="/admin/settings/membership"
            title="White Glove Plus"
            detail="Planned only. Not sold."
            state={membershipPublicLabel(membership)}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Access</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            href="/admin/settings/website"
            title="Website access"
            detail="Open the website to everyone, close it, or close only certain parts."
            state={stats.siteLocked ? "Closed to the public" : "Open to everyone"}
          />
          <Card
            href="/admin/team"
            title="Team"
            detail="Who else can get in."
            state={teamStorageAvailable() ? undefined : "Needs the private store"}
          />
          <Card
            href="/admin/settings/passwords"
            title="Passwords"
            detail="Change the code for the admin area and the code visitors use when the site is closed."
            state={passwordStorageAvailable() ? undefined : "Set in the host for now"}
          />
          <Card
            href="/admin/settings/security"
            title="Security policy"
            detail="The rule that says which outside services a page may load — maps, the booking search, the card form. Enforcing, and reporting anything it blocks."
            state="On"
          />
          <Card
            href="/admin/settings/trello"
            title="Trello"
            detail="Pictures, listings and reports."
            state={stats.configured ? undefined : "Needs the private store"}
          />
          <Card href="/admin/accounts" title="Accounts" detail="People who signed up." />
          <Card href="/admin/messages" title="Messages" detail="What people wrote from the site." />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">The business</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card href="/admin/finances" title="Finances" detail="Money in and out, and what each trip cost." />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--navy)]">Advanced</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
          Email, maps and the assistant.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            href="/admin/settings/connections"
            title="Connections"
            detail="Whether email, driving times and the travel assistant are actually working."
            state={stats.configured ? undefined : "Private store not connected"}
          />
          <Card
            href="/admin/duffel"
            title="Duffel"
            detail="Search and book flights in the admin. Not on the public site."
          />
          <Card
            href="/admin/flight-itineraries"
            title="Flight itineraries"
            detail="Write up flights you sell privately as one page to send a customer."
          />
        </div>
      </section>
    </>
  );
}
