"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";
import CompanionApp, { AdvisorInbox, COMPANION_CSS, useMediaQuery } from "@/components/companion/CompanionApp";
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
  /** The named travellers on the trip, each with their own code if one's been
   *  made — for handing one person on a family trip their own link. */
  travelers?: { id: string; name: string; shareId?: string }[];
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
  // On a computer, an opened trip is centred as a tidy app-width panel rather
  // than stretched across the whole window (its content is laid out for a
  // phone). A phone shows it full-bleed as before.
  const wide = useMediaQuery("(min-width: 900px)");
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
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", ...(wide && viewingTrip && openTrip ? { alignItems: "center", background: "#eef1f4" } : {}) }}>
        {viewingTrip && openTrip && (
          // The trip itself, embedded — its own navy header and itinerary,
          // this app's four-tab bar still below it. The advisor is never handed
          // off to the client app, and Account is always one tap away. On a
          // computer it's boxed to a comfortable app width and centred; on a
          // phone it fills the screen.
          <div style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: wide ? 460 : undefined, display: "flex", flexDirection: "column", ...(wide ? { boxShadow: "0 0 0 1px rgba(38,50,58,.08)" } : {}) }}>
            <CompanionApp
              trip={openTrip}
              embedded
              onExit={exitTrip}
              advisorInbox
              advisorShareId={openShareId}
              initialScreen={openScreen}
            />
          </div>
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
  // On a computer the trips lay out as a grid that fills the width, instead of
  // one tall column of full-width rows; a phone keeps the single column.
  const wide = useMediaQuery("(min-width: 900px)");
  return (
    <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 10, animation: "wgIn .28s ease both" }}>
      <p style={{ margin: "0 2px 2px", fontSize: 13, lineHeight: 1.5, color: "#78716c" }}>{blurb}</p>
      {trips.length === 0 ? (
        <div style={{ padding: "18px 4px", fontSize: 13.5, lineHeight: 1.6, color: "#57534e" }}>
          No trips yet. Build one in the planner and share it — it shows up here.
        </div>
      ) : (
        <div style={wide ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, alignItems: "start" } : { display: "flex", flexDirection: "column", gap: 10 }}>
          {trips.map((t) => <TripRow key={t.id} trip={t} openHref={hrefFor(t)} actions={actions} />)}
        </div>
      )}
    </div>
  );
}

/**
 * One trip in the Trips (or Wallet) list, and — on the Trips tab — its own row
 * of actions: SEE the client's code (reveal the link to share, and copy it),
 * open the trip here, and edit it in the planner.
 *
 * "See the code", not just "copy" — an advisor reading a code out to a client,
 * or checking they have the right one, needs to see it, not copy it blind. The
 * three action buttons are one fixed size so the row reads evenly whether or
 * not a trip has been shared yet; the code button is simply disabled until it
 * has a share token (nothing to hand out before then).
 */
