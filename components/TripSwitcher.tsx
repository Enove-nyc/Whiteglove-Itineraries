"use client";

import { useCallback, useEffect, useState } from "react";
import { useDeviceClock } from "@/components/TripProgressStrip";
import { countdownPhrase, tripProgress } from "@/lib/trip-progress";
import { tripRowMeta } from "@/lib/trip-bar";
import { isAccountPlan } from "@/lib/account-plans";
import { mayServeCompanionClients, mayUseTripTemplates } from "@/lib/account-limits";

// The traveler's trips, and a way to move between them.
//
// One account used to mean one itinerary, so planning Poland in the spring and
// Ukraine in the autumn meant planning over the top of yourself. Each trip now
// keeps its own stops, its own days and its own share link.
//
// Nothing renders for a visitor who is not signed in: there is no account to
// hold a second trip in, and an empty panel offering trips they cannot have is
// worse than no panel at all.

type Trip = {
  id: string;
  name: string;
  /** Who the trip is for. Business accounts only; "" for everybody else. */
  client: string;
  /** The advisor on the trip — the agent the client is dealing with. */
  advisor: string;
  active: boolean;
  stops: number;
  places: number;
  days: number;
  startDate: string;
  endDate: string;
  shared: boolean;
  /** The public token when shared, so the client's app link can be built. */
  shareId?: string;
  updatedAt: string;
  /** Whether this trip's client gets automatic reminders — see lib/trip-reminders.ts. */
  autoReminders: boolean;
};

/** An advisor's own saved trip shape — see lib/trip-templates.ts. */
type Template = { id: string; name: string; createdAt: string };

const smallButton =
  "min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:opacity-50";

