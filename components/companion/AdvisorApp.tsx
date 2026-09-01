"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";
import CompanionApp, { AdvisorInbox, COMPANION_CSS } from "@/components/companion/CompanionApp";
import AdvisorNotify from "@/components/companion/AdvisorNotify";
import type { CompanionTrip } from "@/data/companion-demo";

/**
 * THE ADVISOR APP — its own app, not the client's.
 *
 * A four-tab shell the advisor lives in: every client's trips, every
 * conversation, a wallet they fill per trip, and their dashboard. It is loaded
 * by the White Glove Advisor native shell (server.url = /advisor), so the
 * advisor never lands on the single-trip client view and never gets stranded
 * with no way back — the dashboard is a tab here, not a place they fall out to.
 *
 * IT WEARS THE SAME CHROME AS THE CLIENT APP. Same navy header with a gold
 * eyebrow over a serif title, same gold-pill bottom bar that slides to the
 * active tab — so the two apps read as one family, not one polished app and one
 * plain one. The colours and the pill are lifted straight from CompanionApp
 * (and its CSS is rendered here) rather than re-invented, so they can't drift.
 *
 * The dashboard itself is passed in as `children` (server-rendered on
 * /advisor), so the numbers stay a server read; this file is only the chrome
 * and the two list tabs. Opening one trip still hands off to the rich companion
 * view (/app?trip=…) for now — the trip screens live there — which is why each
 * row is a plain link.
 */

export type AdvisorTripRow = {
  id: string;
  name: string;
  client: string;
  shareId?: string;
  startDate: string;
  stageLabel: string;
};

type Tab = "trips" | "messages" | "wallet" | "account";

// The same palette the client app uses, so the two match exactly.
const NAVY = "#14213d";
const CREAM = "#f7f5f0";
const GOLD = "#b78a4a";
const GOLD_ON_DARK = "#c8a76a";
const ON_GOLD = NAVY;
const MUTED = "#5a544e";
const serif = "Georgia,'Times New Roman',serif";

const TABS: { id: Tab; label: string; icon: IconName; eyebrow: string; title: string }[] = [
  { id: "trips", label: "Trips", icon: "suitcase", eyebrow: "Advisor", title: "Trips" },
  { id: "messages", label: "Messages", icon: "chat", eyebrow: "Your clients", title: "Messages" },
  { id: "wallet", label: "Wallet", icon: "wallet", eyebrow: "Advisor", title: "Wallet" },
  { id: "account", label: "Account", icon: "account", eyebrow: "Advisor", title: "Dashboard" },
];