function TripRow({ trip, openHref, actions }: { trip: AdvisorTripRow; openHref: string; actions: boolean }) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const code = trip.shareId ? `${origin}/i/${trip.shareId}/app` : "";
  const travelers = trip.travelers ?? [];
  // The code panel is reachable when there's a whole-trip code OR named
  // travellers to give their own codes to — creating a traveller's code makes a
  // whole-trip one too, so a family trip need not be "shared" first.
  const hasCodeUI = Boolean(trip.shareId) || travelers.length > 0;
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the code is shown to copy by hand */
    }
  };
  const btn: CSSProperties = { flex: "none", width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(38,50,58,.12)", background: "#fff", color: NAVY, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, textDecoration: "none" };

  return (
    <div className="wg-warm" style={{ border: "1px solid rgba(38,50,58,.08)", background: "#ffffff", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px" }}>
        <a href={openHref} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 13, textDecoration: "none" }}>
          <span style={{ flex: "none", width: 42, height: 42, borderRadius: 12, background: "#e7edf1", display: "flex", alignItems: "center", justifyContent: "center", font: `400 18px/1 ${serif}`, color: "#1f3f5c" }}>
            {(trip.client || trip.name || "?").charAt(0).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25, color: "#26323a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {trip.client || trip.name}
            </span>
            <span style={{ fontSize: 12.5, color: "#78716c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {[trip.client ? trip.name : null, trip.stageLabel, trip.startDate ? `leaves ${trip.startDate}` : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </a>
        {actions ? (
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => hasCodeUI && setShowCode((v) => !v)}
              disabled={!hasCodeUI}
              aria-label={hasCodeUI ? "See the client's code" : "Add a traveller to give a code"}
              aria-expanded={showCode}
              title={hasCodeUI ? "See the client's code" : "No one to share with yet"}
              style={{ ...btn, cursor: hasCodeUI ? "pointer" : "default", opacity: hasCodeUI ? 1 : 0.4, borderColor: showCode ? GOLD : "rgba(38,50,58,.12)", color: showCode ? GOLD_ON_DARK : NAVY }}
            >
              {/* A QR-ish "code" mark — the same on every row, so the icons line up. */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v-4M17 21h.01" /></svg>
            </button>
            <a href={openHref} aria-label="Open the trip" title="Open the trip" style={btn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
            </a>
            <Link href="/itinerary" aria-label="Edit in the planner" title="Edit in the planner" style={btn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </Link>
          </div>
        ) : (
          <Icon name="more" className="h-4 w-4" aria-hidden />
        )}
      </div>

      {/* The codes, shown on tap — readable, to check or read out, each with a
          Copy button. The whole-trip code opens the trip for anyone; below it,
          each named traveller can be given THEIR OWN code, which carries their
          name into the chat so you can tell one person's messages from another's. */}
      {showCode && hasCodeUI && (
        <div style={{ borderTop: "1px solid rgba(38,50,58,.08)", background: "#faf8f3", padding: "11px 16px 13px", display: "flex", flexDirection: "column", gap: 12 }}>
          {code && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11.5, color: "#78716c" }}>Whole trip — send this to open their trip in the app.</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.4, color: "#26323a", wordBreak: "break-all", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>{code}</code>
                <button
                  type="button"
                  onClick={copy}
                  style={{ flex: "none", borderRadius: 9, border: `1px solid ${copied ? "#4ba36a" : GOLD}`, background: copied ? "#eef7f0" : "#fff", color: copied ? "#2f7d4f" : NAVY, cursor: "pointer", padding: "7px 12px", font: "700 11.5px/1 Inter,sans-serif" }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
          {travelers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: "#78716c" }}>Each traveller&rsquo;s own code — their messages show their name.</span>
              {travelers.map((tr) => (
                <TravelerCode key={tr.id} tripId={trip.id} traveler={tr} origin={origin} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One traveller's own code, in the trip's code panel. Shows the link when it
 * exists, or a "Create code" button that mints one (POST /api/account/traveler-
 * share) — the same door the planner's traveller list uses, brought to where the
 * advisor is already looking at the trip. A traveller on this link carries their
 * name into the chat, which is what tells a family's messages apart.
 */
function TravelerCode({ tripId, traveler, origin }: { tripId: string; traveler: { id: string; name: string; shareId?: string }; origin: string }) {
  const [shareId, setShareId] = useState(traveler.shareId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const link = shareId ? `${origin}/t/${shareId}/app` : "";

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/account/traveler-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, travelerId: traveler.id }),
      });
      const d = (await res.json().catch(() => null)) as { shareId?: string; error?: string } | null;
      if (res.ok && d?.shareId) setShareId(d.shareId);
      else setErr(d?.error || "Couldn't create that code.");
    } catch {
      setErr("Couldn't create that code.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the link is shown to copy by hand */
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid rgba(38,50,58,.06)", paddingTop: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: NAVY }}>{traveler.name}</span>
      {link ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.4, color: "#26323a", wordBreak: "break-all", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>{link}</code>
          <button
            type="button"
            onClick={copy}
            style={{ flex: "none", borderRadius: 9, border: `1px solid ${copied ? "#4ba36a" : GOLD}`, background: copied ? "#eef7f0" : "#fff", color: copied ? "#2f7d4f" : NAVY, cursor: "pointer", padding: "6px 11px", font: "700 11px/1 Inter,sans-serif" }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={busy}
          style={{ alignSelf: "flex-start", borderRadius: 9, border: `1px solid ${GOLD}`, background: "#fff", color: NAVY, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, padding: "6px 12px", font: "700 11px/1 Inter,sans-serif" }}
        >
          {busy ? "Creating…" : "Create code"}
        </button>
      )}
      {err && <span style={{ fontSize: 11, color: "#b42318" }}>{err}</span>}
    </div>
  );
}
