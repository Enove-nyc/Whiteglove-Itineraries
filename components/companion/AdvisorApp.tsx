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

const NAVY = "#14213d";
const CREAM = "#faf7f0";
const serif = "Georgia,'Times New Roman',serif";

export default function AdvisorApp({ trips, children }: { trips: AdvisorTripRow[]; children: ReactNode }) {
  // Open on the dashboard — the advisor's overview — the same page this app
  // used to be before it grew tabs.
  const [tab, setTab] = useState<Tab>("account");
  // While the message composer holds the keyboard, drop the bottom bar out of
  // the way (the inbox bubbles this up), same as the client app does.
  const [composerUp, setComposerUp] = useState(false);

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: "trips", label: "Trips", icon: "suitcase" },
    { id: "messages", label: "Messages", icon: "chat" },
    { id: "wallet", label: "Wallet", icon: "wallet" },
    { id: "account", label: "Account", icon: "account" },
  ];

  return (
    <div
      className="wg-phone"
      style={{ height: "100dvh", display: "flex", flexDirection: "column", background: CREAM, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}
    >
      <style>{COMPANION_CSS}</style>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "account" && (
          <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingTop: "env(safe-area-inset-top)" }}>
            {children}
          </div>
        )}
        {tab === "messages" && <AdvisorInbox onComposerFocus={setComposerUp} />}
        {tab === "trips" && (
          <TripList
            trips={trips}
            title="Trips"
            blurb="Every client's trip. Open one to see its itinerary and chat."
            hrefFor={(t) => `/app?trip=${encodeURIComponent(t.id)}`}
          />
        )}
        {tab === "wallet" && (
          <TripList
            trips={trips}
            title="Wallet"
            blurb="Open a trip to add its documents — boarding passes, confirmations — to the client's wallet."
            hrefFor={(t) => `/app?trip=${encodeURIComponent(t.id)}&screen=wallet`}
          />
        )}
      </div>

      {!composerUp && (
        <nav
          style={{
            flexShrink: 0,
            display: "flex",
            borderTop: "1px solid rgba(38,50,58,.1)",
            background: "rgba(247,245,240,.94)",
            backdropFilter: "blur(12px)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-label={t.label}
                aria-current={on ? "page" : undefined}
                style={{
                  flex: 1,
                  border: 0,
                  background: "none",
                  cursor: "pointer",
                  padding: "9px 0 7px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  color: on ? NAVY : "#8a8175",
                }}
              >
                <Icon name={t.icon} className="h-[22px] w-[22px]" strokeWidth={on ? 2 : 1.6} />
                <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: ".01em" }}>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function TripList({
  trips,
  title,
  blurb,
  hrefFor,
}: {
  trips: AdvisorTripRow[];
  title: string;
  blurb: string;
  hrefFor: (t: AdvisorTripRow) => string;
}) {
  return (
    <div className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "calc(16px + env(safe-area-inset-top)) 16px 24px", display: "flex", flexDirection: "column", gap: 10, animation: "wgIn .28s ease both" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 2 }}>
        <span style={{ font: "600 10px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: "#a8a29e" }}>Advisor</span>
        <h1 style={{ margin: 0, font: `400 26px/1.1 ${serif}`, color: NAVY }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#78716c", maxWidth: 420 }}>{blurb}</p>
      </div>
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
