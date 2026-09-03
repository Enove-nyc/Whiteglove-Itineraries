import AdminNavLink from "@/components/AdminNavLink";
import AdminSignOut from "@/components/AdminSignOut";
import { getAdminContent } from "@/lib/admin-content";
import { currentAdmin } from "@/lib/admin-current";
import { getEditableInventory } from "@/lib/admin-inventory";
import { ADMIN_QUICK_ADD, ADMIN_SECTIONS } from "@/lib/admin-nav";
import { canOpen, describeAreas } from "@/lib/admin-permissions";
import { ADMIN_TOTAL_CARDS, contentTotals } from "@/lib/admin-overview";
import { adsNeedingAttention } from "@/lib/ad-performance";
import { describeAdmin } from "@/lib/admin-session";
import { countPendingSubmissions } from "@/lib/content-admin";
import { messagesAlert } from "@/lib/contact-messages";
import { listContactMessages } from "@/lib/contact-store";
import { listPagesForAdmin } from "@/lib/pages";
import { listPlanRequests } from "@/lib/account-plan-store";
import { getImportReviewQueue } from "@/lib/import-review-queue";
import { listExperienceRatings } from "@/lib/experience-ratings-store";
import { listReportedPlaceReviews } from "@/lib/place-review-store";
import { getDashboardStats } from "@/lib/site-analytics";

export const dynamic = "force-dynamic";

const cardClass =
  "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] shadow-[0_1px_2px_rgba(16, 47, 53,.04)]";

function QuickAction({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <AdminNavLink
      href={href}
      className={`${cardClass} group flex min-h-44 flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-[var(--gold)] hover:shadow-[0_10px_28px_rgba(16, 47, 53,.09)]`}
    >
      <span>
        <span className="block font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">
          {title}
        </span>
        <span className="mt-2 block text-sm leading-6 text-stone-600">{detail}</span>
      </span>
      <span className="mt-5 text-sm font-semibold text-[var(--navy)]">Open <span aria-hidden="true">→</span></span>
    </AdminNavLink>
  );
}

function WorkPanel({
  title,
  children,
  href,
  hrefLabel,
}: {
  title: string;
  children: React.ReactNode;
  href: string;
  hrefLabel: string;
}) {
  return (
    <section className={`${cardClass} flex h-full flex-col p-5`}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--navy)]">{title}</h3>
      </div>
      <div className="mt-3 flex-1 text-sm leading-6 text-stone-600">{children}</div>
      <AdminNavLink href={href} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
        {hrefLabel} <span aria-hidden="true">→</span>
      </AdminNavLink>
    </section>
  );
}

const totalCardClass =
  "rounded-xl border border-[var(--gold-light)] bg-[#FAF8F3] p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2";

function TotalCard({
  label,
  value,
  href,
}: {
  label: string;
  value?: number;
  href: string | null;
}) {
  const body = (
    <>
      <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{label}</span>
      {value !== undefined && (
        <span className="mt-1 block font-[family-name:var(--font-display)] text-3xl tabular-nums text-[var(--navy)]">{value}</span>
      )}
    </>
  );

  if (!href) {
    return (
      <li className="min-w-0">
        <div className={`${totalCardClass} w-full min-w-0`} aria-disabled="true">
          {body}
        </div>
      </li>
    );
  }

  return (
    <li className="min-w-0">
      {/* flex-col opts out of .wg-admin a[class*="border"] { inline-flex }, which
          otherwise lays the label beside the count and spills into the next tile. */}
      <AdminNavLink
        href={href}
        className={`${totalCardClass} flex w-full min-w-0 flex-col hover:-translate-y-0.5 hover:border-[var(--gold)] hover:shadow-[0_8px_22px_rgba(16, 47, 53,.08)]`}
        aria-label={`${label}: ${value}. Open ${label.toLowerCase()}.`}
      >
        {body}
      </AdminNavLink>
    </li>
  );
}