export default function TripSwitcher({
  onSwitched,
  /**
   * When set, this is the itineraries INDEX rather than an inline switcher: a
   * name opens that one itinerary for editing (the planner drills into it and
   * shows a "back to all itineraries" button). Given, the names become the
   * primary action and every row can be opened, not only the inactive ones.
   */
  onOpen,
}: {
  onSwitched?: () => void;
  onOpen?: (id: string) => void;
}) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  // Naming the client is part of a Business account. Asked once, from the same
  // endpoint the branding panel uses, and the buttons simply are not drawn for
  // anybody else — a greyed-out control advertising an upgrade has no place in
  // the middle of somebody's planning.
  const [mayServeClients, setMayServeClients] = useState(false);
  // Saving and starting from templates is Advisor Pro — read off the same
  // branding response rather than a second request, since it already
  // resolves the account's plan server-side.
  const [mayUseTemplates, setMayUseTemplates] = useState(false);
  const [clientFor, setClientFor] = useState<string | null>(null);
  const [draftClient, setDraftClient] = useState("");
  // The agent on the trip, edited the same way as the client name.
  const [advisorFor, setAdvisorFor] = useState<string | null>(null);
  const [draftAdvisor, setDraftAdvisor] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  // The advisor's own saved trip shapes — a separate list from the trips
  // themselves, fetched the same way.
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [savingTemplateFor, setSavingTemplateFor] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [renamingTemplate, setRenamingTemplate] = useState<string | null>(null);
  const [templateRenameDraft, setTemplateRenameDraft] = useState("");
  const [startingFrom, setStartingFrom] = useState<string | null>(null);
  const [startDraftName, setStartDraftName] = useState("");
  const [startDraftDate, setStartDraftDate] = useState("");
  // This site's own origin, so the client link is absolute and copyable. This
  // panel only ever renders after its trips have loaded on the client, so
  // window is always here by the time the link is drawn — no effect needed.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // The traveler's own date, so a trip that starts tomorrow says so on the
  // list rather than only once it is opened.
  const { today } = useDeviceClock();

  useEffect(() => {
    let live = true;
    fetch("/api/account/trips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d?.trips && setTrips(d.trips))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/account/branding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return;
        // Naming who a trip is for, naming the advisor, and the client's own
        // code are all Advisor Starter and up — the same door as handing a
        // trip to a client at all (AGENTS.md). `allowed` on this response is
        // mayBrandOwnItinerary, Pro-only, which is a different, narrower
        // gate (the advisor's OWN logo on the document) — not this one.
        setMayServeClients(isAccountPlan(d?.plan) ? mayServeCompanionClients(d.plan) : false);
        setMayUseTemplates(isAccountPlan(d?.plan) ? mayUseTripTemplates(d.plan) : false);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const loadTemplates = useCallback(() => {
    fetch("/api/account/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.templates && setTemplates(d.templates))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const templateAct = useCallback(
    async (action: string, payload: { id?: string; tripId?: string; name?: string; startDate?: string } = {}, reload = false) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/account/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "That did not work. Try again.");
          return;
        }
        if (data.templates) setTemplates(data.templates);
        else loadTemplates();
        // Starting a trip from a template creates a real trip, which the
        // switcher's own trips list needs to show — same response shape
        // /api/account/trips already returns.
        if (data.trips) setTrips(data.trips);
        setSavingTemplateFor(null);
        setRenamingTemplate(null);
        setStartingFrom(null);
        if (reload) onSwitched?.();
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [loadTemplates, onSwitched],
  );

  const act = useCallback(
    async (
      action: string,
      payload: { id?: string; name?: string; client?: string; advisor?: string; autoReminders?: boolean } = {},
      reload = false,
    ) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/account/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "That did not work. Try again.");
          return;
        }
        setTrips(data.trips);
        setRenaming(null);
        setClientFor(null);
        setAdvisorFor(null);
        if (reload) onSwitched?.();
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [onSwitched],
  );

  /**
   * Open an itinerary from the index. Make it the active trip first (awaited, so
   * the planner reloads the right one and not the one that was active a moment
   * ago), then hand off to the parent to drill in. Without onOpen this is the
   * plain inline switch it always was.
   */
  const openTrip = useCallback(
    async (id: string) => {
      if (onOpen) {
        await act("switch", { id }, false);
        onOpen(id);
      } else {
        void act("switch", { id }, true);
      }
    },
    [onOpen, act],
  );

  // Copy the code (or the link) and flash "Copied!" on that one control.
  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => undefined);
  }, []);

  // Not signed in, or the account store is not connected. Say nothing.
  if (!trips) return null;

  const active = trips.find((t) => t.active);

  return (
    <section className="mt-6 border border-[var(--gold-light)] bg-[#fcfaf6] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
            {onOpen ? "Your itineraries" : "Your trips"}
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--navy)]">
            {onOpen ? "All itineraries" : (active?.name ?? "My trip")}
          </h3>
        </div>
        <button type="button" disabled={busy} onClick={() => void act("create", {}, true)} className={smallButton}>
          {onOpen ? "New itinerary" : "Start another trip"}
        </button>
      </div>

      <p className="mt-2 text-sm leading-6 text-stone-600">
        {onOpen
          ? "Press an itinerary to open and edit it. The others are kept exactly as you left them."
          : "Everything you plan below belongs to the trip that is open. The others are kept exactly as you left them."}
      </p>

      <ul className="mt-4 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
        {trips.map((trip) => (
          <li key={trip.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              {renaming === trip.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("rename", { id: trip.id, name: draftName }, trip.active);
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    aria-label="Trip name"
                    autoFocus
                    className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                  />
                  <button type="submit" disabled={busy} className={smallButton}>
                    Save
                  </button>
                  <button type="button" onClick={() => setRenaming(null)} className={smallButton}>
                    Cancel
                  </button>
                </form>
              ) : clientFor === trip.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("client", { id: trip.id, client: draftClient });
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    value={draftClient}
                    onChange={(e) => setDraftClient(e.target.value)}
                    aria-label="Who this trip is for"
                    placeholder="The Friedman family"
                    maxLength={60}
                    autoFocus
                    className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                  />
                  <button type="submit" disabled={busy} className={smallButton}>
                    Save
                  </button>
                  <button type="button" onClick={() => setClientFor(null)} className={smallButton}>
                    Cancel
                  </button>
                </form>
              ) : advisorFor === trip.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("advisor", { id: trip.id, advisor: draftAdvisor });
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    value={draftAdvisor}
                    onChange={(e) => setDraftAdvisor(e.target.value)}
                    aria-label="The advisor on this trip"
                    placeholder="Sarah Klein"
                    maxLength={60}
                    autoFocus
                    className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                  />
                  <button type="submit" disabled={busy} className={smallButton}>
                    Save
                  </button>
                  <button type="button" onClick={() => setAdvisorFor(null)} className={smallButton}>
                    Cancel
                  </button>
                </form>
              ) : savingTemplateFor === trip.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void templateAct("save", { tripId: trip.id, name: templateDraftName });
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    value={templateDraftName}
                    onChange={(e) => setTemplateDraftName(e.target.value)}
                    aria-label="Template name"
                    placeholder="Rome, four days, family of five"
                    maxLength={80}
                    autoFocus
                    className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                  />
                  <button type="submit" disabled={busy} className={smallButton}>
                    Save
                  </button>
                  <button type="button" onClick={() => setSavingTemplateFor(null)} className={smallButton}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
              {/* THE NAME IS A HEADING THAT HAPPENS TO BE PRESSABLE, not a
                  link among links. Underlined in gold at rest, beside an
                  underlined client line and an underlined meta line, every
                  row read as a paragraph of links and none of them looked
                  more important than the others — so the trip's own name,
                  which is the thing you are picking, did not stand out from
                  the small print under it. Bigger, not underlined until you
                  reach for it, and Open is still the explicit way in. */}
              <p className="text-base font-semibold text-[var(--navy)]">
                {onOpen ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openTrip(trip.id)}
                        className="text-left text-[var(--navy)] underline decoration-transparent decoration-2 underline-offset-4 transition hover:decoration-[var(--gold)] disabled:opacity-50"
                      >
                        {trip.name}
                      </button>
                    ) : (
                      trip.name
                    )}
                    {trip.active && !onOpen && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">Open</span>
                    )}
                  </p>
                  {trip.client && (
                    <p className="text-xs font-semibold text-[var(--gold-ink)]">For {trip.client}</p>
                  )}
                  {trip.advisor && (
                    <p className="text-xs text-stone-500">Advisor: {trip.advisor}</p>
                  )}
              {/* THE DATES LEAD, AND USED NOT TO BE HERE AT ALL. The line
                  read "3 stops · 8 days · in 2 months · 5 saved · client code
                  created" — five facts, and the one an advisor picks a trip
                  out of a list by was not among them. See tripRowMeta. */}
              <p className="text-xs text-stone-500">
                {tripRowMeta(trip, countdownPhrase(tripProgress({ startDate: trip.startDate, endDate: trip.endDate, today })))}
              </p>
                </>
              )}
            </div>

            {renaming !== trip.id && clientFor !== trip.id && advisorFor !== trip.id && savingTemplateFor !== trip.id && (
              <div className="flex flex-wrap gap-2">
                {(onOpen || !trip.active) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openTrip(trip.id)}
                    className={
                      onOpen
                        ? "min-h-[36px] border border-[var(--navy)] bg-[var(--navy)] px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-50"
                        : smallButton
                    }
                  >
                    Open
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(trip.id);
                    setDraftName(trip.name);
                  }}
                  className={smallButton}
                >
                  Rename
                </button>
                {mayServeClients && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setClientFor(trip.id);
                      setDraftClient(trip.client);
                    }}
                    className={smallButton}
                  >
                    {trip.client ? "Change who it is for" : "Who it is for"}
                  </button>
                )}
                {mayServeClients && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAdvisorFor(trip.id);
                      setDraftAdvisor(trip.advisor);
                    }}
                    className={smallButton}
                  >
                    {trip.advisor ? "Change advisor" : "Advisor"}
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => void act("duplicate", { id: trip.id })} className={smallButton}>
                  Make a copy
                </button>
                {mayUseTemplates && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSavingTemplateFor(trip.id);
                      setTemplateDraftName(trip.name);
                    }}
                    className={smallButton}
                  >
                    Save as template
                  </button>
                )}
                {trips.length > 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete “${trip.name}”? Everything planned in it goes with it.`)) {
                        void act("delete", { id: trip.id }, trip.active);
                      }
                    }}
                    className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}

            {/* The client's per-trip code — Advisor Starter and up, one code
                per trip. Send the client the code and they enter it on the
                app's front page; the link is the same thing pre-opened.
                Either opens THIS trip as the app on the client's phone, no
                account needed. Other trips are never reachable from it. */}
            {mayServeClients && renaming !== trip.id && clientFor !== trip.id && advisorFor !== trip.id && (
              <div className="mt-1 w-full">
                {trip.shareId ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">Client code</span>
                      <input
                        readOnly
                        value={trip.shareId}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-xs font-semibold tracking-[0.14em] text-[var(--navy)]"
                      />
                      <button type="button" onClick={() => copy(`${trip.id}-code`, trip.shareId!)} className={smallButton}>
                        {copied === `${trip.id}-code` ? "Copied!" : "Copy code"}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500">or link</span>
                      <input
                        readOnly
                        value={`${origin}/i/${trip.shareId}/app`}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-md border border-[var(--gold-light)] bg-white px-3 py-2 text-xs text-[var(--navy)]"
                      />
                      <button type="button" onClick={() => copy(`${trip.id}-link`, `${origin}/i/${trip.shareId}/app`)} className={smallButton}>
                        {copied === `${trip.id}-link` ? "Copied!" : "Copy link"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => void act("unshare", { id: trip.id })} className={smallButton}>
                        Stop
                      </button>
                    </div>
                    <p className="text-[11px] leading-4 text-stone-500">
                      Send your client the code — they enter it on the app&rsquo;s front page — or the link, which opens their trip directly.
                    </p>
                  </div>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void act("share", { id: trip.id })} className={smallButton}>
                    Create a client code
                  </button>
                )}
              </div>
            )}

            {/* Automatic reminders into the same chat thread the client code
                opens — off by default, and only offered once there is
                somewhere to send one. See lib/trip-reminders.ts for what
                these actually say and when they fire. */}
            {mayServeClients && trip.shareId && renaming !== trip.id && clientFor !== trip.id && advisorFor !== trip.id && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("auto-reminders", { id: trip.id, autoReminders: !trip.autoReminders })}
                  className={smallButton}
                >
                  {trip.autoReminders ? "Automatic reminders: on" : "Turn on automatic reminders"}
                </button>
                {trip.autoReminders && (
                  <span className="text-[11px] leading-4 text-stone-500">
                    Sends &ldquo;leaving soon&rdquo; and &ldquo;balance due&rdquo; messages to the client on their own, each once.
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Trip shapes the advisor has saved for reuse — separate from the
          trips themselves, and only shown once there is at least one. */}
      {templates && templates.length > 0 && (
        <div className="mt-6 border-t border-[var(--gold-light)] pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">Your templates</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Saved from a trip, with no client on it — start a new trip from one whenever you need the same shape again.
          </p>
          <ul className="mt-3 divide-y divide-[var(--gold-light)] border-t border-[var(--gold-light)]">
            {templates.map((tpl) => (
              <li key={tpl.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  {renamingTemplate === tpl.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void templateAct("rename", { id: tpl.id, name: templateRenameDraft });
                      }}
                      className="flex flex-wrap gap-2"
                    >
                      <input
                        value={templateRenameDraft}
                        onChange={(e) => setTemplateRenameDraft(e.target.value)}
                        aria-label="Template name"
                        autoFocus
                        className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                      />
                      <button type="submit" disabled={busy} className={smallButton}>
                        Save
                      </button>
                      <button type="button" onClick={() => setRenamingTemplate(null)} className={smallButton}>
                        Cancel
                      </button>
                    </form>
                  ) : startingFrom === tpl.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void templateAct("start", { id: tpl.id, name: startDraftName, startDate: startDraftDate }, true);
                      }}
                      className="flex flex-wrap gap-2"
                    >
                      <input
                        value={startDraftName}
                        onChange={(e) => setStartDraftName(e.target.value)}
                        aria-label="New trip name"
                        placeholder="The Friedman family"
                        maxLength={80}
                        autoFocus
                        className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                      />
                      <input
                        type="date"
                        value={startDraftDate}
                        onChange={(e) => setStartDraftDate(e.target.value)}
                        aria-label="Start date"
                        required
                        className="min-h-[36px] rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none"
                      />
                      <button type="submit" disabled={busy} className={smallButton}>
                        Start
                      </button>
                      <button type="button" onClick={() => setStartingFrom(null)} className={smallButton}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <p className="font-semibold text-[var(--navy)]">{tpl.name}</p>
                  )}
                </div>
                {renamingTemplate !== tpl.id && startingFrom !== tpl.id && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setStartingFrom(tpl.id);
                        setStartDraftName(tpl.name);
                        setStartDraftDate("");
                      }}
                      className={smallButton}
                    >
                      Start a trip from this
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRenamingTemplate(tpl.id);
                        setTemplateRenameDraft(tpl.name);
                      }}
                      className={smallButton}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Delete the template “${tpl.name}”? This does not touch any trip already started from it.`)) {
                          void templateAct("delete", { id: tpl.id });
                        }
                      }}
                      className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}
