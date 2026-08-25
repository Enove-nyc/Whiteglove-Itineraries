"use client";

/**
 * The White Glove app — a trip in your pocket.
 *
 * A faithful build of the mobile design: a day at a time, a travel wallet kept
 * on the phone for when there is no signal, and an advisor thread. Two sides
 * to stand on, the traveller's and the advisor's.
 *
 * ALL OF ITS CONTENT IS A PROP. It takes a CompanionTrip and renders it; the
 * demo Rome week is only the default. When a Business account's own itinerary
 * is handed in — built from lib/account-store.ts — nothing here changes but
 * the data.
 *
 * KOSHER AND SHABBOS CONTENT IS OFF UNTIL AN ACCOUNT TURNS IT ON. A settings
 * switch on the account page (components/companion/CompanionSettings.tsx,
 * AppPrefs.kosherFeatures) decides whether a real trip's candle-lighting,
 * Shabbos notes and nearby kosher listings (lib/companion-build.ts) are ever
 * worked out at all — off, the app is a plain itinerary tool, full stop. On,
 * they show inside the You tab's Guide section, alongside whatever practical
 * notes the advisor wrote by hand — never as a tab of their own, so the
 * bottom nav stays at four either way. The demo trip (data/companion-demo.ts)
 * always tells the Rome showcase in its own voice, kosher details included,
 * because it is hand-written marketing copy for a real destination rather
 * than a real account's data — but nothing a real trip renders comes from
 * that file, and lib/companion-trip.ts (the only place a real itinerary
 * becomes a CompanionTrip) never invents any.
 *
 * THE STATE IS THE WHOLE POINT OF THE DESIGN. Open the rain notice, pick one of
 * the two afternoons, and the day, the chat and the notice all move together —
 * because they are all read off one piece of state, the way the real thing has
 * to be.
 */

import { Fragment, type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANION_DEMO_TRIP,
  COMPANION_KIND,
  type CompanionItem,
  type CompanionPayment,
  type CompanionTrip,
  type CompanionWalletRow,
} from "@/data/companion-demo";
import { Icon } from "@/components/icons/Icon";
import PaymentCheckout from "@/components/companion/PaymentCheckout";
import { useDeviceClock } from "@/components/TripProgressStrip";
import { followAlong, type FollowStop } from "@/lib/trip-progress";

/** The blue the app already uses for its own accents — map notes, the
 * initials avatar, kickers. The chat toolbar's icons match it rather than
 * showing as whatever color the device's native emoji happen to render in. */
const ICON_BLUE = "#1f3f5c";

type Screen = "home" | "day" | "activity" | "chat" | "messages" | "alerts" | "wallet" | "profile" | "pay";
type ChatSide = "client" | "advisor";
/** The live thread on this trip — present once the trip has been shared. */
export type CompanionChat = { shareId: string; side: ChatSide; advisorName: string };
type Mode = "concierge" | "guide";
type Role = "traveler" | "advisor";
type SwapId = "a" | "b";

type State = {
  screen: Screen;
  prev: Screen | null;
  selDay: number;
  actIdx: number;
  actDay: number;
  pick: SwapId | null;
  swap: SwapId | null;
  draft: string;
  typing: boolean;
  // A day or activity tapped through "Ask about this" — carried into the
  // real thread as a small reference, then cleared once picked up, rather
  // than opening a second, separate conversation.
  chatSubject: string | null;
  tmode: Mode;
  role: Role;
  messages: { from: "them" | "me"; text: string }[];
};

const GOLD = "#b78a4a";
const CREAM = "#f7f5f0";

/** A decorated timeline item — the palette folded in, ready to render. */
type DecItem = CompanionItem & {
  dot: string;
  tint: string;
  kindLabel: string;
  kindFg: string;
};

const WALLET_ATTACH_LABEL: Record<NonNullable<CompanionWalletRow["stopKind"]>, string> = {
  flight: "+ Add a boarding pass",
  lodging: "+ Add a booking confirmation",
  activity: "+ Add an entry ticket",
};
const WALLET_ATTACH_KIND: Record<NonNullable<CompanionWalletRow["stopKind"]>, string> = {
  flight: "boarding-pass",
  lodging: "booking",
  activity: "ticket",
};

/**
 * The advisor's "add a boarding pass or ticket" control on one wallet row.
 *
 * Uploads through /api/account/attachments — the same private, owner-checked
 * store the itinerary builder already uses — then reads the trip's itinerary
 * back, attaches the reference to the one stop this row came from, and saves.
 * The same read-modify-write /api/account/itinerary already supports.
 */
function WalletAttach({
  tripId,
  row,
  onSaved,
}: {
  tripId: string;
  row: CompanionWalletRow;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const stopKind = row.stopKind!;
  const inputId = `wallet-attach-${row.id}`;

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });

      const up = await fetch("/api/account/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          kind: WALLET_ATTACH_KIND[stopKind],
          dataUrl,
          existingCount: row.attachments?.length ?? 0,
        }),
      });
      const upData = (await up.json().catch(() => null)) as { attachment?: { id: string }; error?: string } | null;
      if (!up.ok || !upData?.attachment) {
        setError(upData?.error ?? "Could not keep that file.");
        return;
      }

      const key = stopKind === "flight" ? "flights" : stopKind === "lodging" ? "lodging" : "activities";
      const got = await fetch(`/api/account/itinerary?trip=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const gotData = (await got.json().catch(() => null)) as { itinerary?: Record<string, unknown> } | null;
      const itinerary = gotData?.itinerary;
      const rows = itinerary?.[key];
      if (!itinerary || !Array.isArray(rows)) {
        setError("Could not find that stop to attach it to.");
        return;
      }
      const stop = (rows as Array<{ id: string; attachments?: unknown[] }>).find((r) => r.id === row.id);
      if (!stop) {
        setError("That stop is no longer on the trip.");
        return;
      }
      stop.attachments = [...(stop.attachments ?? []), upData.attachment];

      const saved = await fetch("/api/account/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary, tripId }),
      });
      if (!saved.ok) {
        setError("Kept the file, but could not save it to the trip.");
        return;
      }
      onSaved();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        style={{ display: "none" }}
      />
      <label
        htmlFor={inputId}
        style={{
          cursor: busy ? "default" : "pointer",
          fontSize: 12.5,
          fontWeight: 600,
          color: busy ? "#a8a29e" : "#1f3f5c",
          textDecoration: "underline",
        }}
      >
        {busy ? "Keeping it…" : WALLET_ATTACH_LABEL[stopKind]}
      </label>
      {error && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#b42318" }}>{error}</p>}
    </div>
  );
}

/**
 * The advisor's practical note for one day of the Guide tab — the side door,
 * where to eat, where to park. Never kosher or Shabbos content; that layer
 * was removed from the app outright.
 *
 * Same read-modify-write as WalletAttach, against Itinerary.guideNotes
 * instead of a stop's attachments — the file the itinerary builder itself
 * would save if it had a place to type this in, which it does not yet.
 */
function GuideNoteEdit({
  tripId,
  date,
  note,
  onSaved,
}: {
  tripId: string;
  date: string;
  note: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const got = await fetch(`/api/account/itinerary?trip=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const gotData = (await got.json().catch(() => null)) as { itinerary?: Record<string, unknown> } | null;
      const itinerary = gotData?.itinerary;
      if (!itinerary) {
        setError("Could not reach this trip.");
        return;
      }
      const notes = { ...((itinerary.guideNotes as Record<string, string> | undefined) ?? {}) };
      const trimmed = text.trim();
      if (trimmed) notes[date] = trimmed;
      else delete notes[date];
      itinerary.guideNotes = notes;

      const saved = await fetch("/api/account/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary, tripId }),
      });
      if (!saved.ok) {
        setError("Could not save that note.");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setText(note);
          setEditing(true);
        }}
        style={{ alignSelf: "flex-start", border: 0, background: "none", cursor: "pointer", padding: 0, fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
      >
        {note ? "Edit this note" : "+ Add a note for this day"}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Enter through the side door, table held at one o'clock, park at the lot on Via del…"
        style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter,sans-serif", fontSize: 13.5, lineHeight: 1.5, color: "#26323a", outline: "none", resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => void save()} disabled={busy} className="wg-press" style={{ border: 0, cursor: "pointer", background: GOLD, color: CREAM, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} disabled={busy} style={{ border: "1px solid rgba(38,50,58,.16)", background: "none", cursor: "pointer", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "#57534e" }}>
          Cancel
        </button>
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: "#b42318" }}>{error}</p>}
    </div>
  );
}

/**
 * The Pay screen — re-fetches live numbers before showing anything, rather
 * than trusting trip.payment as of when the page was rendered. A traveler
 * could have paid from another device, or the planner could have changed
 * the balance, since this page loaded.
 */
function PayScreen({ shareId }: { shareId: string }) {
  const [payment, setPayment] = useState<(CompanionPayment & { publishableKey: string }) | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/pay/${shareId}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !data?.available) {
          setError("This trip's balance isn't available right now.");
          return;
        }
        setPayment(data);
      } catch {
        if (active) setError("Could not reach the payment service.");
      }
    })();
    return () => {
      active = false;
    };
  }, [shareId]);

  if (error) return <p style={{ margin: "16px 16px 0", fontSize: 13.5, color: "#b42318" }}>{error}</p>;
  if (!payment) {
    return (
      <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "#78716c" }}>Your share</p>
        <p style={{ margin: 0, font: "400 26px/1.2 Georgia,'Times New Roman',serif", color: "#0b2437" }}>Loading…</p>
      </div>
    );
  }
  if (!payment.canPay) {
    return (
      <p style={{ margin: "16px 16px 0", fontSize: 13.5, lineHeight: 1.5, color: "#57534e" }}>
        {payment.remainingCents <= 0 ? "This is paid in full — thank you." : "This trip isn't set up to take a payment right now. Message your advisor if you'd like to pay."}
      </p>
    );
  }
  return (
    <div style={{ padding: "16px 16px 24px" }}>
      <PaymentCheckout payment={payment} publishableKey={payment.publishableKey} onDone={() => window.location.reload()} />
    </div>
  );
}

