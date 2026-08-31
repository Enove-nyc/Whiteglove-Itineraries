"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { AdvisorInbox, COMPANION_CSS } from "@/components/companion/CompanionApp";

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

export default function AdvisorApp({ trips, children }: { trips: AdvisorTripRow[]; children: ReactNode }) {
  // Open on the dashboard — the advisor's overview — the same page this app
  // used to be before it grew tabs.
  const [tab, setTab] = useState<Tab>("account");
  // While the message composer holds the keyboard, drop the bottom bar out of
  // the way (the inbox bubbles this up), same as the client app does.
  const [composerUp, setComposerUp] = useState(false);

  const meta = TABS.find((t) => t.id === tab)!;
  const activeIdx = TABS.findIndex((t) => t.id === tab);

  return (
    <div
      className="wg-phone"
      style={{ height: "100dvh", display: "flex", flexDirection: "column", background: CREAM, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}
    >
      <style>{COMPANION_CSS}</style>

      {/* header — the navy bar, a gold eyebrow over a serif title, exactly the
          client app's. No back button: every tab here is top-level. */}
      <div style={{ flexShrink: 0, padding: "calc(20px + env(safe-area-inset-top)) 18px 12px", display: "flex", alignItems: "center", gap: 10, background: NAVY, color: CREAM, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ font: "600 9.5px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: GOLD_ON_DARK }}>{meta.eyebrow}</div>
          <div style={{ font: `400 19px/1.15 ${serif}`, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.title}</div>
        </div>
      </div>

      {/* content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "account" && (
          <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {children}
          </div>
        )}
        {tab === "messages" && <AdvisorInbox onComposerFocus={setComposerUp} />}
        {tab === "trips" && (
          <TripList
            trips={trips}
            blurb="Every client's trip. Open one to see its itinerary and chat."
            hrefFor={(t) => `/app?trip=${encodeURIComponent(t.id)}`}
          />
        )}
        {tab === "wallet" && (
          <TripList
            trips={trips}
            blurb="Open a trip to add its documents — boarding passes, confirmations — to the client's wallet."
            hrefFor={(t) => `/app?trip=${encodeURIComponent(t.id)}&screen=wallet`}
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
                onClick={() => setTab(t.id)}
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

function TripList({
  trips,
  blurb,
  hrefFor,
}: {
  trips: AdvisorTripRow[];
  blurb: string;
  hrefFor: (t: AdvisorTripRow) => string;
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
          <a
            key={t.id}
            href={hrefFor(t)}
            className="wg-warm"
            style={{ display: "flex", alignItems: "center", gap: 13, textDecoration: "none", border: "1px solid rgba(38,50,58,.08)", background: "#ffffff", borderRadius: 16, padding: "14px 16px" }}
          >
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
            <Icon name="more" className="h-4 w-4" aria-hidden />
          </a>
        ))
      )}
    </div>
  );
}