export default function AdvisorApp({
  trips,
  children,
  openTrip,
  openTripInfo,
  openScreen,
  openShareId,
  initialTab,
}: {
  trips: AdvisorTripRow[];
  children: ReactNode;
  /** A trip opened from the Trips or Wallet tab (server-built on /advisor?trip=…).
   *  When present, it shows embedded in this shell — the advisor's own four-tab
   *  bar stays below it, so opening a trip never lands them in the client app. */
  openTrip?: CompanionTrip | null;
  /** The opened trip's plain facts, present even when it has no dates yet and so
   *  cannot build the day-by-day view. Lets "no dates" open a real screen here
   *  rather than dead-ending on the dashboard. */
  openTripInfo?: { id: string; name: string; client: string } | null;
  /** Which of the trip's screens to open on — "wallet" from the Wallet tab. */
  openScreen?: "wallet";
  /** The trip's share token, so "Comment on this" opens that client's thread. */
  openShareId?: string;
  /** Which tab to open on when no trip is opened — carried as /advisor?tab=…
   *  from the app bar on a tool page, so returning lands on the tab it names
   *  rather than always the dashboard. Ignored when a trip is opening. */
  initialTab?: Tab;
}) {
  const router = useRouter();
  // Open on the dashboard — the advisor's overview — unless a trip was opened
  // (show that trip, from Trips or Wallet) or a tab was named in the address.
  const [tab, setTab] = useState<Tab>(
    openTrip || openTripInfo ? (openScreen === "wallet" ? "wallet" : "trips") : (initialTab ?? "account"),
  );
  // Whether a trip is showing right now — the built day-by-day view, or the
  // no-dates screen. Set from the server props; tapping any bottom tab leaves it.
  const [viewingTrip, setViewingTrip] = useState(Boolean(openTrip || openTripInfo));
  // While the message composer holds the keyboard, drop the bottom bar out of
  // the way (the inbox bubbles this up), same as the client app does.
  const [composerUp, setComposerUp] = useState(false);

  // Tapping a bottom tab always leaves an open trip and shows that tab.
  function selectTab(id: Tab) {
    setViewingTrip(false);
    setTab(id);
  }

  // Backing out of the embedded trip returns to the advisor app and drops the
  // ?trip from the address so a refresh doesn't reopen it.
  function exitTrip() {
    setViewingTrip(false);
    router.replace("/advisor");
  }

  const meta = TABS.find((t) => t.id === tab)!;
  const activeIdx = TABS.findIndex((t) => t.id === tab);

  return (
    <div
      className="wg-phone"
      style={{ height: "100dvh", display: "flex", flexDirection: "column", background: CREAM, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}
    >
      <style>{COMPANION_CSS}</style>

      {/* header — the navy bar, a gold eyebrow over a serif title, exactly the
          client app's. No back button: every tab here is top-level. Hidden
          while a trip is open, because the embedded trip brings its own navy
          header (with the back that leaves the trip). */}
      {!viewingTrip && (
        <div style={{ flexShrink: 0, padding: "calc(20px + env(safe-area-inset-top)) 18px 12px", display: "flex", alignItems: "center", gap: 10, background: NAVY, color: CREAM, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ font: "600 9.5px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: GOLD_ON_DARK }}>{meta.eyebrow}</div>
            <div style={{ font: `400 19px/1.15 ${serif}`, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.title}</div>
          </div>
          <AdvisorNotify />
        </div>
      )}
      {/* The no-dates trip screen brings its own navy header with a back, since
          the embedded day-by-day view (which normally supplies one) isn't shown. */}
      {viewingTrip && !openTrip && openTripInfo && (
        <div style={{ flexShrink: 0, padding: "calc(20px + env(safe-area-inset-top)) 18px 12px", display: "flex", alignItems: "center", gap: 10, background: NAVY, color: CREAM, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <button onClick={exitTrip} aria-label="Back" style={{ border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.08)", width: 34, height: 34, borderRadius: 14, cursor: "pointer", fontSize: 15, color: CREAM, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ font: "600 9.5px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: GOLD_ON_DARK }}>Trip</div>
            <div style={{ font: `400 19px/1.15 ${serif}`, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{openTripInfo.client || openTripInfo.name}</div>
          </div>
        </div>
      )}

      {/* content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {viewingTrip && openTrip && (
          // The trip itself, embedded — its own navy header and itinerary,
          // this app's four-tab bar still below it. The advisor is never handed
          // off to the client app, and Account is always one tap away.
          <CompanionApp
            trip={openTrip}
            embedded
            onExit={exitTrip}
            advisorInbox
            advisorShareId={openShareId}
            initialScreen={openScreen}
          />
        )}
        {viewingTrip && !openTrip && openTripInfo && (
          // The trip has no dates yet. Not a dead end — a real screen: the
          // day-by-day view needs dates (it is organised by day), but planning
          // a trip before the client's dates are firm is normal, so the trip
          // opens here with the tools that don't need dates. Chat and wallet
          // are the tabs below; dates are set in the planner when they firm up.
          <NoDatesTrip name={openTripInfo.name} client={openTripInfo.client} />
        )}
        {!viewingTrip && tab === "account" && (
          <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {children}
          </div>
        )}
        {!viewingTrip && tab === "messages" && (
          // The inbox lives in its own scroll region, the same way the client
          // app wraps it — otherwise a long list of clients has nothing to
          // scroll inside and gets clipped under the bottom bar.
          <div className="wg-scroll" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <AdvisorInbox onComposerFocus={setComposerUp} />
          </div>
        )}
        {!viewingTrip && tab === "trips" && (
          <TripList
            trips={trips}
            blurb="Every client's trip. Open one to see its itinerary and chat."
            hrefFor={(t) => `/advisor?trip=${encodeURIComponent(t.id)}`}
            actions
          />
        )}
        {!viewingTrip && tab === "wallet" && (
          <TripList
            trips={trips}
            blurb="Open a trip to add its documents — boarding passes, confirmations — to the client's wallet."
            hrefFor={(t) => `/advisor?trip=${encodeURIComponent(t.id)}&screen=wallet`}
          />
        )}
      </div>

      {/* tabs — an icon over a label per tab, with one gold pill that slides to
          the active one, the same bottom bar the client app carries. Hidden
          while the message composer holds the keyboard. */}
      {!(composerUp && tab === "messages") && (
        <div style={{ flexShrink: 0, position: "relative", padding: "8px 10px", background: "#ece8df", borderTop: "1px solid rgba(38,50,58,.08)", display: "flex", paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 8,
              bottom: "calc(8px + env(safe-area-inset-bottom))",
              left: `calc(10px + ${activeIdx} * (100% - 20px) / ${TABS.length})`,
              width: `calc((100% - 20px) / ${TABS.length})`,
              background: GOLD,
              borderRadius: 16,
              boxShadow: "0 3px 10px rgba(183,138,74,.34)",
              transition: "left .28s cubic-bezier(.4,0,.2,1)",
            }}
          />
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                aria-current={on ? "page" : undefined}
                aria-label={t.label}
                style={{ position: "relative", zIndex: 1, flex: 1, border: 0, cursor: "pointer", background: "transparent", color: on ? ON_GOLD : MUTED, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "9px 3px", transition: "color .2s ease" }}
              >
                <Icon name={t.icon} className="h-5 w-5" strokeWidth={on ? 2.1 : 1.7} />
                <span style={{ font: `${on ? 600 : 500} 10.5px/1 Inter,sans-serif`, letterSpacing: ".01em" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NoDatesTrip({ name, client }: { name: string; client: string }) {
  return (
    <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 16px 24px", display: "flex", flexDirection: "column", gap: 12, animation: "wgIn .28s ease both" }}>
      <div style={{ border: "1px solid rgba(38,50,58,.1)", background: "#fff", borderRadius: 16, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ font: "600 10px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: "#a8a29e" }}>No dates yet</span>
        <h2 style={{ margin: 0, font: `400 22px/1.2 ${serif}`, color: NAVY }}>{client || name}</h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "#57534e" }}>
          The day-by-day trip view opens once this trip has a start and end date — it&rsquo;s laid out one day at a
          time. Planning before your client&rsquo;s dates are firm is fine: set the dates in the planner whenever
          they&rsquo;re settled, and the trip fills in here.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "#57534e" }}>
          You can still message this client and build their wallet from the tabs below.
        </p>
        <Link
          href="/itinerary"
          className="wg-warm"
          style={{ alignSelf: "flex-start", marginTop: 2, border: 0, background: NAVY, color: CREAM, borderRadius: 999, padding: "10px 18px", font: "600 13px/1 Inter,sans-serif", textDecoration: "none" }}
        >
          Open the planner
        </Link>
      </div>
    </div>
  );
}

function TripList({
  trips,
  blurb,
  hrefFor,
  actions = false,
}: {
  trips: AdvisorTripRow[];
  blurb: string;
  hrefFor: (t: AdvisorTripRow) => string;
  /** Show the per-trip copy / open / edit icons (the Trips tab; not Wallet). */
  actions?: boolean;
}) {
  return (
    <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 10, animation: "wgIn .28s ease both" }}>
      <p style={{ margin: "0 2px 2px", fontSize: 13, lineHeight: 1.5, color: "#78716c" }}>{blurb}</p>
      {trips.length === 0 ? (
        <div style={{ padding: "18px 4px", fontSize: 13.5, lineHeight: 1.6, color: "#57534e" }}>
          No trips yet. Build one in the planner and share it — it shows up here.
        </div>
      ) : (
        trips.map((t) => (
          <div
            key={t.id}
            className="wg-warm"
            style={{ display: "flex", alignItems: "center", gap: 13, border: "1px solid rgba(38,50,58,.08)", background: "#ffffff", borderRadius: 16, padding: "14px 16px" }}
          >
            <a href={hrefFor(t)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 13, textDecoration: "none" }}>
              <span style={{ flex: "none", width: 42, height: 42, borderRadius: 12, background: "#e7edf1", display: "flex", alignItems: "center", justifyContent: "center", font: `400 18px/1 ${serif}`, color: "#1f3f5c" }}>
                {(t.client || t.name || "?").charAt(0).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25, color: "#26323a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.client || t.name}
                </span>
                <span style={{ fontSize: 12.5, color: "#78716c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {[t.client ? t.name : null, t.stageLabel, t.startDate ? `leaves ${t.startDate}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </a>
            {actions ? <TripRowActions trip={t} openHref={hrefFor(t)} /> : <Icon name="more" className="h-4 w-4" aria-hidden />}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * The per-trip quick actions: copy the client's code (their app link, the one
 * they open the trip with), open the trip here, and edit it in the planner. The
 * copy only appears once the trip has a share token — before it is shared there
 * is no code to hand out yet.
 */
function TripRowActions({ trip, openHref }: { trip: AdvisorTripRow; openHref: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!trip.shareId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/i/${trip.shareId}/app`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — nothing to show, the button just does nothing */
    }
  };
  const btn: CSSProperties = { flex: "none", width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(38,50,58,.12)", background: "#fff", color: NAVY, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, textDecoration: "none" };
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6 }}>
      {trip.shareId && (
        <button type="button" onClick={copy} aria-label={copied ? "Code copied" : "Copy the client's code"} title="Copy the client's code" style={{ ...btn, borderColor: copied ? "#4ba36a" : "rgba(38,50,58,.12)", color: copied ? "#4ba36a" : NAVY }}>
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          )}
        </button>
      )}
      <a href={openHref} aria-label="Open the trip" title="Open the trip" style={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
      </a>
      <Link href="/itinerary" aria-label="Edit in the planner" title="Edit in the planner" style={btn}>
        <Icon name="pencil" className="h-[15px] w-[15px]" />
      </Link>
    </div>
  );
}
