"use client";

import { useEffect, useState, type ReactNode } from "react";
import DestinationSearch from "@/components/DestinationSearch";
import StaySearchForm from "@/components/StaySearchForm";
import TravelAssistantBox from "@/components/TravelAssistantBox";
import { SITE_SEARCH_LABEL, SITE_SEARCH_NOTE } from "@/lib/site-search-labels";

/**
 * Homepage Search / Ask / Plan.
 *
 * Three intentions, one expanded panel. Tools stay mounted (hidden) so typed
 * answers and form fields survive switching in the same visit — that is not a
 * saved trip.
 */

type ToolId = "search" | "ask" | "plan";

const TOOLS: Array<{
  id: ToolId;
  label: string;
  title: string;
  body: string;
  action: string;
}> = [
  {
    id: "search",
    label: "Search",
    title: "Search White Glove",
    body: "Destinations, kosher food, stays, kevarim and towns.",
    action: "Search the site",
  },
  {
    id: "ask",
    label: "Ask",
    title: "Ask the assistant",
    body: "Destination ideas, kosher travel, Shabbos, or an itinerary.",
    action: "Ask the travel assistant",
  },
  {
    id: "plan",
    label: "Plan",
    title: "Find a place to stay",
    body: "Enter a destination and dates.",
    action: "Start planning",
  },
];

function ToolIcon({ id }: { id: ToolId }) {
  if (id === "search") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "ask") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 18.5V7.8A2.8 2.8 0 0 1 7.8 5h8.4A2.8 2.8 0 0 1 19 7.8v6.4A2.8 2.8 0 0 1 16.2 17H9l-4 3.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="6" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 4.5v3M16 4.5v3M4.5 10.5h15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function useStickyBelowHeader() {
  const [top, setTop] = useState(96);
  useEffect(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    if (!nav) return;
    const sync = () => setTop(Math.round(nav.getBoundingClientRect().height));
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  return top;
}

export default function HomeDiscoveryTools() {
  // Plan is the primary vacation-planning action; Search and Ask stay one press away.
  const [tool, setTool] = useState<ToolId>("plan");
  const stickyTop = useStickyBelowHeader();

  return (
    <div className="mt-8 max-w-5xl">
      {/*
        Narrow screens: all three controls stay in one row above the panel
        (and stick under the header while the Ask assistant is tall). Stacking
        the full cards used to put Plan between a tap on Ask and the panel,
        so the assistant appeared only after a scroll.
      */}
      <div
        role="tablist"
        aria-label="Search, ask, or plan"
        style={{ top: stickyTop }}
        className="sticky z-[calc(var(--wg-z-header)-1)] -mx-5 grid grid-cols-3 gap-2 border-b border-[var(--gold-light)] bg-[var(--cream)]/95 px-5 py-2 backdrop-blur-md sm:static sm:top-auto sm:z-auto sm:mx-0 sm:gap-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none"
      >
        {TOOLS.map((item) => {
          const selected = tool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`home-tool-${item.id}`}
              id={`home-tool-tab-${item.id}`}
              onClick={() => setTool(item.id)}
              className={`min-h-11 rounded-2xl border px-2 py-3 text-center transition sm:px-4 sm:py-4 sm:text-left ${
                selected
                  ? "border-[var(--navy)] bg-[var(--navy)] text-white shadow-[0_14px_30px_rgba(16, 47, 53,.16)]"
                  : "border-[var(--gold-light)] bg-[var(--surface)] text-[var(--navy)] hover:border-[var(--gold)] hover:bg-[var(--cream-deep)]"
              }`}
            >
              <span className={`inline-flex w-full items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] sm:w-auto sm:justify-start sm:gap-2 ${selected ? "text-[var(--gold-light)]" : "text-[var(--gold-ink)]"}`}>
                <ToolIcon id={item.id} />
                {item.label}
              </span>
              <span className="mt-2 hidden font-[family-name:var(--font-display)] text-xl leading-tight sm:block">{item.title}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <Panel id="search" active={tool === "search"}>
          <div className="rounded-2xl border border-[var(--navy)]/15 bg-white p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">{SITE_SEARCH_LABEL}</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">{SITE_SEARCH_NOTE}</p>
            <div className="mt-4">
              <DestinationSearch compact showChrome={false} id="home-site-search" />
            </div>
          </div>
        </Panel>

        <Panel id="ask" active={tool === "ask"}>
          <TravelAssistantBox embedded />
        </Panel>

        <Panel id="plan" active={tool === "plan"}>
          <StaySearchForm id="hero" submitLabel="Start planning" />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ id, active, children }: { id: ToolId; active: boolean; children: ReactNode }) {
  // Keep every tool mounted so in-session drafts survive tab switches.
  return (
    <div
      id={`home-tool-${id}`}
      role="tabpanel"
      aria-labelledby={`home-tool-tab-${id}`}
      hidden={!active}
      className={active ? "block" : "hidden"}
    >
      {children}
    </div>
  );
}