export default function CompanionApp({
  trip = COMPANION_DEMO_TRIP,
  chat,
  advisorInbox = false,
  sharedDraft,
}: {
  trip?: CompanionTrip;
  chat?: CompanionChat;
  /** The advisor's own side: a Messages tab that lists every client's chat. */
  advisorInbox?: boolean;
  /** A place shared in from outside the app — Google Maps' share sheet, say
   *  — arrived as the OS's Web Share Target params (app/manifest.ts). Held
   *  until the advisor picks which client's thread it goes into. */
  sharedDraft?: string;
}) {
  const router = useRouter();
  const liveChat = chat ?? null;
  // A client on a per-trip code, as opposed to whoever is signed into the
  // account that owns the trip (an advisor, or a Gold member on their own).
  // Attachments are served only to the owning account (lib/attachments.ts),
  // so a client link could never open one anyway — the wallet's "add" control
  // is only ever offered to the side that can actually use it.
  const isClientViewer = liveChat?.side === "client";
  const hasMessages = Boolean(liveChat) || advisorInbox;
  // Held until the advisor opens a client's thread to put it in — cleared the
  // moment that happens, so going back to the inbox and opening someone else
  // afterward doesn't carry the same shared place along with it.
  const [pendingShare, setPendingShare] = useState(sharedDraft ?? null);
  const [st, setSt] = useState<State>({
    // A shared-in place has nowhere to go but the Messages/Advisor tab, so
    // that's where a shared draft opens straight to — otherwise it would sit
    // unused on the Trip tab until noticed.
    screen: sharedDraft && advisorInbox ? "messages" : "home",
    prev: null,
    selDay: trip.todayIndex,
    actIdx: 0,
    actDay: trip.todayIndex,
    pick: null,
    swap: null,
    draft: "",
    typing: false,
    chatSubject: null,
    tmode: trip.concierge ? "concierge" : "guide",
    role: "traveler",
    messages: trip.messages ?? [],
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Whether the real thread has something this side has not seen yet — read
  // with ?peek=1 so merely checking never marks it read, the way it would if
  // this used the same call the open thread itself polls with.
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!liveChat) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(`/api/companion/chat?share=${encodeURIComponent(liveChat!.shareId)}&peek=1`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        const messages: { at: string; from: ChatSide }[] = Array.isArray(d.messages) ? d.messages : [];
        const latest = messages[messages.length - 1];
        const myRead: string | undefined = d.readMarkers?.[liveChat!.side];
        if (!cancelled) setUnread(Boolean(latest && latest.from !== liveChat!.side && (!myRead || myRead < latest.at)));
      } catch {
        /* leave the badge as it was */
      }
    }
    void poll();
    const t = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [liveChat]);

  const advisor = trip.advisorName;
  const firstName = advisor.split(" ")[0];
  // The place, for the guide card — "The Cohens · Rome" → "Rome".
  const placeName = trip.homeTitle.includes("·")
    ? trip.homeTitle.split("·").pop()!.trim()
    : trip.homeTitle;

  // The days, with the today swap applied to its swappable item.
  const days = trip.days.map((d, i) => {
    if (i !== trip.todayIndex || !st.swap || !trip.swaps) return d;
    const swapped = trip.swaps[st.swap].item;
    return { ...d, items: d.items.map((it) => (it.swappable ? swapped : it)) };
  });

  function go(screen: Screen) {
    setSt((s) => ({ ...s, screen, prev: s.screen }));
  }
  function back() {
    setSt((s) => ({ ...s, screen: s.prev && s.prev !== s.screen ? s.prev : "home", prev: null }));
  }

  function send(text?: string) {
    const t = (text ?? st.draft).trim();
    if (!t) return;
    setSt((s) => ({ ...s, messages: [...s.messages, { from: "me", text: t }], draft: "", typing: true }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSt((s) => ({
        ...s,
        typing: false,
        messages: [
          ...s.messages,
          { from: "them", text: "On it — give me five minutes and I will come back with something held rather than something to check." },
        ],
      }));
    }, 1600);
  }

  function decorate(it: CompanionItem): DecItem {
    const k = COMPANION_KIND[it.kind] || COMPANION_KIND.rest;
    return { ...it, dot: k.dot, tint: k.tint, kindLabel: k.label, kindFg: k.fg };
  }

  const hasConcierge = trip.concierge;
  const isConcierge = hasConcierge && st.tmode === "concierge";
  const isGuideMode = !isConcierge;
  /**
   * A REAL advisor thread exists (hasMessages), as opposed to the showcase's
   * scripted stand-in. In concierge mode this is the whole point of the mode
   * — "somebody is holding this trip for you" — so once it is real, every
   * door that used to open the SCRIPTED demo (the "Concierge" tab, "Ask to
   * move this", "Ask about this day") opens the real thread instead. Without
   * this, a client on a genuine shared trip typed into a conversation that
   * went nowhere, which read as the whole feature being broken.
   */
  const usesRealChat = hasMessages;
  const sel = days[st.selDay];
  const items = sel.items.map(decorate);

  /**
   * Where the traveler actually is on today's plan, by the clock on their own
   * device — not "the first thing on the list", which is only ever true
   * before the day has started. See lib/trip-progress.ts, already used the
   * same way for the advisor's live planner view (TripProgressStrip); this is
   * that same real logic, reused rather than re-guessed, for the client's own
   * app. Only computed for the day that IS today — a browsed future or past
   * day has no "now" on it.
   */
  const { nowMinutes } = useDeviceClock();
  const followStops: FollowStop[] = items.map((it, i) => ({ id: String(i), name: it.title, arrivalTime: it.time || undefined }));
  const follow = sel.today ? followAlong({ stops: followStops, nowMinutes }) : null;
  const nowIdx = follow?.now ? Number(follow.now.id) : null;
  const nextIdx = follow?.next ? Number(follow.next.id) : null;
  const hasSwap = Boolean(trip.swaps);
  const open = hasSwap && !st.swap; // an open weather alert waiting on a decision
  const settled = hasSwap && Boolean(st.swap); // one was picked
  const handledSteps = trip.handledSteps ?? [];
  // Real flight-status alerts (data/trip-alerts.ts) — never present on the
  // demo, which tells its own scripted weather-swap story via `open` above
  // instead. Kept separate from `open` rather than folded into it, so a real
  // trip's badge/pill lights up for these without touching any of the
  // demo-only swap logic that already reads `open`.
  const liveAlerts = trip.liveAlerts ?? [];
  const unacknowledgedAlerts = liveAlerts.filter((a) => !a.acknowledged);
  const advisorTrips = trip.advisorTrips ?? [];
  const advisorHome = hasConcierge && st.role === "advisor" && st.screen === "home";

  const titles: Record<Screen, string> = {
    home: trip.homeTitle,
    day: sel.name,
    activity: "On the day",
    chat: advisor,
    messages: advisorInbox ? "Messages" : liveChat ? (liveChat.side === "advisor" ? "Your client" : liveChat.advisorName) : "Advisor",
    alerts: "Changes",
    wallet: "Travel wallet",
    profile: "You",
    pay: "Trip balance",
  };
  const kickers: Record<Screen, string> = {
    home: trip.homeKicker,
    day: `Day ${st.selDay + 1} of ${trip.days.length}`,
    activity: sel.name,
    chat: hasConcierge || usesRealChat ? "Your advisor" : "On your own",
    messages: advisorInbox ? "Your clients" : liveChat?.side === "advisor" ? "Their trip, and yours to move" : "Your advisor · replies when they can",
    alerts: open ? "One needs you" : unacknowledgedAlerts.length > 0 ? `${unacknowledgedAlerts.length} to see` : settled ? "All settled" : "Nothing right now",
    wallet: "Kept offline",
    profile: hasConcierge ? "The trip is in your name" : "This trip, and you",
    pay: trip.payment?.label ?? "",
  };

  const act = days[st.actDay].items[st.actIdx] || days[st.actDay].items[0];
  const actKind = COMPANION_KIND[act.kind] || COMPANION_KIND.rest;

  const seg = <T extends string>(list: [T, string][], cur: T, set: (id: T) => void) =>
    list.map(([id, label]) => ({
      id,
      label,
      bg: cur === id ? GOLD : "transparent",
      fg: cur === id ? CREAM : "#57534e",
      pick: () => set(id),
    }));

  const tmodeOpts = seg<Mode>(
    [["concierge", "Concierge"], ["guide", "Guide"]],
    st.tmode,
    (id) => setSt((s) => ({ ...s, tmode: id })),
  );
  const roleOpts = seg<Role>(
    [["traveler", "Traveler"], ["advisor", "Advisor"]],
    st.role,
    (id) => setSt((s) => ({ ...s, role: id })),
  );

  const confirmSwap = () => {
    if (!st.pick || !trip.swaps) return;
    const p = st.pick;
    const reply = trip.swaps[p].reply;
    setSt((s) => ({
      ...s,
      swap: p,
      screen: "day",
      prev: "alerts",
      selDay: trip.todayIndex,
      messages: [
        ...s.messages,
        { from: "me", text: p === "a" ? "Thursday morning works for us." : "Let's do Palazzo Massimo." },
        { from: "them", text: reply },
      ],
    }));
  };

  const openActivity = (di: number, i: number) =>
    setSt((s) => ({ ...s, screen: "activity", prev: s.screen, actIdx: i, actDay: di }));

  // Concierge mode's tab opens the real thread the moment one exists, so
  // there is only ever one door to "talk to your advisor" rather than a real
  // one and a dead scripted one side by side. This "Guide/Concierge" tab is
  // the showcase's own — kosher and Shabbos content, hasConcierge only.
  const conciergeTabScreen: Screen = !isGuideMode && usesRealChat ? "messages" : "chat";
  // The bottom nav is capped at four on a real trip — Trip, Advisor, Wallet,
  // You — so a real trip's Guide notes live inside the You tab (see
  // guideSection below) rather than getting a tab of their own.
  const tabDefs: [Screen, string][] = [["home", "Trip"]];
  if (hasConcierge) tabDefs.push([conciergeTabScreen, isGuideMode ? "Guide" : "Concierge"]);
  if (hasMessages && conciergeTabScreen !== "messages") tabDefs.push(["messages", advisorInbox ? "Messages" : "Advisor"]);
  tabDefs.push(["wallet", "Wallet"], ["profile", "You"]);
  const tabs = tabDefs.map(([id, label]) => {
    const on = st.screen === id || (id === "home" && (st.screen === "day" || st.screen === "activity" || st.screen === "alerts"));
    return { id, label, bg: on ? GOLD : "transparent", fg: on ? CREAM : "#57534e", badge: id === "messages" && unread && st.screen !== "messages" };
  });

  const quickReplies = (
    st.role === "advisor"
      ? ["Two options, both held", "Running twenty minutes late", "Candle-lighting is 16:52"]
      : ["Can we move the Vatican?", "Where do we eat tonight?", "Is the guide confirmed?"]
  );

  // The activity detail rows, read off the stop itself rather than invented.
  // A flight's landing time rides with When, since it is a time, not a place.
  const actRows = [
    act.time ? { label: "When", value: act.arriveNote ? `${act.time} · ${act.arriveNote}` : act.time } : null,
    act.place ? { label: "Where", value: act.place } : null,
    act.walk ? { label: "On foot", value: act.walk } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  // Directions means walking to a real place — a flight's airline reference
  // or an open/Shabbos day's empty place is not one.
  const actHasDirections = Boolean(act.place) && act.kind !== "travel";

  // ── shared bits of style ────────────────────────────────────────────────
  const serif = "Georgia,'Times New Roman',serif";
  const kicker = (color: string): CSSProperties => ({
    font: `600 10.5px/1 Inter,sans-serif`,
    letterSpacing: ".13em",
    textTransform: "uppercase",
    color,
  });

  // ── screens ─────────────────────────────────────────────────────────────
  const homeScreen = (
    <div style={{ animation: "wgIn .28s ease both" }}>
      <div style={{ position: "relative", margin: "14px 14px 0", height: 196, borderRadius: 20, overflow: "hidden", background: `linear-gradient(155deg, ${GOLD} 0%, #8f6c3a 100%)`, color: CREAM }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.22 }}>
          <Icon name="suitcase" className="h-20 w-20" strokeWidth={1.1} />
        </div>
      </div>
      <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* Skipped when it would just repeat the header above it word for
            word — a trip with no name of its own reads as "Family trip" in
            both places otherwise. */}
        {trip.tripTitle !== trip.homeTitle && (
          <h2 style={{ margin: 0, font: `400 29px/1.08 ${serif}`, letterSpacing: "-.02em" }}>{trip.tripTitle}</h2>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", fontSize: 13, color: "#57534e" }}>
          <span>{trip.tripDates}</span>
          <span style={{ width: 4, height: 4, borderRadius: 14, background: "#a8a29e" }} />
          <span style={{ background: "#e7edf1", color: "#1f3f5c", fontWeight: 600, padding: "4px 10px", borderRadius: 14, fontSize: 11.5 }}>
            {trip.tripFinished ? "Trip finished" : `Day ${trip.todayIndex + 1} of ${trip.days.length}`}
          </span>
        </div>
      </div>

      {open && (
        <div style={{ margin: "18px 14px 0", padding: "17px 18px", borderRadius: 20, background: "#f7eee0", border: "1px solid rgba(183,138,74,.28)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 14, background: GOLD, animation: "wgPulse 1.8s ease-in-out infinite" }} />
            <span style={kicker("#765321")}>Your afternoon</span>
          </div>
          <div style={{ font: `400 19px/1.2 ${serif}`, color: "#4a3016" }}>Rain from three o&apos;clock</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#5c4322", textWrap: "pretty" }}>The Pantheon and the Trevi Fountain are both open squares. {firstName} has put two ways round it — either is already held.</p>
          <button onClick={() => go("alerts")} className="wg-press" style={{ alignSelf: "flex-start", border: 0, cursor: "pointer", background: GOLD, color: CREAM, font: `400 14px/1 ${serif}`, padding: "12px 20px", borderRadius: 14 }}>See the two options</button>
        </div>
      )}
      {settled && trip.swaps && (
        <div style={{ margin: "18px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#e7edf1", border: "1px solid rgba(21,50,75,.3)", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker("#1f3f5c")}>Settled</span>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#0b2437" }}>{trip.swaps[st.swap!].reply}</div>
        </div>
      )}

      <div style={{ marginTop: 22, paddingLeft: 20 }}>
        <div style={kicker("#78716c")}>{trip.days.length === 8 ? "Eight days" : `${trip.days.length} days`}</div>
      </div>
      <div style={{ display: "flex", gap: 9, overflowX: "auto", padding: "12px 20px 4px", scrollbarWidth: "none" }}>
        {days.map((d, i) => {
          const on = i === st.selDay;
          return (
            <button key={i} onClick={() => setSt((s) => ({ ...s, selDay: i, screen: "day", prev: "home" }))} className="wg-press" style={{ flex: "none", width: 64, padding: "11px 0 12px", borderRadius: 16, border: `1px solid ${on ? GOLD : d.today ? GOLD : "rgba(38,50,58,.1)"}`, background: on ? GOLD : d.today ? "#f7eee0" : "#ffffff", color: on ? CREAM : "#26323a", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ font: "600 10px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.75 }}>{d.dow}</span>
              <span style={{ font: `400 20px/1 ${serif}` }}>{d.dom}</span>
              <span style={{ fontSize: 9.5, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 56 }}>{d.short}</span>
            </button>
          );
        })}
      </div>

      <div style={{ margin: "22px 14px 0", padding: "20px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0, font: `400 21px/1.1 ${serif}` }}>{sel.name}</h3>
          <button onClick={() => go("day")} className="wg-link" style={{ border: 0, background: "none", cursor: "pointer", font: "600 12px/1 Inter,sans-serif", color: "#765321", padding: 0 }}>Full day →</button>
        </div>
        {/* The one thing today that most needs finding fast: where the plan
            says the traveler should actually be right now, or what's next —
            worked out from the clock, not assumed to be the first row. When
            the day is fully behind them, or it isn't today, this just opens
            on the start of the list, as it always did. */}
        {items
          .map((it, i) => ({ it, i }))
          .slice(sel.today ? (nowIdx ?? nextIdx ?? 0) : 0, (sel.today ? (nowIdx ?? nextIdx ?? 0) : 0) + 3)
          .map(({ it, i }) => {
          const isNow = Boolean(sel.today) && i === nowIdx;
          const isNext = Boolean(sel.today) && i === nextIdx;
          const highlight = isNow || isNext;
          return (
            <button
              key={i}
              onClick={() => openActivity(st.selDay, i)}
              className="wg-fade"
              style={{
                textAlign: "left",
                border: highlight ? `1px solid ${GOLD}` : 0,
                background: highlight ? "#f7eee0" : "none",
                borderRadius: highlight ? 16 : 0,
                padding: highlight ? "15px 16px" : 0,
                cursor: "pointer",
                display: "flex",
                gap: 13,
                alignItems: "flex-start",
              }}
            >
              <span style={{ flex: "none", width: 52, font: `600 ${highlight ? 13.5 : 12.5}px/1.5 ui-monospace,Menlo,monospace`, color: highlight ? "#765321" : "#78716c", paddingTop: 2 }}>{it.time}</span>
              <span style={{ flex: "none", width: 9, height: 9, borderRadius: 14, background: it.dot, marginTop: 6 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                {highlight && <span style={{ ...kicker("#765321"), marginBottom: 1 }}>{isNow ? "Happening now" : "Next up"}</span>}
                <span style={{ fontSize: highlight ? 17 : 15, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
                <span style={{ fontSize: 12.5, color: "#78716c" }}>{it.place}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Money due gets one prominent card on the home screen, not a tab of
          its own — see the file note at the top. It disappears the moment
          nothing is owed, so a paid-up traveler never sees it dominate the
          app again. */}
      {trip.payment && trip.payment.remainingCents > 0 && (
        <div style={{ margin: "14px 14px 0", padding: "17px 18px", borderRadius: 20, background: "#f7eee0", border: "1px solid rgba(183,138,74,.28)", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={kicker("#765321")}>Balance due</span>
          <div style={{ font: `400 22px/1.15 ${serif}`, color: "#4a3016" }}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: trip.payment.currency }).format(
              (trip.payment.nextDue ? Math.min(trip.payment.nextDue.amountCents, trip.payment.remainingCents) : trip.payment.remainingCents) / 100,
            )}
            {trip.payment.nextDue?.dueDate && <span style={{ font: "600 13px/1 Inter,sans-serif", color: "#765321" }}> · Due {trip.payment.nextDue.dueDate}</span>}
          </div>
          <button onClick={() => go("pay")} className="wg-press" style={{ alignSelf: "flex-start", border: 0, cursor: "pointer", background: GOLD, color: CREAM, font: `400 14px/1 ${serif}`, padding: "12px 20px", borderRadius: 14 }}>
            Pay now
          </button>
        </div>
      )}

      {trip.kosherTitle && (
        <div style={{ margin: "14px 14px 0", padding: 18, borderRadius: 20, background: "#e7edf1", display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={kicker("#1f3f5c")}>Eating today</span>
          <div style={{ font: `400 17px/1.2 ${serif}`, color: "#0b2437" }}>{trip.kosherTitle}</div>
          {trip.kosherNote && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#0b2437", textWrap: "pretty" }}>{trip.kosherNote}</p>}
        </div>
      )}

      {isConcierge && (
        <div style={{ margin: "14px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#ece8df", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "repeating-linear-gradient(135deg,#ece8df 0 7px,#ffffff 7px 14px)" }} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{advisor}</span>
            <span style={{ fontSize: 12, color: "#57534e" }}>Your advisor · replies in minutes</span>
          </div>
          <button onClick={() => go(usesRealChat ? "messages" : "chat")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: "#26323a" }}>Message</button>
        </div>
      )}
      {/* "On your own" is only true without a real advisor thread — with one,
          the liveChat card below already offers the right door to it, and
          telling a client with a live advisor they are on their own would
          contradict it. Only the showcase (hasConcierge) has a Guide to open
          — a wired trip has nothing behind that door any more. */}
      {hasConcierge && isGuideMode && !usesRealChat && (
        <div style={{ margin: "14px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#ece8df", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "#e7edf1", display: "flex", alignItems: "center", justifyContent: "center", font: `400 20px/1 ${serif}`, color: "#1f3f5c" }}>{placeName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{placeName}, on your own</span>
            <span style={{ fontSize: 12, color: "#57534e" }}>Kosher, Shabbos and the sights nearby</span>
          </div>
          <button onClick={() => go("chat")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: "#26323a" }}>Open guide</button>
        </div>
      )}
      {advisorInbox && (
        <div style={{ margin: "14px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#ece8df", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", font: `400 20px/1 ${serif}`, color: "#765321" }}>❝</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Your clients</span>
            <span style={{ fontSize: 12, color: "#57534e" }}>Every trip you have shared, in one place</span>
          </div>
          <button onClick={() => go("messages")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: "#26323a" }}>Open</button>
        </div>
      )}
      {liveChat && !advisorInbox && (
        <div style={{ margin: "14px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#ece8df", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", font: `400 20px/1 ${serif}`, color: "#765321" }}>
            {(liveChat.side === "advisor" ? trip.family : liveChat.advisorName).charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{liveChat.side === "advisor" ? trip.family : liveChat.advisorName}</span>
            <span style={{ fontSize: 12, color: "#57534e" }}>{liveChat.side === "advisor" ? "The client on this trip" : "Your advisor · message anytime"}</span>
          </div>
          <button onClick={() => go("messages")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: "#26323a" }}>Message</button>
        </div>
      )}
      {!liveChat && !advisorInbox && !hasConcierge && trip.contactName && (
        <div style={{ margin: "14px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#f7eee0", border: "1px solid rgba(183,138,74,.25)", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", font: `400 20px/1 ${serif}`, color: "#765321" }}>{trip.contactName.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{trip.contactName}</span>
            <span style={{ fontSize: 12, color: "#57534e" }}>Your advisor for this trip</span>
          </div>
        </div>
      )}
      <div style={{ height: 26 }} />
    </div>
  );

  const advisorHomeScreen = (
    <div style={{ padding: "18px 18px 28px", display: "flex", flexDirection: "column", gap: 14, animation: "wgIn .28s ease both" }}>
      <div style={{ padding: 20, borderRadius: 20, background: "#ece8df", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={kicker("#57534e")}>Tuesday 27 October</span>
        <div style={{ font: `400 26px/1.1 ${serif}` }}>Three trips in the air</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#57534e" }}>One needs you now. Two are running to plan.</p>
      </div>
      {advisorTrips.map((t, i) => (
        <div key={i} style={{ padding: 18, borderRadius: 20, background: t.bg, border: `1px solid ${t.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ font: `400 19px/1.1 ${serif}` }}>{t.family}</span>
            <span style={{ font: "600 10.5px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: t.statusFg, background: t.statusBg, padding: "6px 10px", borderRadius: 14 }}>{t.status}</span>
          </div>
          <span style={{ fontSize: 13, color: "#57534e" }}>{t.where}</span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#26323a", textWrap: "pretty" }}>{t.line}</p>
          {t.action && (
            <button onClick={() => t.go && go(t.go)} className="wg-press" style={{ alignSelf: "flex-start", border: 0, cursor: "pointer", background: GOLD, color: CREAM, font: `400 13.5px/1 ${serif}`, padding: "11px 18px", borderRadius: 14 }}>{t.action}</button>
          )}
        </div>
      ))}
    </div>
  );

  const railView = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((it, i) => {
        const isNow = Boolean(sel.today) && i === nowIdx;
        const isNext = Boolean(sel.today) && i === nextIdx;
        // Behind them, by the clock — shown a little quieter, never hidden:
        // a stop that already happened is still worth tapping back into.
        const isDone = Boolean(sel.today) && nowMinutes !== null && follow?.done.some((d) => d.id === String(i));
        return (
          <div key={i} style={{ display: "flex", gap: 12, opacity: isDone ? 0.55 : 1 }}>
            <div style={{ flex: "none", width: 54, paddingTop: 3, textAlign: "right", font: `600 12.5px/1.4 ui-monospace,Menlo,monospace`, color: isNow ? "#765321" : "#78716c" }}>{it.time}</div>
            <div style={{ flex: "none", width: 11, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 11, height: 11, borderRadius: 14, background: isNow ? GOLD : it.dot, marginTop: 5 }} />
              <span style={{ flex: 1, width: 1.5, background: "rgba(38,50,58,.14)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => openActivity(st.selDay, i)}
                className="wg-warm"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border: isNow ? `1px solid ${GOLD}` : "1px solid rgba(38,50,58,.09)",
                  background: isNow ? "#f7eee0" : "#ffffff",
                  borderRadius: 16,
                  padding: "15px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {(isNow || isNext) && <span style={{ ...kicker("#765321"), marginBottom: 1 }}>{isNow ? "Happening now" : "Next up"}</span>}
                <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>{it.title}</span>
                <span style={{ fontSize: 12.5, color: "#78716c" }}>{it.place}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>{it.note}</span>
              </button>
              {it.walk && <span style={{ font: "400 11px/1 ui-monospace,Menlo,monospace", color: "#a8a29e", paddingLeft: 2 }}>{it.walk}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  const dayScreen = (
    <div style={{ padding: "16px 18px 28px", display: "flex", flexDirection: "column", gap: 16, animation: "wgIn .28s ease both" }}>
      {(sel.weather || sel.walk) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {sel.weather && <span style={{ font: "600 11.5px/1 Inter,sans-serif", background: "#ece8df", color: "#57534e", padding: "8px 12px", borderRadius: 14 }}>{sel.weather}</span>}
          {sel.walk && <span style={{ font: "600 11.5px/1 Inter,sans-serif", background: "#ece8df", color: "#57534e", padding: "8px 12px", borderRadius: 14 }}>{sel.walk}</span>}
        </div>
      )}
      {sel.shabbosNote && (
        <div style={{ padding: "17px 18px", borderRadius: 20, background: "#e7edf1", border: "1px solid rgba(21,50,75,.32)", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker("#1f3f5c")}>{sel.shabbosLabel}</span>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#0b2437", textWrap: "pretty" }}>{sel.shabbosNote}</p>
        </div>
      )}
      {railView}
      <button
        onClick={() => {
          setSt((s) => ({ ...s, chatSubject: `Day ${st.selDay + 1} — ${sel.name}` }));
          go(usesRealChat ? "messages" : "chat");
        }}
        className="wg-warm"
        style={{ alignSelf: "flex-start", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13.5px/1 ${serif}`, padding: "12px 18px", borderRadius: 14, color: "#26323a" }}
      >
        Ask about this day
      </button>
    </div>
  );

  const activityScreen = (
    <div style={{ animation: "wgIn .28s ease both" }}>
      <div style={{ position: "relative", margin: "14px 14px 0", height: 172, borderRadius: 20, overflow: "hidden", background: actKind.tint }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: actKind.dot, opacity: 0.35 }}>
          <Icon name="map-pin" className="h-16 w-16" strokeWidth={1.1} />
        </div>
      </div>
      <div style={{ padding: "18px 20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker("#765321")}>{act.time ? `${act.time} · ${actKind.label}` : actKind.label}</span>
          <h2 style={{ margin: 0, font: `400 27px/1.08 ${serif}`, letterSpacing: "-.02em" }}>{act.title}</h2>
          <span style={{ fontSize: 13.5, color: "#57534e" }}>{act.place}</span>
        </div>
        {act.note && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "#26323a", textWrap: "pretty" }}>{act.note}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(38,50,58,.09)" }}>
          {actRows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "14px 16px", background: "#ffffff" }}>
              <span style={{ flex: "none", font: "600 11px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: "#78716c" }}>{r.label}</span>
              <span style={{ textAlign: "right", fontSize: 13.5, lineHeight: 1.4, color: "#26323a" }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          {actHasDirections && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.place)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="wg-press"
              style={{ border: 0, cursor: "pointer", background: GOLD, color: CREAM, font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Directions
            </a>
          )}
          {act.phone && (
            <a
              href={`tel:${act.phone.replace(/[^\d+]/g, "")}`}
              className="wg-warm"
              style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, color: "#26323a", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Call
            </a>
          )}
          {act.href && (
            <a
              href={act.href}
              target="_blank"
              rel="noopener noreferrer"
              className="wg-warm"
              style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, color: "#26323a", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Confirmation
            </a>
          )}
          <button
            onClick={() => {
              setSt((s) => ({ ...s, chatSubject: act.title }));
              go(usesRealChat ? "messages" : "chat");
            }}
            className="wg-warm"
            style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, color: "#26323a" }}
          >
            Ask to move this
          </button>
        </div>
      </div>
    </div>
  );

  const alertsScreen = (
    <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 14, animation: "wgIn .28s ease both" }}>
      {/* Only where a client is looking at their own trip through a real
          share link — the subscription is keyed by that token (see
          savePushSubscription in lib/account-store.ts), and neither the
          advisor's own view nor the scripted demo has one. */}
      {isClientViewer && liveChat?.shareId && <NotifyControl shareId={liveChat.shareId} />}
      {/* Real flight-status alerts — never present on the demo. Newest
          first, each with a Dismiss control on the advisor's own side only;
          a client sees the same alert with nothing to manage. */}
      {[...liveAlerts].reverse().map((a) => (
        <div key={a.id} style={{ padding: "18px 18px", borderRadius: 20, background: a.acknowledged ? "#ffffff" : "#f7eee0", border: `1px solid ${a.acknowledged ? "rgba(38,50,58,.08)" : "rgba(183,138,74,.28)"}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={kicker(a.acknowledged ? "#78716c" : "#765321")}>{new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <div style={{ font: `400 20px/1.15 ${serif}`, color: a.acknowledged ? "#26323a" : "#4a3016" }}>{a.title}</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: a.acknowledged ? "#57534e" : "#5c4322", textWrap: "pretty" }}>{a.note}</p>
          {!isClientViewer && !a.acknowledged && trip.tripId && (
            <button
              onClick={() => {
                void fetch("/api/account/alerts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tripId: trip.tripId, alertId: a.id }),
                }).then(() => router.refresh());
              }}
              className="wg-press"
              style={{ alignSelf: "flex-start", border: "1px solid rgba(183,138,74,.4)", background: "none", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "10px 16px", borderRadius: 14, color: "#765321" }}
            >
              Dismiss
            </button>
          )}
        </div>
      ))}
      {open && (
        <div style={{ padding: "20px 18px", borderRadius: 20, background: "#f7eee0", border: "1px solid rgba(183,138,74,.28)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 14, background: GOLD, animation: "wgPulse 1.8s ease-in-out infinite" }} />
            <span style={kicker("#765321")}>Needs you · today 14:10</span>
          </div>
          <div style={{ font: `400 22px/1.1 ${serif}`, color: "#4a3016" }}>Rain from three o&apos;clock</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#5c4322", textWrap: "pretty" }}>Both options are held until five. Pick one and I will move the rest of the day round it.</p>
          {(["a", "b"] as SwapId[]).map((id) => {
            const o = trip.swaps![id];
            const on = st.pick === id;
            return (
              <button key={id} onClick={() => setSt((s) => ({ ...s, pick: id }))} style={{ textAlign: "left", cursor: "pointer", border: `1.5px solid ${on ? GOLD : "rgba(38,50,58,.12)"}`, background: on ? "#f0e0c2" : "#ffffff", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
                  <span style={{ font: `400 17px/1.15 ${serif}` }}>{o.title}</span>
                  <span style={{ flex: "none", width: 20, height: 20, borderRadius: 14, border: `1.5px solid ${on ? GOLD : "rgba(38,50,58,.2)"}`, background: on ? GOLD : "transparent" }} />
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "#26323a", textWrap: "pretty" }}>{o.note}</span>
                <span style={{ font: "400 11px/1 ui-monospace,Menlo,monospace", color: "#78716c" }}>{o.meta}</span>
              </button>
            );
          })}
          <button onClick={confirmSwap} disabled={!st.pick} className="wg-press" style={{ border: 0, cursor: st.pick ? "pointer" : "default", background: GOLD, color: CREAM, font: `400 15px/1 ${serif}`, padding: "15px 20px", borderRadius: 14, opacity: st.pick ? 1 : 0.45 }}>
            {st.pick ? `Confirm ${st.pick === "a" ? "Thursday morning" : "Palazzo Massimo"}` : "Pick one of the two"}
          </button>
        </div>
      )}
      {settled && trip.swaps && (
        <div style={{ padding: "20px 18px", borderRadius: 20, background: "#e7edf1", border: "1px solid rgba(21,50,75,.3)", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={kicker("#1f3f5c")}>Settled · just now</span>
          <div style={{ font: `400 21px/1.12 ${serif}`, color: "#0b2437" }}>{trip.swaps[st.swap!].item.title}</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#0b2437", textWrap: "pretty" }}>{trip.swaps[st.swap!].reply}</p>
          <button onClick={() => go("day")} className="wg-navy" style={{ alignSelf: "flex-start", border: "1px solid rgba(21,50,75,.4)", background: "none", cursor: "pointer", font: `400 13.5px/1 ${serif}`, padding: "11px 17px", borderRadius: 14, color: "#0b2437" }}>See the new day</button>
        </div>
      )}
      {!open && !settled && handledSteps.length === 0 && (
        <div style={{ padding: "22px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker("#78716c")}>Changes</span>
          <div style={{ font: `400 20px/1.15 ${serif}` }}>Nothing needs a decision</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>When something on the trip moves, it shows up here — with what changed and what, if anything, it asks of you.</p>
        </div>
      )}
      {handledSteps.length > 0 && (
      <div style={{ padding: "20px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={kicker("#78716c")}>Handled for you · Monday 07:20</span>
        <div style={{ font: `400 21px/1.12 ${serif}` }}>Sunday&apos;s flight home moved to 13:05</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#26323a", textWrap: "pretty" }}>The airline moved it by an hour and three quarters. Nothing was asked of you; here is what happened.</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {handledSteps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: "none", width: 11, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 11, height: 11, borderRadius: 14, background: "#15324b", marginTop: 4 }} />
                {i < handledSteps.length - 1 && <span style={{ flex: 1, width: 1.5, background: "rgba(38,50,58,.12)" }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{s.what}</span>
                <span style={{ font: "400 11.5px/1.4 ui-monospace,Menlo,monospace", color: "#a8a29e" }}>{s.when}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );

  const conciergeChat = (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", animation: "wgIn .28s ease both" }}>
      <div style={{ flex: 1, padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ alignSelf: "center", font: "400 11px/1 ui-monospace,Menlo,monospace", color: "#a8a29e", background: "#ece8df", padding: "7px 12px", borderRadius: 14 }}>Tuesday 27 October</div>
        {st.messages.map((m, i) => {
          const mine = m.from === "me";
          return (
            <div key={i} style={{ maxWidth: "80%", alignSelf: mine ? "flex-end" : "flex-start", background: mine ? GOLD : "#ffffff", color: mine ? CREAM : "#26323a", borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "13px 15px", fontSize: 14, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(23,45,82,.08)" }}>{m.text}</div>
          );
        })}
        {st.typing && (
          <div style={{ alignSelf: "flex-start", background: "#ffffff", borderRadius: "14px 14px 14px 4px", padding: "14px 18px", font: "400 12px/1 ui-monospace,Menlo,monospace", color: "#78716c", animation: "wgPulse 1.2s ease-in-out infinite" }}>{(st.role === "advisor" ? "The Cohens are" : `${firstName} is`)} typing…</div>
        )}
      </div>
      <div style={{ flexShrink: 0, position: "sticky", bottom: 0, background: CREAM, borderTop: "1px solid rgba(38,50,58,.08)", padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none" }}>
          {quickReplies.map((q, i) => (
            <button key={i} onClick={() => send(q)} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", fontSize: 12.5, padding: "9px 14px", borderRadius: 14, color: "#26323a", whiteSpace: "nowrap" }}>{q}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <input value={st.draft} onChange={(e) => setSt((s) => ({ ...s, draft: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder={st.role === "advisor" ? "Reply to the Cohens…" : `Ask ${firstName} anything…`} style={{ flex: 1, minWidth: 0, border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", borderRadius: 14, padding: "14px 17px", fontFamily: "Inter,sans-serif", fontSize: 16, color: "#26323a", outline: "none" }} />
          <button onClick={() => send()} className="wg-press" style={{ flex: "none", border: 0, cursor: "pointer", background: GOLD, color: CREAM, width: 46, height: 46, borderRadius: 14, fontSize: 17, padding: 0 }}>↑</button>
        </div>
      </div>
    </div>
  );

  const guideChat = (
    <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 18, animation: "wgIn .28s ease both" }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "#57534e", textWrap: "pretty" }}>
        {trip.guideSections.length > 0
          ? "Built the same way as your itinerary — everything below is a record this site already publishes, kept here so it works with no signal."
          : "There is nothing local to show for this trip yet."}
      </p>
      {trip.guideSections.map((g, gi) => (
        <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ ...kicker("#78716c"), paddingLeft: 4 }}>{g.name}</div>
          {g.items.map((it, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRadius: 16, background: it.tint, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "#26323a", textWrap: "pretty" }}>{it.note}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const walletScreen = (
    <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 16, animation: "wgIn .28s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, font: "400 11.5px/1 ui-monospace,Menlo,monospace", color: "#1f3f5c", background: "#e7edf1", padding: "10px 14px", borderRadius: 14, alignSelf: "flex-start" }}>
        <span style={{ width: 7, height: 7, borderRadius: 14, background: "#15324b" }} />Kept on the phone — works with no signal
      </div>
      {trip.payment && (
        <button
          onClick={() => go("pay")}
          className="wg-fade"
          style={{ textAlign: "left", cursor: "pointer", padding: "16px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 5 }}
        >
          <span style={kicker("#78716c")}>Trip balance</span>
          <span style={{ font: `400 19px/1.2 ${serif}`, color: "#0b2437" }}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: trip.payment.currency }).format(trip.payment.remainingCents / 100)}
            {trip.payment.remainingCents > 0 ? " remaining" : " — paid in full"}
          </span>
          <span style={{ fontSize: 12.5, color: "#78716c" }}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: trip.payment.currency }).format(trip.payment.paidCents / 100)} paid so far
            {trip.payment.totalCents ? ` of ${new Intl.NumberFormat("en-US", { style: "currency", currency: trip.payment.currency }).format(trip.payment.totalCents / 100)} total` : ""}
          </span>
        </button>
      )}
      {trip.walletGroups.length === 0 && (
        <p style={{ margin: "4px 4px 0", fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>Flights, where you are staying and anything held for you appear here as they are added to the trip.</p>
      )}
      {trip.walletGroups.map((g, gi) => (
        <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ ...kicker("#78716c"), paddingLeft: 4 }}>{g.name}</div>
          {g.rows.map((r, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>{r.title}</span>
                <span style={{ flex: "none", font: "400 11.5px/1 ui-monospace,Menlo,monospace", color: "#78716c" }}>{r.ref}</span>
              </div>
              {r.sub && <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>{r.sub}</span>}
              {(r.phone || r.address) && (
                <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
                  {r.phone && (
                    <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} style={{ fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}>
                      Call
                    </a>
                  )}
                  {r.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
                    >
                      Directions
                    </a>
                  )}
                </div>
              )}
              {/* Only to whoever is signed into the account that owns the
                  file — a client on a code link could never open one, so
                  showing the link there would just be a dead tap. */}
              {!isClientViewer && r.attachments && r.attachments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  {r.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={`/api/account/attachments?id=${encodeURIComponent(att.id)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
                    >
                      📎 {att.name}
                    </a>
                  ))}
                </div>
              )}
              {!isClientViewer && trip.tripId && r.id && r.stopKind && (
                <WalletAttach tripId={trip.tripId} row={r} onSaved={() => router.refresh()} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const payScreen = trip.payment ? <PayScreen shareId={trip.payment.shareId} /> : null;

  // A REAL trip's Guide — the advisor's own per-day practical notes, and,
  // only when the account has turned the kosher-and-Shabbos layer on
  // (CompanionSettings), the site's own kosher listings and Shabbos times
  // for the trip. Lives inside the You tab rather than a tab of its own, to
  // keep the bottom nav to four: Trip, Advisor, Wallet, You. A client sees
  // only the days that carry a note, and not that part of the section at
  // all when there are none; the advisor (or a Gold member on their own
  // trip) always sees every day, with a control to add or edit each note.
  const guideDays = days.filter((d) => (isClientViewer ? d.guideNote : true));
  const showGuideSection = (!isClientViewer || guideDays.length > 0) || trip.guideSections.length > 0;
  const guideSection = showGuideSection && (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ ...kicker("#78716c"), paddingLeft: 4 }}>Getting around, day by day</div>
      {guideDays.length === 0 && (
        <p style={{ margin: "0 4px", fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>Nothing added yet.</p>
      )}
      {guideDays.map((d, i) => (
        <div key={d.date ?? i} style={{ padding: "15px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: "#78716c" }}>{d.name}</span>
          {d.guideNote && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "#26323a", textWrap: "pretty" }}>{d.guideNote}</p>}
          {!isClientViewer && trip.tripId && d.date && (
            <GuideNoteEdit tripId={trip.tripId} date={d.date} note={d.guideNote ?? ""} onSaved={() => router.refresh()} />
          )}
        </div>
      ))}
      {/* The kosher-and-Shabbos layer — only ever present when the account
          turned it on (CompanionSettings, AppPrefs.kosherFeatures). Off,
          trip.guideSections is always empty and this renders nothing. */}
      {trip.guideSections.map((g, gi) => (
        <Fragment key={gi}>
          <div style={{ ...kicker("#78716c"), paddingLeft: 4 }}>{g.name}</div>
          {g.items.map((it, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRadius: 16, background: it.tint, border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "#26323a", textWrap: "pretty" }}>{it.note}</span>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );

  const profileScreen = (
    <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 16, animation: "wgIn .28s ease both" }}>
      <div style={{ padding: 20, borderRadius: 20, background: "#ece8df", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: "none", width: 54, height: 54, borderRadius: 14, background: "repeating-linear-gradient(135deg,#ece8df 0 7px,#ffffff 7px 14px)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ font: `400 21px/1.1 ${serif}` }}>{trip.family}</span>
          <span style={{ fontSize: 13, color: "#57534e" }}>{trip.familyMeta}</span>
        </div>
      </div>
      {trip.prefs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ ...kicker("#78716c"), paddingLeft: 4 }}>From your planning answers</div>
          {trip.prefs.map((p, i) => (
            <div key={i} style={{ padding: "15px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14 }}>
              <span style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: "#78716c" }}>{p.label}</span>
              <span style={{ textAlign: "right", fontSize: 13.5, lineHeight: 1.4 }}>{p.value}</span>
            </div>
          ))}
        </div>
      )}
      {guideSection}
      {/* Trip kind — Concierge or Guide — lives here on the phone, where the
          desktop showcase has it as a toolbar above the frame. Only when a
          live advisor is attached; a wired trip is read one way. */}
      {hasConcierge && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ ...kicker("#78716c"), paddingLeft: 4 }}>How you are reading this trip</div>
          <div style={{ display: "flex", gap: 6, padding: 5, background: "#ece8df", borderRadius: 14, alignSelf: "flex-start" }}>
            {tmodeOpts.map((o) => (
              <button key={o.id} onClick={o.pick} style={{ border: 0, cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "10px 16px", borderRadius: 14, background: o.bg, color: o.fg }}>{o.label}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding: 20, borderRadius: 20, background: "#f7eee0", border: "1px solid rgba(183,138,74,.25)", display: "flex", flexDirection: "column", gap: 11 }}>
        {/* A client on a code from their adviser has no account — "signed in"
            would simply be false for them, so this reads differently for the
            two people who can land on this screen. */}
        <span style={kicker("#765321")}>{liveChat?.side === "client" ? "Your trip" : "Signed in as"}</span>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#5c4322", textWrap: "pretty" }}>
          {liveChat?.side === "client"
            ? "You opened this with the code your adviser sent you — no account needed."
            : st.role === "advisor"
              ? "The advisor side: the trips you are holding today, and the one that needs a decision from you."
              : "The trip is in your name. Two others can look at it; nobody but you can change it."}
        </p>
        {hasConcierge && (
          <div style={{ display: "flex", gap: 6, padding: 5, background: "rgba(255,255,255,.8)", borderRadius: 14, alignSelf: "flex-start" }}>
            {roleOpts.map((r) => (
              <button key={r.id} onClick={r.pick} style={{ border: 0, cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "10px 16px", borderRadius: 14, background: r.bg, color: r.fg }}>{r.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Stops from this trip that can be shared by their own address in the
  // chat — where you are staying, and any sight, meal or stop that has a
  // real place, not "an open day" with nothing planned. A device fix only
  // ever says where the sender is standing; this is how a hotel, an
  // activity or an eatery gets shared instead.
  const shareablePlaces = [
    ...(trip.walletGroups.find((g) => g.name === "Where you are staying")?.rows ?? [])
      .filter((r) => r.address)
      .map((r) => ({ label: r.title, address: r.address! })),
    ...days
      .flatMap((d) => d.items)
      .filter((it) => it.kind !== "travel" && it.kind !== "rest" && it.place.trim())
      .map((it) => ({ label: it.title, address: it.place })),
  ];

  let body: ReactNode = null;
  if (advisorHome) body = advisorHomeScreen;
  else if (st.screen === "home") body = homeScreen;
  else if (st.screen === "day") body = dayScreen;
  else if (st.screen === "activity") body = activityScreen;
  else if (st.screen === "alerts") body = alertsScreen;
  else if (st.screen === "chat") body = isConcierge ? conciergeChat : guideChat;
  else if (st.screen === "messages")
    body = advisorInbox ? (
      <AdvisorInbox pendingShare={pendingShare} onPendingShareUsed={() => setPendingShare(null)} />
    ) : liveChat ? (
      <LiveChat chat={liveChat} subject={st.chatSubject} onSubjectUsed={() => setSt((s) => ({ ...s, chatSubject: null }))} places={shareablePlaces} />
    ) : (
      guideChat
    );
  else if (st.screen === "wallet") body = walletScreen;
  else if (st.screen === "profile") body = profileScreen;
  else if (st.screen === "pay") body = payScreen;

  const canBack = st.screen !== "home";

  // ── the phone itself ────────────────────────────────────────────────────
  const phone = (
    <div className="wg-phone" style={{ display: "flex", flexDirection: "column", background: CREAM, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}>
      {/* header */}
      <div style={{ flexShrink: 0, padding: "18px 18px 10px", display: "flex", alignItems: "center", gap: 10, background: CREAM, borderBottom: "1px solid rgba(38,50,58,.08)" }}>
        {canBack && (
          <button onClick={back} className="wg-fade" style={{ border: "1px solid rgba(38,50,58,.14)", background: "#ffffff", width: 34, height: 34, borderRadius: 14, cursor: "pointer", fontSize: 15, color: "#57534e", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>←</button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ font: "600 9.5px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: "#a8a29e" }}>{kickers[st.screen]}</div>
          <div style={{ font: `400 19px/1.15 ${serif}`, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titles[st.screen]}</div>
        </div>
        <button onClick={() => go("alerts")} className="wg-fade" style={{ position: "relative", border: "1px solid rgba(38,50,58,.14)", background: "#ffffff", height: 34, padding: "0 13px", borderRadius: 14, cursor: "pointer", font: "600 11.5px/1 Inter,sans-serif", color: "#57534e" }}>
          Changes
          {(open || unacknowledgedAlerts.length > 0) && <span style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 14, background: GOLD, border: `2px solid ${CREAM}` }} />}
        </button>
      </div>
      {/* content */}
      <div className="wg-scroll" style={{ flex: 1, overflow: "auto", WebkitOverflowScrolling: "touch" }}>{body}</div>
      {/* tabs */}
      <div style={{ flexShrink: 0, padding: "9px 12px", background: "#ece8df", borderTop: "1px solid rgba(38,50,58,.08)", display: "flex", gap: 5 }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => go(t.id)} style={{ position: "relative", flex: 1, border: 0, cursor: "pointer", background: t.bg, color: t.fg, font: `400 13px/1 ${serif}`, padding: "12px 6px", borderRadius: 14 }}>
            {t.label}
            {t.badge && <span style={{ position: "absolute", top: 5, right: "22%", width: 8, height: 8, borderRadius: 14, background: GOLD, border: "2px solid #ece8df" }} />}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="wg-app-root">
      <style>{CSS}</style>
      {/* Desktop showcase chrome — the intro and the two toolbars, shown in the
          browser and hidden once the app is installed to the home screen. */}
      <div className="wg-chrome">
        <div className="wg-chrome-head">
          <div className="wg-chrome-intro">
            <div style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: "#c8a76a" }}>White Glove · app</div>
          </div>
          {hasConcierge && (
            <div className="wg-toolbar-group">
              <div className="wg-toolbar-label">Trip kind</div>
              <div className="wg-toolbar">
                {tmodeOpts.map((o) => (
                  <button key={o.id} onClick={o.pick} style={{ border: 0, cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "9px 15px", borderRadius: 14, background: o.bg, color: o.fg }}>{o.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wg-stage">
        <div className="wg-frame">{phone}</div>
      </div>

      {hasConcierge && (
        <p className="wg-hint">Try it: open the rain notice, pick one of the two afternoons, then look at Tuesday again. The day, the chat and the notice all move together. Switch to the advisor side under <strong style={{ fontWeight: 600, color: "#e7d3ad" }}>You</strong>.</p>
      )}
    </div>
  );
}

/**
 * The real thread on a shared trip — the client and the advisor, in one place.
 *
 * Both sides poll the same endpoint keyed by the trip's share token; who is
 * "me" is the side this app was opened as. No fabricated replies here — a
 * message sits until the other person answers, which is the honest thing.
 */
/** A live message — text, a picture, a video, a voice note, or a place. */
type LiveMsg = {
  from: ChatSide;
  kind?: "text" | "image" | "video" | "audio" | "file" | "location";
  text: string;
  mediaId?: string;
  lat?: number;
  lng?: number;
  /** kind "location", when shared as a trip stop rather than a device fix. */
  address?: string;
  at: string;
  editedAt?: string;
  deletedAt?: string;
  replyTo?: { at: string; from: ChatSide; kind?: string; text: string };
  itineraryRef?: string;
};

/** The floor a picture may weigh before the server even has a disk to hold it
 * on — used until the server's own GET reports its real, deploy-specific
 * limit (see effectiveMediaLimit() in lib/media.ts). Staging a photo against
 * a hopeful client-side number the server does not actually honor is how a
 * client can compose, caption and "send" a photo only to have it rejected
 * after the fact — this keeps the two in sync instead. */
const MAX_CHAT_IMAGE_BYTES_FLOOR = 900 * 1024;

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/** A VAPID key, as Google's console gives it, into the form the Push API wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type NotifyStatus = "checking" | "unsupported" | "off" | "on" | "denied";

/**
 * "Tell me on my phone" — a client's own opt-in to a push notification when
 * something on their trip changes (see lib/push-notify.ts for what actually
 * sends it). Renders nothing when the browser can't do push at all, or when
 * this deployment has no VAPID key configured — an offer nobody can accept
 * is not an offer.
 */
function NotifyControl({ shareId }: { shareId: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [status, setStatus] = useState<NotifyStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!publicKey || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    let active = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setStatus(sub ? "on" : Notification.permission === "denied" ? "denied" : "off");
      })
      .catch(() => {
        if (active) setStatus("off");
      });
    return () => {
      active = false;
    };
  }, [publicKey]);

  async function subscribe() {
    if (!publicKey) return;
    setBusy(true);
    setError("");
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("incomplete subscription");
      const res = await fetch("/api/companion/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, subscription: { endpoint: json.endpoint, keys: json.keys } }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("on");
    } catch {
      setError("Could not turn on notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/companion/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId, action: "unsubscribe", endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Could not turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported" || status === "checking") return null;

  const serif = "Georgia,'Times New Roman',serif";
  return (
    <div style={{ padding: "16px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>Notify me about changes</span>
        <span style={{ fontSize: 12, color: "#57534e" }}>
          {status === "denied"
            ? "Notifications are blocked in your browser's settings."
            : status === "on"
              ? "On for this device."
              : "A delay, a cancellation, a gate change — sent straight to your phone."}
        </span>
        {error && <span style={{ fontSize: 12, color: "#b42318" }}>{error}</span>}
      </div>
      {status !== "denied" && (
        <button
          onClick={() => void (status === "on" ? unsubscribe() : subscribe())}
          disabled={busy}
          className="wg-press"
          style={{
            flex: "none",
            border: status === "on" ? "1px solid rgba(38,50,58,.16)" : 0,
            background: status === "on" ? "#ffffff" : GOLD,
            color: status === "on" ? "#26323a" : CREAM,
            cursor: "pointer",
            font: `400 13px/1 ${serif}`,
            padding: "11px 16px",
            borderRadius: 14,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {status === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
/** The most a video may weigh — a short clip, not a film. Matches
 * MAX_CHAT_VIDEO_BYTES in lib/media.ts; kept as its own number here because a
 * client-side check exists to save the phone an upload the server would only
 * reject, not to be the source of truth. */
const MAX_CHAT_VIDEO_BYTES = 15 * 1024 * 1024;
/** The most a voice note may weigh. Matches MAX_CHAT_AUDIO_BYTES server-side. */
const MAX_CHAT_AUDIO_BYTES = 8 * 1024 * 1024;
// A document's cap is not a fixed constant here: it is read from the server
// (docLimit) because it depends on whether the disk volume is mounted.

/** A picture, video, voice note or document picked but not yet sent.
 *  `fileName` is carried for a document, whose card shows its name. */
type StagedMedia = { kind: "image" | "video" | "audio" | "file"; file: File | Blob; previewUrl: string; noun: string; fileName?: string };

/** A small document glyph — the media Icon set has no file icon, and a chat
 *  document should read as a document at a glance, in the composer and in the
 *  thread. Inline so it carries its own colour from the surrounding text. */
function DocGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/** "Today" / "Yesterday" / a short date — the divider between a run of
 *  messages sent on different days, the way any messaging app breaks up
 *  scrollback. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: diffDays < 7 ? "long" : undefined,
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function LiveChat({
  chat,
  subject,
  onSubjectUsed,
  places = [],
  initialDraft,
  onInitialDraftUsed,
}: {
  chat: CompanionChat;
  /** A day or activity tapped through "Ask about this" — folded into the
   *  next message as a small reference, once, rather than opening a
   *  separate conversation for it. */
  subject?: string | null;
  onSubjectUsed?: () => void;
  /** Stops from this trip that can be shared by their own address — the
   *  hotel, an activity, an eatery — offered alongside "my current
   *  location" when Location is tapped. Empty when the caller has no
   *  itinerary loaded for this thread (the advisor's own inbox, browsing
   *  a list of clients rather than one open trip). */
  places?: { label: string; address: string }[];
  /** A place shared in from outside — Google Maps' share sheet, say — put
   *  straight into the composer, ready to send as an ordinary message. */
  initialDraft?: string | null;
  onInitialDraftUsed?: () => void;
}) {
  const { shareId, side, advisorName } = chat;
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [recording, setRecording] = useState(false);
  // A picture, video or voice note picked but not yet sent — a preview and a
  // caption box replace the input row until Send or Cancel is pressed. Chosen
  // this way rather than sending on pick because the wrong photo tapped by
  // accident, in a chat that reaches a real client, is not a mistake either
  // side can take back.
  const [staged, setStaged] = useState<StagedMedia | null>(null);
  const [caption, setCaption] = useState("");
  // A location, held for review the same way a photo is — nothing goes out
  // until Send is pressed. Either a device fix (lat/lng) or a stop from the
  // trip itself, shared by its own address (label names which one).
  const [stagedLocation, setStagedLocation] = useState<
    { lat: number; lng: number; label?: string } | { address: string; label: string } | null
  >(null);
  // Whether the "⋯" attach menu (photo / video / location) is open.
  const [attachOpen, setAttachOpen] = useState(false);
  // The location choice — "my current location" or a stop from this trip —
  // shown in place of the attach menu once Location is tapped, since a
  // device fix alone can never be where the hotel or the restaurant is.
  const [locationChoiceOpen, setLocationChoiceOpen] = useState(false);
  // The `at` of a message being changed — while set, the composer holds that
  // message's words rather than a new message, and Send saves the change
  // instead of posting another one.
  const [editingAt, setEditingAt] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Partial<Record<ChatSide, string>>>({});
  // The `at` of the one message whose "⋯" menu (Report / Edit / Delete) is
  // open. Only ever one at a time, so a single value does the job of a map.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  // Which side the open menu should grow toward — measured against the real
  // screen at the moment it opens, not assumed from mine/theirs, since a
  // wide bubble can push its own "⋯" close to either edge and a menu that
  // always opens the same direction ends up rendered off the visible screen.
  const [menuOpenLeft, setMenuOpenLeft] = useState(false);
  // Whether the other side has typed within the last few seconds — read off
  // the poll, exactly like the messages themselves.
  const [otherTyping, setOtherTyping] = useState(false);
  // The message the next send will quote — staged the same way an edit is,
  // in a bar above the composer, cleared once it is actually attached to a
  // sent message.
  const [replyingTo, setReplyingTo] = useState<LiveMsg | null>(null);
  // A day or activity carried in from "Ask about this" — staged the same
  // way a reply is, and attached to the next message sent rather than
  // mixed into its words, so it shows in the thread as its own small tag.
  const [itineraryRef, setItineraryRef] = useState<string | null>(null);
  // A picture or video opened full-size, over the whole chat panel.
  const [viewerMedia, setViewerMedia] = useState<{ kind: "image" | "video"; mediaId: string; text: string } | null>(null);
  // Briefly highlighted after tapping a quote to jump to the message it
  // quotes — long enough to catch the eye, not so long it feels stuck.
  const [jumpFlashAt, setJumpFlashAt] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  // Whether the scroller was already near its bottom the last time it was
  // checked — read by the auto-scroll effect so a new message does not yank
  // somebody back down while they are reading scrollback. Starts true: the
  // very first load should land at the bottom, the same way opening any
  // messaging app does.
  const nearBottomRef = useRef(true);
  const lastTypingPingRef = useRef(0);
  // The server's real, deploy-specific picture limit — learned from the GET
  // response, not assumed. Starts at the safe floor so a picture staged
  // before the first load completes is never bigger than the server could
  // reject anyway.
  const [imageLimit, setImageLimit] = useState(MAX_CHAT_IMAGE_BYTES_FLOOR);
  // The server's real document cap, read the same way as the image one. Starts
  // at the small floor so an early pick can never exceed what the server takes.
  const [docLimit, setDocLimit] = useState(MAX_CHAT_IMAGE_BYTES_FLOOR);

  useEffect(() => {
    if (!menuOpenAt) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenAt(null);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpenAt]);

  useEffect(() => {
    if (!attachOpen && !locationChoiceOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
        setLocationChoiceOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAttachOpen(false);
        setLocationChoiceOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [attachOpen, locationChoiceOpen]);

  // Grows the composer with what is actually typed, up to a cap beyond which
  // it scrolls internally rather than eating the whole screen.
  const MAX_COMPOSER_PX = 120;
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
  }, [draft]);

  // Picked up once per "Ask about this" tap, then handed back so the parent
  // clears it — otherwise navigating away and back would restage it over
  // whatever the traveler had already set up to send.
  const onSubjectUsedRef = useRef(onSubjectUsed);
  onSubjectUsedRef.current = onSubjectUsed;
  useEffect(() => {
    if (!subject) return;
    setItineraryRef(subject);
    onSubjectUsedRef.current?.();
  }, [subject]);

  // A place shared in from outside, put straight into the composer —
  // picked up once, then handed back so the parent clears it, the same way
  // "Ask about this" is.
  const onInitialDraftUsedRef = useRef(onInitialDraftUsed);
  onInitialDraftUsedRef.current = onInitialDraftUsed;
  useEffect(() => {
    if (!initialDraft) return;
    setDraft(initialDraft);
    onInitialDraftUsedRef.current?.();
  }, [initialDraft]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/companion/chat?share=${encodeURIComponent(shareId)}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setMessages(Array.isArray(d.messages) ? d.messages : []);
      setAvailable(d.available !== false);
      setReadAt(d.readMarkers && typeof d.readMarkers === "object" ? d.readMarkers : {});
      setOtherTyping(Boolean(d.typing));
      if (typeof d.imageLimit === "number" && d.imageLimit > 0) setImageLimit(d.imageLimit);
      if (typeof d.docLimit === "number" && d.docLimit > 0) setDocLimit(d.docLimit);
      setLoaded(true);
    } catch {
      /* keep what we have; the next poll may reach it */
    }
  }, [shareId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  // Only follows new messages down when the reader was already at the
  // bottom — the way every real messaging app behaves. Scrolled up reading
  // yesterday's plans, a new message arriving must not yank the screen away
  // from what is actually being read.
  const NEAR_BOTTOM_PX = 80;
  function noteScrollPosition() {
    const el = scrollerRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, otherTyping]);

  // One place to POST from — text, a picture, a place, or a voice note all
  // land here; the reply carries the whole thread back, so the send is also
  // the refresh. Whatever is staged in `replyingTo` rides along automatically
  // — a caller sends its own payload without having to remember the quote.
  async function post(payload: Record<string, unknown>) {
    setSending(true);
    setNote("");
    // Sending is the one moment the screen must follow the new message down
    // regardless of where the reader had scrolled to while composing it.
    nearBottomRef.current = true;
    try {
      const r = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share: shareId,
          ...(replyingTo ? { replyToAt: replyingTo.at } : {}),
          ...(itineraryRef ? { itineraryRef } : {}),
          ...payload,
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d) {
        setMessages(Array.isArray(d.messages) ? d.messages : []);
        setReplyingTo(null);
        setItineraryRef(null);
      } else {
        setNote((d && d.error) || "That didn't send. Try again.");
        void load();
      }
    } catch {
      setNote("That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  function send() {
    const t = draft.trim();
    if (!t || sending) return;
    if (editingAt) {
      void saveEdit(editingAt, t);
      return;
    }
    setDraft("");
    void post({ text: t });
  }

  /** A message either side can reply to — anything still standing. Staged
   *  the same way an edit is: one bar above the composer, cleared on send
   *  or Cancel. */
  function startReply(m: LiveMsg) {
    if (sending) return;
    setEditingAt(null);
    setReplyingTo(m);
  }

  // Pings "I am typing" at most once every couple of seconds — the server
  // key already lasts a few seconds on its own, so the composer only has to
  // refresh it well before it would lapse, not on every keystroke.
  function noteTyping() {
    if (editingAt) return; // changing old words is not "typing" to the other side
    const now = Date.now();
    if (now - lastTypingPingRef.current < 2000) return;
    lastTypingPingRef.current = now;
    void fetch("/api/companion/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share: shareId, typing: true }),
    }).catch(() => undefined);
  }

  // Puts an already-sent text message into the composer to change it, rather
  // than opening a second box — there is only ever one thing being typed.
  function startEdit(m: LiveMsg) {
    if (sending || staged) return;
    setReplyingTo(null);
    setEditingAt(m.at);
    setDraft(m.text);
  }

  function cancelEdit() {
    setEditingAt(null);
    setDraft("");
  }

  async function saveEdit(at: string, text: string) {
    setSending(true);
    setNote("");
    try {
      const r = await fetch("/api/companion/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: shareId, at, text }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d) setMessages(Array.isArray(d.messages) ? d.messages : []);
      else setNote((d && d.error) || "That couldn't be changed.");
    } catch {
      setNote("That couldn't be changed.");
    } finally {
      setSending(false);
      setEditingAt(null);
      setDraft("");
    }
  }

  async function deleteMine(at: string) {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      const r = await fetch("/api/companion/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: shareId, at }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d) setMessages(Array.isArray(d.messages) ? d.messages : []);
      else setNote((d && d.error) || "That couldn't be deleted.");
    } catch {
      setNote("That couldn't be deleted.");
    }
  }

  // Validates a picked file and holds it for review — nothing is sent until
  // sendStaged() runs. The one path pickImage, pickVideo and the recorded
  // voice note all share, so the size check and the preview stay in one place.
  function stageFile(file: File | Blob, opts: { accept: RegExp; kind: StagedMedia["kind"]; noun: string; max: number; maxLabel: string }) {
    if (sending) return;
    if (!opts.accept.test(file.type)) {
      setNote(`That is not a ${opts.noun}.`);
      return;
    }
    if (file.size > opts.max) {
      setNote(`That ${opts.noun} is too large (max ${opts.maxLabel}).`);
      return;
    }
    setNote("");
    setStaged({ kind: opts.kind, file, previewUrl: URL.createObjectURL(file), noun: opts.noun, fileName: file instanceof File ? file.name : undefined });
  }

  function clearStaged() {
    setStaged(null);
    setCaption("");
  }

  // One place that frees the preview URL — whenever a staged pick is replaced
  // or cleared, and on unmount if the chat closes with one still held.
  useEffect(() => {
    return () => {
      if (staged) URL.revokeObjectURL(staged.previewUrl);
    };
  }, [staged]);

  // Only now does the file actually go out, reading it into the data URL the
  // route expects, with whatever caption was typed while it sat in preview.
  function sendStaged() {
    if (!staged || sending) return;
    const { file, noun, kind, fileName } = staged;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      // A document rides with its filename as the label, so the card in the
      // thread reads "boarding-pass.pdf" rather than an opaque id — a typed
      // caption, if there is one, wins.
      const text = caption.trim() || (kind === "file" ? fileName ?? "Document" : "");
      if (dataUrl) void post({ dataUrl, text });
      clearStaged();
    };
    reader.onerror = () => setNote(`Could not read that ${noun}.`);
    reader.readAsDataURL(file);
  }

  // A phone's camera routinely produces a file well over any chat-sized cap
  // — a modern photo is commonly 3–8 MB, the server's limit is 1–2 MB — so a
  // flat reject on "too large" is why sending a picture could look broken
  // rather than merely slow. Downscales dimensions first (most of the
  // saving), then steps the JPEG quality down if it is still over, the same
  // order a phone's own share sheet uses.
  async function compressImage(file: File, maxBytes: number): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const MAX_DIM = 1800;
    let { width, height } = bitmap;
    if (width > MAX_DIM || height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    bitmap.close();
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (let quality = 0.85; quality >= 0.4; quality -= 0.15) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) break;
      if (blob.size <= maxBytes || quality <= 0.4) return blob;
    }
    return file;
  }

  async function pickImage(file: File | null | undefined) {
    if (!file || sending) return;
    if (!/^image\//.test(file.type)) {
      setNote("That is not a picture.");
      return;
    }
    setNote("");
    // The server only stores JPG, PNG and WEBP. Compress (which transcodes to
    // JPEG) when the file is too large OR when it is a format the server won't
    // take — an iPhone HEIC under the size cap would otherwise be staged as-is
    // and then rejected on send. compressImage decodes HEIC on the very
    // browsers that produce it (Safari), so this is where it turns into a JPEG.
    const accepted = /^image\/(jpeg|png|webp)$/i;
    let toStage: File | Blob = file;
    if (file.size > imageLimit || !accepted.test(file.type)) {
      try {
        toStage = await compressImage(file, imageLimit);
      } catch {
        // Compression failed (an unusual format, a very old browser) — fall
        // through to the checks below rather than losing the pick.
      }
    }
    if (!accepted.test(toStage.type)) {
      setNote("That image format isn't supported here — try a JPG or PNG.");
      return;
    }
    if (toStage.size > imageLimit) {
      setNote(`That picture is too large (max ${formatBytes(imageLimit)}).`);
      return;
    }
    setStaged({ kind: "image", file: toStage, previewUrl: URL.createObjectURL(toStage), noun: "picture" });
  }

  function pickVideo(file: File | null | undefined) {
    if (!file) return;
    stageFile(file, { accept: /^video\//, kind: "video", noun: "video", max: MAX_CHAT_VIDEO_BYTES, maxLabel: "15 MB" });
  }

  // A PDF — a booking confirmation or a ticket the advisor hands the client in
  // the thread. A document is not a portrait, so it gets its own, roomier cap
  // (docLimit, from the server); a large scan fits once the disk volume is
  // mounted, and stays within the small Redis ceiling until then.
  function pickDocument(file: File | null | undefined) {
    if (!file) return;
    stageFile(file, { accept: /^application\/pdf$/, kind: "file", noun: "document", max: docLimit, maxLabel: formatBytes(docLimit) });
  }

  // A voice note recorded right here, rather than picked from the gallery —
  // one tap to start talking, one tap to send. MediaRecorder is not on every
  // browser (older Safari in particular), so the mic button simply does not
  // appear when it is absent, rather than failing when tapped.
  async function startRecording() {
    if (sending || recording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNote("This device can't record a voice note.");
      return;
    }
    setNote("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size > 0) {
          stageFile(blob, { accept: /^audio\//, kind: "audio", noun: "voice note", max: MAX_CHAT_AUDIO_BYTES, maxLabel: "8 MB" });
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setNote("Couldn't reach the microphone. Check the app's microphone permission.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  // Leaving the chat mid-recording (a tab switch, the app closing) must not
  // leave the microphone stream open — recorder.onstop is what releases it,
  // and nothing else calls that unless we do it here.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    };
  }, []);

  // Finds where the phone is and holds it for review — the same "nothing
  // goes anywhere until Send" rule a photo gets, so a tap on the location
  // button can never itself be the thing that tells the other side exactly
  // where somebody is standing.
  function pickLocation() {
    if (sending) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNote("This device can't share a location.");
      return;
    }
    setSending(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSending(false);
        setStagedLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setSending(false);
        setNote("Couldn't get your location. Check the app's location permission.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // A stop from the trip itself — the hotel, the activity, the eatery —
  // shared by its own address rather than a device fix, so an advisor can
  // send where something IS rather than only where they happen to be.
  function pickPlaceLocation(place: { label: string; address: string }) {
    setStagedLocation({ address: place.address, label: place.label });
  }

  function sendStagedLocation() {
    if (!stagedLocation || sending) return;
    void post(
      "address" in stagedLocation
        ? { address: stagedLocation.address, label: stagedLocation.label }
        : { lat: stagedLocation.lat, lng: stagedLocation.lng, label: stagedLocation.label },
    );
    setStagedLocation(null);
  }

  async function report(at: string) {
    setReported((r) => ({ ...r, [at]: true }));
    try {
      await fetch("/api/companion/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: shareId, at }),
      });
    } catch {
      /* the flag stands locally; the operator store is best-effort */
    }
  }

  const otherName = side === "advisor" ? "your client" : advisorName.split(" ")[0];
  const otherSide: ChatSide = side === "advisor" ? "client" : "advisor";

  // Jumps to a quoted message and briefly highlights it, the same tap any
  // messaging app's reply preview gives you.
  function jumpTo(at: string) {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-msg-at="${at}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setJumpFlashAt(at);
    window.setTimeout(() => setJumpFlashAt((cur) => (cur === at ? null : cur)), 1200);
  }

  let lastRenderedDay = "";

  // The one message a sent/read mark can attach to — the most recent one I
  // sent that is still standing. A tick under every message I have ever sent
  // reads as noise once a thread runs long; a real messaging app shows this
  // once, where it answers the only question worth asking: has my last word
  // landed.
  let lastMineAt: string | null = null;
  for (let j = messages.length - 1; j >= 0; j--) {
    if (messages[j].from === side && !messages[j].deletedAt) {
      lastMineAt = messages[j].at;
      break;
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", position: "relative", animation: "wgIn .28s ease both" }}>
      <div ref={scrollerRef} onScroll={noteScrollPosition} className="wg-scroll" style={{ flex: 1, overflow: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!available && (
          <div style={{ alignSelf: "center", textAlign: "center", font: "400 12px/1.5 Inter,sans-serif", color: "#765321", background: "#f7eee0", padding: "10px 14px", borderRadius: 14 }}>
            Messaging isn&apos;t connected yet.
          </div>
        )}
        {available && loaded && messages.length === 0 && (
          <div style={{ alignSelf: "center", maxWidth: "80%", textAlign: "center", font: "400 13px/1.6 Inter,sans-serif", color: "#78716c" }}>
            {side === "advisor" ? "No messages yet. Anything you send reaches your client on their app." : `No messages yet. Send a message, a photo, a video, a voice note or your location to ${advisorName}.`}
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.from === side;
          const day = new Date(m.at).toDateString();
          const showDivider = day !== lastRenderedDay;
          lastRenderedDay = day;
          const seenRead = Boolean(readAt[otherSide] && readAt[otherSide]! >= m.at);
          const bubble: CSSProperties = {
            maxWidth: "80%",
            alignSelf: mine ? "flex-end" : "flex-start",
            background: mine ? GOLD : "#ffffff",
            color: mine ? CREAM : "#26323a",
            borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            boxShadow: "0 1px 2px rgba(23,45,82,.08)",
            overflow: "hidden",
          };
          let content: ReactNode;
          if (m.deletedAt) {
            content = (
              <div style={{ maxWidth: "80%", alignSelf: mine ? "flex-end" : "flex-start", padding: "10px 15px", borderRadius: 14, background: "rgba(38,50,58,.06)", fontSize: 13, fontStyle: "italic", color: "#78716c" }}>
                {mine ? "You deleted this message" : "This message was deleted"}
              </div>
            );
          } else if (m.kind === "image" && m.mediaId) {
            content = (
              <div style={bubble}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media?id=${encodeURIComponent(m.mediaId)}`}
                  alt={m.text || "Shared photo"}
                  onClick={() => setViewerMedia({ kind: "image", mediaId: m.mediaId!, text: m.text })}
                  style={{ display: "block", width: "100%", maxWidth: 240, maxHeight: 280, objectFit: "cover", cursor: "pointer" }}
                />
                {m.text && <div style={{ padding: "9px 13px", fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</div>}
              </div>
            );
          } else if (m.kind === "video" && m.mediaId) {
            content = (
              <div style={bubble}>
                <video controls preload="metadata" style={{ display: "block", width: "100%", maxWidth: 240, maxHeight: 280 }}>
                  <source src={`/api/media?id=${encodeURIComponent(m.mediaId)}`} />
                </video>
                {m.text && <div style={{ padding: "9px 13px", fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</div>}
              </div>
            );
          } else if (m.kind === "audio" && m.mediaId) {
            content = (
              <div style={{ ...bubble, padding: "10px 13px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, opacity: 0.85, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="microphone" className="h-[13px] w-[13px]" /> Voice note
                </span>
                <audio controls preload="metadata" style={{ width: 220, maxWidth: "100%", height: 32 }}>
                  <source src={`/api/media?id=${encodeURIComponent(m.mediaId)}`} />
                </audio>
              </div>
            );
          } else if (m.kind === "file" && m.mediaId) {
            content = (
              <a
                href={`/api/media?id=${encodeURIComponent(m.mediaId)}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...bubble, display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", textDecoration: "none" }}
              >
                <DocGlyph size={20} />
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>{m.text || "Document"}</span>
                  <span style={{ fontSize: 11.5, opacity: 0.75 }}>PDF · tap to open</span>
                </span>
              </a>
            );
          } else if (m.kind === "location" && ((typeof m.lat === "number" && typeof m.lng === "number") || m.address)) {
            const href =
              typeof m.lat === "number" && typeof m.lng === "number"
                ? `https://www.google.com/maps?q=${m.lat},${m.lng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.address!)}`;
            content = (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ ...bubble, textDecoration: "none", padding: "13px 15px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="map-pin" className="h-4 w-4" /> {m.text || "Shared a location"}
                </span>
                {m.address && <span style={{ fontSize: 12.5, opacity: 0.85 }}>{m.address}</span>}
                <span style={{ fontSize: 12.5, opacity: 0.85 }}>Open in maps →</span>
              </a>
            );
          } else {
            content = (
              <div style={{ ...bubble, padding: "13px 15px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {m.text}
                {m.editedAt && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7, fontStyle: "italic" }}>(edited)</span>}
              </div>
            );
          }
          const isTextEditable = mine && !m.deletedAt && (m.kind ?? "text") === "text";
          // A live message always has at least one action — Reply on any
          // live one, Report on theirs, Delete (and often Edit) on your own.
          // A deleted one has none, so its "⋯" is dropped rather than
          // opening onto nothing.
          const hasMenu = !m.deletedAt;
          const menuOpen = menuOpenAt === m.at;
          const quote = m.replyTo && (
            <button
              onClick={() => jumpTo(m.replyTo!.at)}
              style={{
                display: "block",
                textAlign: "left",
                width: "100%",
                border: 0,
                cursor: "pointer",
                background: mine ? "rgba(255,255,255,.18)" : "rgba(38,50,58,.06)",
                borderLeft: `3px solid ${mine ? "rgba(255,255,255,.6)" : GOLD}`,
                borderRadius: 8,
                padding: "5px 9px",
                marginBottom: 3,
                fontFamily: "Inter,sans-serif",
              }}
            >
              <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: mine ? "rgba(255,255,255,.92)" : "#57534e" }}>
                {m.replyTo.from === side ? "You" : otherName}
              </span>
              <span style={{ display: "block", fontSize: 12, lineHeight: 1.35, color: mine ? "rgba(255,255,255,.85)" : "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.replyTo.text}
              </span>
            </button>
          );
          // Which day or activity this message was started from — set once,
          // when "Ask about this" opened the thread, so the reader does not
          // have to guess what a bare "Can we move this?" refers to.
          const itineraryTag = m.itineraryRef && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, alignSelf: mine ? "flex-end" : "flex-start", marginBottom: 2, padding: "3px 9px 3px 7px", borderRadius: 999, background: "#e7edf1", color: "#1f3f5c", fontSize: 11, fontWeight: 600 }}>
              <Icon name="suitcase" className="h-3 w-3" />
              {m.itineraryRef}
            </div>
          );
          return (
            <Fragment key={m.at || i}>
              {showDivider && (
                <div style={{ alignSelf: "center", margin: "6px 0 2px", font: "600 11px/1 Inter,sans-serif", color: "#a8a29e", background: "rgba(38,50,58,.05)", padding: "5px 13px", borderRadius: 999 }}>
                  {dayLabel(m.at)}
                </div>
              )}
              <div
                data-msg-at={m.at}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: mine ? "flex-end" : "flex-start",
                  gap: 2,
                  background: jumpFlashAt === m.at ? "rgba(183,138,74,.18)" : "transparent",
                  borderRadius: 10,
                  transition: "background .5s ease",
                }}
              >
              {itineraryTag}
              <div style={{ display: "flex", alignItems: "center", gap: 1, flexDirection: mine ? "row-reverse" : "row", maxWidth: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  {quote}
                  {content}
                </div>
                {/* One "⋯" per message instead of Report/Edit/Delete spelled
                    out beside every bubble — the options a tap actually needs
                    sit in a small menu right against the message they act on,
                    rather than spread across the row under it. Centered on
                    the bubble (not bottom-aligned) so it visually belongs to
                    THIS message even when the bubble is tall — a photo or a
                    multi-line note — rather than drifting toward whatever
                    sits below it; dimmed until touched so a long thread of
                    bubbles doesn't read as a column of dots. */}
                {hasMenu && (
                  <div ref={menuOpen ? menuRef : undefined} style={{ position: "relative", flex: "none" }}>
                    <button
                      onClick={(e) => {
                        if (!menuOpen) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          // Not enough room for a ~150px menu on the right —
                          // grow it left instead, whichever side "mine" would
                          // otherwise have picked.
                          setMenuOpenLeft(window.innerWidth - rect.left < 155);
                        }
                        setMenuOpenAt(menuOpen ? null : m.at);
                      }}
                      title="Message options"
                      aria-label="Message options"
                      aria-expanded={menuOpen}
                      style={{ border: 0, background: "none", cursor: "pointer", padding: 10, margin: -6, color: "#a8a29e", opacity: menuOpen ? 1 : 0.55, display: "flex", alignItems: "center" }}
                    >
                      <Icon name="more" className="h-4 w-4" />
                    </button>
                    {menuOpen && (
                      <div
                        role="menu"
                        style={{
                          position: "absolute",
                          top: "100%",
                          [menuOpenLeft ? "right" : "left"]: 0,
                          zIndex: 5,
                          marginTop: 2,
                          minWidth: 148,
                          borderRadius: 12,
                          border: "1px solid rgba(38,50,58,.12)",
                          background: "#ffffff",
                          boxShadow: "0 10px 26px rgba(23,45,82,.16)",
                          overflow: "hidden",
                        }}
                      >
                        <button
                          role="menuitem"
                          onClick={() => { startReply(m); setMenuOpenAt(null); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "10px 14px", fontSize: 13, color: "#26323a" }}
                        >
                          <Icon name="reply" className="h-4 w-4" /> Reply
                        </button>
                        {!mine && (
                          reported[m.at] ? (
                            <span style={{ display: "block", padding: "10px 14px", fontSize: 13, color: "#a8a29e" }}>Reported</span>
                          ) : (
                            <button
                              role="menuitem"
                              onClick={() => { void report(m.at); setMenuOpenAt(null); }}
                              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "10px 14px", fontSize: 13, color: "#26323a" }}
                            >
                              <Icon name="flag" className="h-4 w-4" /> Report
                            </button>
                          )
                        )}
                        {isTextEditable && (
                          <button
                            role="menuitem"
                            onClick={() => { startEdit(m); setMenuOpenAt(null); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "10px 14px", fontSize: 13, color: "#26323a" }}
                          >
                            <Icon name="pencil" className="h-4 w-4" /> Edit
                          </button>
                        )}
                        {mine && (
                          <button
                            role="menuitem"
                            onClick={() => { setMenuOpenAt(null); void deleteMine(m.at); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "10px 14px", fontSize: 13, color: "#b5442e" }}
                          >
                            <Icon name="trash" className="h-4 w-4" /> Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* A sent/read tick once, under the last message I sent — not
                  repeated down the thread. */}
              {mine && m.at === lastMineAt && (
                <span style={{ display: "inline-flex", alignItems: "center", padding: "0 4px", color: seenRead ? GOLD : "#a8a29e" }}>
                  <Icon name={seenRead ? "check-check" : "check"} className="h-3 w-3" />
                </span>
              )}
              </div>
            </Fragment>
          );
        })}
        {otherTyping && (
          <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, background: "#ffffff", borderRadius: "14px 14px 14px 4px", padding: "12px 16px", boxShadow: "0 1px 2px rgba(23,45,82,.08)" }}>
            {[0, 1, 2].map((n) => (
              <span
                key={n}
                style={{ width: 6, height: 6, borderRadius: 6, background: "#a8a29e", animation: "wgPulse 1.1s ease-in-out infinite", animationDelay: `${n * 0.15}s` }}
              />
            ))}
          </div>
        )}
      </div>
      {note && (
        <div style={{ flexShrink: 0, textAlign: "center", font: "400 12px/1.5 Inter,sans-serif", color: "#8a5a2b", background: "#f7eee0", padding: "8px 14px" }}>{note}</div>
      )}

      {/* A picked photo, video or voice note sits here for review — nothing has
          gone anywhere yet. This replaces the ordinary input row until it is
          sent or cancelled, so there is never a question of which one a tap
          on "↑" would act on. */}
      {staged ? (
        <div style={{ flexShrink: 0, position: "sticky", bottom: 0, background: CREAM, borderTop: "1px solid rgba(38,50,58,.08)", padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: "none", width: 56, height: 56, borderRadius: 12, overflow: "hidden", background: "#ece8df", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {staged.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={staged.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              {staged.kind === "video" && (
                <video src={staged.previewUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              {staged.kind === "audio" && (
                <span style={{ color: ICON_BLUE }}>
                  <Icon name="microphone" className="h-6 w-6" strokeWidth={1.4} />
                </span>
              )}
              {staged.kind === "file" && (
                <span style={{ color: ICON_BLUE }}>
                  <DocGlyph size={26} />
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#26323a", textTransform: "capitalize" }}>{staged.noun} ready to send</span>
              {staged.kind === "audio" && <audio src={staged.previewUrl} controls style={{ height: 30, width: 200, maxWidth: "100%" }} />}
              {staged.kind === "file" && staged.fileName && (
                <span style={{ fontSize: 11.5, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staged.fileName}</span>
              )}
            </div>
            <button onClick={clearStaged} disabled={sending} title="Discard" aria-label="Discard" className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", color: ICON_BLUE, cursor: "pointer", width: 36, height: 36, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            {staged.kind !== "audio" && (
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendStaged(); } }}
                placeholder="Add a caption (optional)…"
                // 16px, not 14: iOS Safari auto-zooms the whole page into any
                // text input under 16px the moment it is focused, which is
                // exactly what reads as the screen "jumping" when the
                // keyboard opens.
                style={{ flex: 1, minWidth: 0, border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", borderRadius: 14, padding: "14px 17px", fontFamily: "Inter,sans-serif", fontSize: 16, color: "#26323a", outline: "none" }}
              />
            )}
            <button onClick={() => sendStaged()} disabled={sending} className="wg-press" style={{ flex: staged.kind === "audio" ? 1 : "none", border: 0, cursor: "pointer", background: GOLD, color: CREAM, height: 46, minWidth: 46, borderRadius: 14, fontSize: staged.kind === "audio" ? 14 : 17, fontWeight: staged.kind === "audio" ? 700 : 400, padding: staged.kind === "audio" ? "0 20px" : 0, opacity: sending ? 0.6 : 1 }}>
              {staged.kind === "audio" ? "Send voice note" : "↑"}
            </button>
          </div>
        </div>
      ) : stagedLocation ? (
        // A location fix held for review — the same confirm-before-send
        // shape a photo gets, so finding where the phone is can never itself
        // be the act of telling the other side.
        <div style={{ flexShrink: 0, position: "sticky", bottom: 0, background: CREAM, borderTop: "1px solid rgba(38,50,58,.08)", padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: "none", width: 56, height: 56, borderRadius: 12, background: "#e7edf1", color: "#1f3f5c", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="map-pin" className="h-6 w-6" strokeWidth={1.4} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#26323a" }}>
                {"address" in stagedLocation ? stagedLocation.label : "Your location"}, ready to send
              </span>
              <span style={{ fontSize: 11.5, color: "#78716c" }}>
                {"address" in stagedLocation ? stagedLocation.address : `${stagedLocation.lat.toFixed(4)}, ${stagedLocation.lng.toFixed(4)}`}
              </span>
            </div>
            <button onClick={() => setStagedLocation(null)} disabled={sending} title="Discard" aria-label="Discard" className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", color: ICON_BLUE, cursor: "pointer", width: 36, height: 36, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => sendStagedLocation()} disabled={sending} className="wg-press" style={{ border: 0, cursor: "pointer", background: GOLD, color: CREAM, height: 46, borderRadius: 14, fontSize: 14, fontWeight: 700, opacity: sending ? 0.6 : 1 }}>
            Send location
          </button>
        </div>
      ) : (
        <div style={{ flexShrink: 0, position: "sticky", bottom: 0, background: CREAM, borderTop: "1px solid rgba(38,50,58,.08)", padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {editingAt && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "#78716c", padding: "0 2px" }}>
              <span>Editing your message</span>
              <button onClick={cancelEdit} className="wg-link" style={{ border: 0, background: "none", cursor: "pointer", fontSize: 11.5, color: "#a8a29e" }}>Cancel</button>
            </div>
          )}
          {replyingTo && !editingAt && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "rgba(38,50,58,.05)", borderLeft: `3px solid ${GOLD}`, borderRadius: 8, padding: "6px 9px" }}>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#57534e" }}>
                  Replying to {replyingTo.from === side ? "yourself" : otherName}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {replyingTo.text || (replyingTo.kind && replyingTo.kind !== "text" ? replyingTo.kind : "")}
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} title="Cancel reply" aria-label="Cancel reply" className="wg-link" style={{ flex: "none", border: 0, background: "none", cursor: "pointer", color: "#a8a29e", display: "flex" }}>
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {itineraryRef && !editingAt && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#e7edf1", borderRadius: 8, padding: "6px 9px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 12, fontWeight: 600, color: "#1f3f5c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <Icon name="suitcase" className="h-3.5 w-3.5" />
                {itineraryRef}
              </span>
              <button onClick={() => setItineraryRef(null)} title="Remove" aria-label="Remove" className="wg-link" style={{ flex: "none", border: 0, background: "none", cursor: "pointer", color: "#1f3f5c", display: "flex" }}>
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: "none" }} onChange={(e) => { pickVideo(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={docRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => { pickDocument(e.target.files?.[0]); e.target.value = ""; }} />
            {!editingAt && (
              <>
                {/* One "attach" button for photo, video and location, instead
                    of four buttons crowding the row and squeezing the text
                    field down to a sliver. Opens upward, since the composer
                    sits at the very bottom of the screen. */}
                <div ref={attachMenuRef} style={{ position: "relative", flex: "none" }}>
                  <button
                    onClick={() => setAttachOpen((o) => !o)}
                    disabled={sending || recording}
                    title="Attach"
                    aria-label="Attach a photo, video, document or location"
                    aria-expanded={attachOpen}
                    className="wg-warm"
                    style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", color: ICON_BLUE, cursor: "pointer", width: 40, height: 46, borderRadius: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: sending || recording ? 0.6 : 1 }}
                  >
                    <Icon name="more" className="h-[19px] w-[19px]" />
                  </button>
                  {attachOpen && (
                    <div
                      role="menu"
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        marginBottom: 6,
                        zIndex: 5,
                        minWidth: 168,
                        borderRadius: 12,
                        border: "1px solid rgba(38,50,58,.12)",
                        background: "#ffffff",
                        boxShadow: "0 10px 26px rgba(23,45,82,.16)",
                        overflow: "hidden",
                      }}
                    >
                      <button role="menuitem" onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: "#26323a" }}>
                        <Icon name="camera" className="h-4 w-4" /> Photo
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); videoRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: "#26323a" }}>
                        <Icon name="video" className="h-4 w-4" /> Video
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); docRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: "#26323a" }}>
                        <DocGlyph /> Document
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); setLocationChoiceOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: "#26323a" }}>
                        <Icon name="map-pin" className="h-4 w-4" /> Location
                      </button>
                    </div>
                  )}
                  {locationChoiceOpen && (
                    // A device fix is only ever "where I am standing" — the
                    // one thing it can never say is where the hotel or the
                    // restaurant is, so this offers the trip's own stops too.
                    <div
                      role="menu"
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        marginBottom: 6,
                        zIndex: 5,
                        minWidth: 220,
                        maxWidth: 280,
                        maxHeight: 260,
                        overflowY: "auto",
                        borderRadius: 12,
                        border: "1px solid rgba(38,50,58,.12)",
                        background: "#ffffff",
                        boxShadow: "0 10px 26px rgba(23,45,82,.16)",
                      }}
                    >
                      <button role="menuitem" onClick={() => { setLocationChoiceOpen(false); pickLocation(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, borderBottom: places.length ? "1px solid rgba(38,50,58,.08)" : 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: "#26323a" }}>
                        <Icon name="map-pin" className="h-4 w-4" /> My current location
                      </button>
                      {places.length > 0 && (
                        <div style={{ padding: "8px 14px 2px", font: "600 10px/1 Inter,sans-serif", letterSpacing: ".08em", textTransform: "uppercase", color: "#a8a29e" }}>
                          From this trip
                        </div>
                      )}
                      {places.map((p, i) => (
                        <button
                          key={i}
                          role="menuitem"
                          onClick={() => { setLocationChoiceOpen(false); pickPlaceLocation(p); }}
                          style={{ display: "flex", flexDirection: "column", width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "8px 14px", fontSize: 13, color: "#26323a" }}
                        >
                          <span style={{ fontWeight: 600 }}>{p.label}</span>
                          <span style={{ fontSize: 11.5, color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.address}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => (recording ? stopRecording() : void startRecording())}
                  disabled={sending}
                  title={recording ? "Stop recording" : "Record a voice note"}
                  aria-label={recording ? "Stop recording" : "Record a voice note"}
                  className={recording ? "" : "wg-warm"}
                  style={{
                    flex: "none",
                    border: recording ? "1px solid transparent" : "1px solid rgba(38,50,58,.16)",
                    background: recording ? "#b5442e" : "#ffffff",
                    color: recording ? "#fff" : ICON_BLUE,
                    cursor: "pointer",
                    width: 40,
                    height: 46,
                    borderRadius: 14,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: sending ? 0.6 : 1,
                    animation: recording ? "wgPulse 1.1s ease-in-out infinite" : undefined,
                  }}
                >
                  <Icon name={recording ? "stop" : "microphone"} className="h-[19px] w-[19px]" />
                </button>
              </>
            )}
            <textarea
              ref={draftRef}
              rows={1}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); noteTyping(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={editingAt ? "Edit your message…" : side === "advisor" ? "Reply to your client…" : `Message ${otherName}…`}
              // 16px, not 14: iOS Safari auto-zooms the whole page into any
              // text input under 16px the moment it is focused, which is
              // exactly what reads as the screen "jumping" when the keyboard
              // opens. Grows with what is typed (see the effect above),
              // rather than staying squashed to one line.
              style={{ flex: 1, minWidth: 0, resize: "none", overflow: "auto", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", borderRadius: 14, padding: "13px 17px", fontFamily: "Inter,sans-serif", fontSize: 16, lineHeight: 1.4, color: "#26323a", outline: "none" }}
            />
            <button onClick={() => send()} disabled={sending || recording} title="Send" aria-label="Send" className="wg-press" style={{ flex: "none", border: 0, cursor: "pointer", background: GOLD, color: CREAM, width: 46, height: 46, borderRadius: 14, fontSize: 17, padding: 0, opacity: sending || recording ? 0.6 : 1 }}>{editingAt ? "✓" : "↑"}</button>
          </div>
        </div>
      )}
      {/* A photo opened full-size, over the whole chat panel — scoped to the
          phone frame (position: absolute against the relatively-positioned
          root above), not the whole browser viewport. */}
      {viewerMedia && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewerMedia.text || "Photo"}
          onClick={() => setViewerMedia(null)}
          style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(15,20,25,.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setViewerMedia(null); }}
            title="Close"
            aria-label="Close"
            style={{ position: "absolute", top: 14, right: 14, border: 0, background: "rgba(255,255,255,.14)", color: "#fff", width: 36, height: 36, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/media?id=${encodeURIComponent(viewerMedia.mediaId)}`}
            alt={viewerMedia.text || "Shared photo"}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "78%", objectFit: "contain", borderRadius: 8, cursor: "default" }}
          />
          {viewerMedia.text && (
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, maxWidth: "90%", textAlign: "center", color: "#fff", fontSize: 14, lineHeight: 1.5 }}>
              {viewerMedia.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type InboxConvo = {
  shareId: string;
  name: string;
  client: string;
  count: number;
  lastText: string;
  lastFrom: ChatSide | null;
  lastAt: string;
};

/**
 * The advisor's inbox — one conversation per client they have shared a trip
 * with. Tap one to open that thread; every client is its own chat, and this is
 * the one place they all live.
 */
function AdvisorInbox({
  pendingShare,
  onPendingShareUsed,
}: {
  /** A place shared in from outside, waiting for the advisor to pick which
   *  client's thread it belongs in. */
  pendingShare?: string | null;
  onPendingShareUsed?: () => void;
}) {
  const serif = "Georgia,'Times New Roman',serif";
  const [convos, setConvos] = useState<InboxConvo[] | null>(null);
  const [open, setOpen] = useState<InboxConvo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/companion/chats", { cache: "no-store" });
      if (!r.ok) {
        setConvos((prev) => prev ?? []); // don't hang on "Loading…" if the first read fails
        return;
      }
      const d = await r.json();
      setConvos(Array.isArray(d.conversations) ? d.conversations : []);
    } catch {
      setConvos((prev) => prev ?? []);
    }
  }, []);

  // Clears the talk, not the trip or the client's link — they can still open
  // it and pick up a conversation, just as empty as the day it opened.
  async function deleteConvo(shareId: string) {
    if (!window.confirm("Delete this conversation? Every message is cleared — the client keeps their link and can still message you.")) return;
    setDeleting(shareId);
    try {
      const r = await fetch("/api/companion/chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: shareId }),
      });
      if (r.ok) {
        setConvos((prev) => (prev ? prev.map((c) => (c.shareId === shareId ? { ...c, count: 0, lastText: "", lastFrom: null, lastAt: "" } : c)) : prev));
      }
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  if (open) {
    return (
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", animation: "wgIn .28s ease both" }}>
        <button onClick={() => setOpen(null)} className="wg-warm" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, border: 0, borderBottom: "1px solid rgba(38,50,58,.08)", background: "#ece8df", cursor: "pointer", padding: "12px 16px", textAlign: "left" }}>
          <span style={{ fontSize: 15, color: "#57534e" }}>←</span>
          <span style={{ font: `400 17px/1.1 ${serif}` }}>{open.client || open.name}</span>
        </button>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <LiveChat
            chat={{ shareId: open.shareId, side: "advisor", advisorName: open.client || open.name }}
            initialDraft={pendingShare}
            onInitialDraftUsed={onPendingShareUsed}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 10, animation: "wgIn .28s ease both" }}>
      {pendingShare && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, font: "400 11.5px/1 ui-monospace,Menlo,monospace", color: "#1f3f5c", background: "#e7edf1", padding: "10px 14px", borderRadius: 14 }}>
          <Icon name="map-pin" className="h-3.5 w-3.5" /> Shared in — tap a client below to send it
        </div>
      )}
      {convos === null && <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#a8a29e" }}>Loading…</div>}
      {convos && convos.length === 0 && (
        <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ font: `400 19px/1.2 ${serif}` }}>No conversations yet.</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>Create a client app link on a trip in the planner and share it. When the client opens it, your chat with them appears here.</span>
        </div>
      )}
      {convos?.map((c) => {
        const preview = c.lastText ? `${c.lastFrom === "advisor" ? "You: " : ""}${c.lastText}` : "No messages yet";
        return (
          <div key={c.shareId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setOpen(c)} className="wg-warm" style={{ flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer", border: "1px solid rgba(38,50,58,.08)", background: "#ffffff", borderRadius: 16, padding: "15px 16px", display: "flex", alignItems: "center", gap: 13 }}>
              <span style={{ flex: "none", width: 42, height: 42, borderRadius: 12, background: "#e7edf1", display: "flex", alignItems: "center", justifyContent: "center", font: `400 18px/1 ${serif}`, color: "#1f3f5c" }}>{(c.client || c.name || "?").charAt(0).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.client || c.name}</span>
                <span style={{ fontSize: 12.5, color: "#78716c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</span>
              </span>
            </button>
            {c.count > 0 && (
              <button
                onClick={() => void deleteConvo(c.shareId)}
                disabled={deleting === c.shareId}
                title="Delete this conversation"
                aria-label={`Delete conversation with ${c.client || c.name}`}
                className="wg-warm"
                style={{ flex: "none", border: "1px solid rgba(38,50,58,.12)", background: "#ffffff", cursor: "pointer", width: 42, height: 42, borderRadius: 12, fontSize: 15, color: "#a8544a", padding: 0, opacity: deleting === c.shareId ? 0.5 : 1 }}
              >
                🗑
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CSS = `
@keyframes wgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes wgPulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.wg-app-root { min-height: 100dvh; background: #15324b; color: #26323a; }
.wg-scroll::-webkit-scrollbar, .wg-toolbar::-webkit-scrollbar { display: none; }
.wg-press:hover { filter: brightness(.95); }
.wg-fade:hover { opacity: .72; }
.wg-warm:hover { background: #f7eee0; }
.wg-link:hover { color: #96733a; }
.wg-navy:hover { background: rgba(21,50,75,.12); }

/* Phone: full screen on a phone, a device in a frame on a desktop. */
.wg-phone { height: 100dvh; width: 100%; }
.wg-stage { display: flex; justify-content: center; }
.wg-frame { width: 100%; }
.wg-chrome { display: none; }
.wg-hint { display: none; }

/* Installed to the home screen: only the app, never the showcase chrome. */
@media (display-mode: standalone) {
  .wg-chrome, .wg-hint { display: none !important; }
}

@media (min-width: 900px) {
  .wg-app-root { padding: 36px 24px 56px; display: flex; flex-direction: column; align-items: center; gap: 26px; }
  .wg-chrome { display: block; width: 100%; max-width: 920px; }
  .wg-chrome-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; }
  .wg-chrome-intro { max-width: 520px; display: flex; flex-direction: column; gap: 8px; }
  .wg-toolbar-group { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .wg-toolbar-label { font: 600 10.5px/1 Inter, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #9fb0bd; }
  .wg-toolbar { display: flex; gap: 6px; padding: 5px; background: #ece8df; border-radius: 14px; }
  .wg-frame { width: 402px; height: 812px; border-radius: 44px; overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,0.28), 0 0 0 10px #0c1c2b, 0 0 0 11px rgba(255,255,255,.06); }
  .wg-phone { height: 812px; }
  .wg-hint { display: block; max-width: 620px; margin: 0; text-align: center; font-size: 13px; line-height: 1.6; color: #cdd6dd; text-wrap: pretty; }
}
`;