export default async function AdminHome() {
  const { identity: signedInAs, areas } = await currentAdmin();
  // The dashboard is open to every administrator, so it is the one screen that
  // has to draw itself around what this person may open. A tile that refuses
  // them is worse than no tile: it reads as something broken.
  const may = (href: string) => canOpen(areas, href);

  const [stats, inventory, content, pages, picturesWaiting, messages, importReviewQueue, privateRatings, reportedReviews] = await Promise.all([
    getDashboardStats(),
    getEditableInventory(),
    getAdminContent(),
    listPagesForAdmin(),
    countPendingSubmissions(),
    listContactMessages(),
    getImportReviewQueue(),
    listExperienceRatings(),
    listReportedPlaceReviews(),
  ]);

  // Counted from the built-in content, so the tiles survive the database being
  // away — the same rule the completeness queue follows.
  const totals = contentTotals();
  const pendingSuggestions = content.bundle.suggestions.filter((s) => s.status === "pending" || s.status === "needs-info");
  const unfinished = inventory.items.filter((item) => item.status !== "complete");
  const unpublishedPages = pages.filter((p) => p.status !== "PUBLISHED");
  const alerts: Array<{ text: string; href: string; label: string }> = [];

  if (stats.siteLocked) {
    alerts.push({
      text: "The website is closed to the public. Visitors currently see the access screen.",
      href: "/admin/settings/website",
      label: "Review website access",
    });
  }
  if (!stats.configured) {
    alerts.push({
      text: "The private store is not connected, so visitor numbers and some edits are not being saved.",
      href: "/admin/settings/connections",
      label: "Review connections",
    });
  }
  // An advertisement that finished in March still reads as enabled in every
  // list. The owner would only find it by comparing eleven dates to today.
  const adTrouble = adsNeedingAttention(content.bundle.promotions, new Date().toISOString().slice(0, 10));
  if (adTrouble) {
    alerts.push({ text: adTrouble.says, href: "/admin/advertisements", label: "Open advertisements" });
  }
  // Somebody sent a picture and is waiting to hear. It is on no page until
  // this is dealt with, which is exactly why it needs saying here.
  if (picturesWaiting > 0) {
    alerts.push({
      text: "Visitor pictures are waiting for review.",
      href: "/admin/photos",
      label: "Look at them",
    });
  }

  // Somebody wrote in from the contact page, the trip enquiry or the flight
  // request. Until now the only record of any of them was an email — so if the
  // mail service was away, or the address had quietly stopped working, nothing
  // anywhere said that a person had asked this website for something and heard
  // nothing back.
  const messageNews = messagesAlert(messages, new Date().toISOString());
  if (messageNews) {
    alerts.push({ text: messageNews, href: "/admin/messages", label: "Read them" });
  }

  // Somebody asked about Gold or Business and is waiting on a person. This used
  // to arrive in complete silence: written to the store, shown on
  // /admin/accounts, and announced nowhere — while the person who asked was
  // told "we have it, and we will be in touch".
  const plansWaiting = (await listPlanRequests()).filter((r) => r.state === "asked").length;
  // ONE PERSON IS ONE PERSON. "Account requests are waiting" read like a queue
  // whatever the number, and a queue is easier to leave until later than
  // somebody waiting. The number is said now, and said grammatically.
  //
  // And what answering costs, said here rather than found out by clicking:
  // while plans are asked for rather than bought, saying yes or no charges
  // nobody and starts no subscription — see lib/plan-billing.ts. That sentence
  // is what turns "I'll look at this properly later" into a decision somebody
  // can make now.
  if (plansWaiting > 0) {
    alerts.push({
      text:
        plansWaiting === 1
          ? "One person has asked about a plan. Nothing is charged either way."
          : `${plansWaiting} people have asked about a plan. Nothing is charged either way.`,
      href: "/admin/accounts",
      label: "Answer them",
    });
  }

  const reviewWaiting = importReviewQueue.error ? 0 : importReviewQueue.counts.awaitingVerification;
  if (reviewWaiting > 0 && may("/admin/imports/needs-review")) {
    alerts.push({
      text: "Listing candidates need verification.",
      href: "/admin/imports/needs-review",
      label: "Open needs review",
    });
  }
  const visibleAlerts = alerts.filter((alert) => may(alert.href));
  const quickAdd = ADMIN_QUICK_ADD.filter((item) => may(item.href));
  const quickActions = [
    { href: "/admin/pages", title: "Edit a page", detail: "Words or pictures." },
    { href: "/admin/directory", title: "Directory", detail: "Places and businesses." },
    { href: "/admin/growth", title: "Growth", detail: "Searches and visits." },
    { href: "/admin/advertisements", title: "Advertisements", detail: "Banners and promotions." },
  ].filter((action) => may(action.href));
  const sections = ADMIN_SECTIONS.filter((section) => section.href !== "/admin")
    .map((section) => ({ ...section, children: (section.children ?? []).filter((child) => may(child.href)) }))
    .filter((section) => may(section.href) || section.children.length > 0);

  return (
    <div className="pb-12">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--gold-light)] pb-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Admin overview</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--navy)] sm:text-5xl">
            Dashboard
          </h1>
        </div>
        <div className="text-right">
          {/* Who is actually signed in. Before this the answer was "somebody
              with the password", which is not an answer. */}
          <p className="mb-2 text-xs leading-5 text-stone-500">{describeAdmin(signedInAs)}</p>
          {/* Only when it is not everything. Telling the owner he has
              everything is noise on his own dashboard. */}
          {areas && <p className="mb-2 text-xs leading-5 text-stone-500">{describeAreas(areas)}</p>}
          <AdminSignOut />
        </div>
      </header>

      {/* What the site holds. The dashboard knew how many people had visited
          and nothing about what they had visited. Counted from the built-in
          content, so these survive the database being away. */}
      {(may("/admin/imports/needs-review") || may("/admin/content") || may("/admin/ratings") || may("/admin/history")) && (
        <section aria-labelledby="now-heading" className="mt-7">
          <h2 id="now-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Needs you now</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {may("/admin/imports/needs-review") && (
              <TotalCard
                label="Needs review"
                value={importReviewQueue.error ? 0 : importReviewQueue.counts.awaitingVerification}
                href="/admin/imports/needs-review"
              />
            )}
            {may("/admin/imports/needs-review") && (
              <TotalCard
                label="Possible duplicates"
                value={importReviewQueue.error ? 0 : importReviewQueue.counts.duplicates}
                href="/admin/imports/needs-review"
              />
            )}
            {may("/admin/content") && (
              <TotalCard label="Reported updates" value={pendingSuggestions.length} href="/admin/content" />
            )}
            {may("/admin/ratings") && (
              <TotalCard label="Pending ratings" value={privateRatings.length} href="/admin/ratings" />
            )}
            {may("/admin/ratings") && (
              <TotalCard label="Flagged reviews" value={reportedReviews.length} href="/admin/ratings" />
            )}
            {may("/admin/history") && <TotalCard label="Recent admin activity" href="/admin/history" />}
          </ul>
        </section>
      )}

      <section aria-labelledby="totals-heading" className="mt-7">
        <h2 id="totals-heading" className="sr-only">What the site holds</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ADMIN_TOTAL_CARDS.map((card) => (
            <TotalCard
              key={card.key}
              label={card.label}
              value={totals[card.key]}
              href={may(card.href) ? card.href : null}
            />
          ))}
        </ul>
      </section>

      {/* The jobs somebody opens the admin to do, rather than a place to go
          and then find the button. */}
      {quickAdd.length > 0 && (
      <section aria-labelledby="quick-heading" className="mt-7">
        <h2 id="quick-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--gold-ink)]">Add something</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickAdd.map((item) => (
            <AdminNavLink
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold)] px-4 text-xs font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--navy)] hover:bg-[var(--navy)] hover:text-white"
            >
              + {item.label}
            </AdminNavLink>
          ))}
        </div>
      </section>
      )}

      {visibleAlerts.length > 0 && (
        <section aria-labelledby="attention-heading" className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 id="attention-heading" className="font-[family-name:var(--font-display)] text-2xl text-amber-950">Needs attention</h2>
          </div>
          <ul className="mt-4 divide-y divide-amber-200">
            {visibleAlerts.map((alert) => (
              <li key={alert.href} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-amber-950">{alert.text}</p>
                <AdminNavLink href={alert.href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-amber-950 underline underline-offset-4">
                  {alert.label} →
                </AdminNavLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {quickActions.length > 0 && (
      <section aria-labelledby="quick-actions-heading" className="mt-9">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Common jobs</p>
        <h2 id="quick-actions-heading" className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Quick actions</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <QuickAction key={action.href} href={action.href} title={action.title} detail={action.detail} />
          ))}
        </div>
      </section>
      )}

      {/* All three panels are content screens, so a helper given only the
          directory would otherwise get the heading "Work waiting for you" with
          nothing under it. */}
      {(may("/admin/pages") || may("/admin/content") || may("/admin/inventory") || may("/admin/imports/needs-review")) && (
      <section aria-labelledby="work-heading" className="mt-9">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Your queue</p>
          <h2 id="work-heading" className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Work waiting for you</h2>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {may("/admin/pages") && (
          <WorkPanel title="Waiting to be published" href="/admin/pages" hrefLabel="Open pages">
            {unpublishedPages.length === 0 ? (
              <p>Every page is published. Nothing is sitting as a draft.</p>
            ) : (
              <ul className="space-y-2">
                {unpublishedPages.slice(0, 4).map((page) => (
                  <li key={page.slug} className="flex justify-between gap-3">
                    <span className="font-semibold text-[var(--navy)]">{page.title}</span>
                    <span className="text-stone-500">{page.status === "DRAFT" ? "Draft" : "Review"}</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkPanel>
          )}

          {may("/admin/content") && (
          <WorkPanel title="Suggestions" href="/admin/content" hrefLabel="Read suggestions">
            {pendingSuggestions.length === 0 ? (
              <p>No visitor corrections are waiting.</p>
            ) : (
              <ul className="space-y-2">
                {pendingSuggestions.slice(0, 4).map((suggestion) => (
                  <li key={suggestion.id}>
                    <span className="font-semibold text-[var(--navy)]">{suggestion.title || suggestion.targetId}</span>
                    <span className="block truncate text-stone-500">{suggestion.issue || suggestion.suggestedInfo || "No note"}</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkPanel>
          )}

                    {may("/admin/imports/needs-review") && (
          <WorkPanel title="Listing candidates" href="/admin/imports/needs-review" hrefLabel="Open needs review">
            {reviewWaiting === 0 ? (
              <p>No listing candidates are waiting for verification.</p>
            ) : (
              <p>Listings are waiting for verification.</p>
            )}
          </WorkPanel>
          )}

{may("/admin/inventory") && (
          <WorkPanel title="Unfinished checklist" href="/admin/inventory" hrefLabel="Open checklist">
            {unfinished.length === 0 ? (
              <p>Nothing on the checklist is outstanding.</p>
            ) : (
              <p>Items are marked unfinished.</p>
            )}
          </WorkPanel>
          )}
        </div>
      </section>
      )}

      <section aria-labelledby="all-tools-heading" className="mt-10 border-t border-[var(--gold-light)] pt-9">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Full dashboard</p>
          <h2 id="all-tools-heading" className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">Everything you can manage</h2>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <section key={section.href} className={`${cardClass} p-5`}>
              {/* A section whose own front page is closed still opens — to the
                  first screen inside it this person may use. */}
              <AdminNavLink href={may(section.href) ? section.href : section.children[0].href} className="group flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 text-lg text-[var(--gold-ink)]">{section.icon}</span>
                <span>
                  <span className="block font-[family-name:var(--font-display)] text-2xl text-[var(--navy)] group-hover:underline group-hover:decoration-[var(--gold)] group-hover:underline-offset-4">{section.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-stone-600">{section.blurb}</span>
                </span>
              </AdminNavLink>
              {section.children.length > 0 && (
                <ul className="mt-4 border-t border-[var(--gold-light)] pt-3">
                  {section.children.map((child) => (
                    <li key={child.href + child.label}>
                      <AdminNavLink href={child.href} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-stone-700 transition hover:bg-[var(--cream-deep)] hover:text-[var(--navy)]">
                        <span>{child.label}</span>
                        <span aria-hidden="true" className="text-[var(--gold-ink)]">→</span>
                      </AdminNavLink>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
