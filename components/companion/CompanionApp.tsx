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

import { Fragment, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useOnValueChange } from "@/components/useOnValueChange";
import { useRouter } from "next/navigation";
import {
  COMPANION_DEMO_TRIP,
  COMPANION_KIND,
  type CompanionItem,
  type CompanionPayment,
  type CompanionTrip,
  type CompanionWalletRow,
} from "@/data/companion-demo";
import type { TripAlert } from "@/data/trip-alerts";
import { loadGoogleMaps, googleMaps, googleMapsAvailable, type GMap, type GPlacesApi, type GPlacePrediction } from "@/lib/google-maps-loader";
import { Icon, type IconName } from "@/components/icons/Icon";
import PaymentCheckout from "@/components/companion/PaymentCheckout";
import { useDeviceClock } from "@/components/TripProgressStrip";
import { followAlong, type FollowStop } from "@/lib/trip-progress";
import { readDocumentOffline, saveDocumentOffline, readMessagesOffline, saveMessagesOffline } from "@/lib/offline-trip-store";

/** The blue the app already uses for its own accents — map notes, the
 * initials avatar, kickers. The chat toolbar's icons match it rather than
 * showing as whatever color the device's native emoji happen to render in. */
const ICON_BLUE = "#1f3f5c";

// Whether the device is offline, as a subscription rather than an effect that
// sets state — so it is correct on the first paint and never trips the
// set-state-in-effect rule. SSR always reports online (no navigator), and the
// first client paint reconciles to the real value.
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const getIsOffline = () => (typeof navigator !== "undefined" ? !navigator.onLine : false);
const getIsOfflineServer = () => false;

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
// Your own messages sit in a navy bubble (the messenger look), the other side's
// in white — gold stays for accents and the read tick.
const NAVY = "#14213d";

/**
 * The colour the app writes in — every heading, every line of body text.
 *
 * IT WAS #26323a, WHICH IS A WARM CHARCOAL WITH ALMOST NO COLOUR IN IT. Forty-
 * six uses of it, on a cream page, beside a gold: three warm neutrals and
 * nothing to hold them together, which is what "washed out" looks like when
 * you take it apart. The blue was in the palette all along and was only ever
 * reaching a message bubble and two small chips.
 *
 * Same weight, blue instead of grey: 13.62:1 on the cream against the old
 * 12.05, so nothing became harder to read on the way.
 */
const INK = "#17293a";

/**
 * The small grey the app writes its labels and times in.
 *
 * IT WAS #78716c, AND THAT IS 4.40:1 ON THE CREAM — under the 4.5 every one of
 * these needs, since they are all below 18px. Measured on /app/preview: the
 * wallet's "Flights", "Where you are staying" and "Held for you" headings all
 * came out at 4.40, and the eyebrow above every screen title was written in a
 * lighter grey again at 2.31. Not a theoretical fail: a stop's time, a
 * document's group and what screen you are on are what somebody reads this app
 * for, in daylight, on a phone.
 *
 * Two steps darker in the same warm family, and it clears everything it is
 * drawn on: 6.85 on the cream, 6.11 on the tab bar's band, 7.47 on white. Two
 * rather than one, because FAINT below had to move up to 4.5 as well and the
 * app reads by having two weights of grey, not one.
 */
const MUTED = "#5a544e";

/**
 * The fainter grey again: a message time, a date divider, a walk of four
 * minutes, a vote count — the metadata that should recede behind the label.
 *
 * IT WAS #a8a29e, WHICH IS 2.06:1 ON THE CHAT'S OWN BAND and 2.52 on white.
 * Measured on /app/preview: the date divider above a conversation, "Tuesday 27
 * October", came out at 2.06. A time under a message and a walking time
 * between two stops are not decoration; they are the two numbers somebody
 * actually reads off this screen while walking.
 *
 * 5.48 on the cream, 4.88 on the band, 5.97 on white — and still visibly
 * lighter than MUTED above it, which is what the two greys are for.
 */
const FAINT = "#6b625a";

/**
 * What is written ON the gold — the primary buttons, the selected day chip,
 * the selected tab.
 *
 * IT WAS THE CREAM, AND CREAM ON GOLD IS 2.86:1. Every primary action in this
 * app sat at well under half of what AA asks: "See the two options", "Create
 * poll", the send button, the selected day in the strip, the tab you are on.
 *
 * The gold is the brand and does not move. The navy already in this palette
 * takes it to 5.13:1 against exactly the same gold, so nothing on the screen
 * changes colour except the words, which become readable. A gold pill with
 * navy on it still reads as the selected one — the pill was always the signal,
 * not the shade of the text.
 */
const ON_GOLD = NAVY;

/** A message time, "8:24 AM" — shown small under each bubble, like a messenger. */
function msgTime(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// A currency code the payment carried empty or malformed used to throw a
// RangeError out of Intl and crash the whole balance card, rather than the
// amount simply rendering without a symbol. Falls back to USD on a bad code.
function currencyFmt(currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" });
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  }
}

/**
 * A voice note played the way a messenger plays one — a gold play/pause button
 * and a progress bar — rather than the browser's default audio strip. Play and
 * pause are drawn as CSS shapes so it stays two-colour with no icon set to
 * depend on. The MediaRecorder webm a phone produces often reports its duration
 * as Infinity until it is played, so the bar fills only once a finite duration
 * is known, and the readout leans on elapsed time, which is always reliable.
 */
function ChatVoiceNote({ mediaId, mine }: { mediaId: string; mine: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };
  const track = mine ? "rgba(255,255,255,.28)" : "rgba(20,33,61,.16)";
  const fill = mine ? CREAM : NAVY;
  const pct = Number.isFinite(dur) && dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 190, padding: "2px 0" }}>
      <button
        type="button"
        onClick={() => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", border: 0, cursor: "pointer", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {playing ? (
          <span style={{ display: "flex", gap: 3 }}>
            <span style={{ width: 3.5, height: 13, background: NAVY, borderRadius: 1 }} />
            <span style={{ width: 3.5, height: 13, background: NAVY, borderRadius: 1 }} />
          </span>
        ) : (
          <span style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: `11px solid ${NAVY}`, marginLeft: 2 }} />
        )}
      </button>
      <div style={{ flex: 1, minWidth: 50, height: 4, borderRadius: 2, background: track, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: fill, transition: "width .1s linear" }} />
      </div>
      <span style={{ fontSize: 11, opacity: 0.8, minWidth: 30, textAlign: "right" }}>{fmt(playing || cur ? cur : dur)}</span>
      <audio
        ref={ref}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
        // A MediaRecorder webm — what this app records — reports duration
        // Infinity at loadedmetadata and only resolves it later, on
        // durationchange. Without this the progress bar for every recorded
        // voice note stayed frozen at zero for its whole life.
        onDurationChange={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
        style={{ display: "none" }}
      >
        <source src={`/api/media?id=${encodeURIComponent(mediaId)}`} />
      </audio>
    </div>
  );
}

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
/**
 * "Send this one to the traveler" — one file at a time.
 *
 * WHY IT IS PER FILE AND NOT PER TRIP. The same list holds the boarding pass
 * the client needs at the gate and the supplier confirmation with the
 * commission on it. A single switch over the lot would either withhold the
 * first or publish the second, so this is a decision taken once per document,
 * by the person who knows which is which.
 *
 * OFF UNTIL PRESSED. Nothing uploaded before this existed became visible; see
 * the note on ItinAttachment.shared.
 */
function WalletShareToggle({
  tripId,
  row,
  attachment,
  onSaved,
}: {
  tripId: string;
  row: CompanionWalletRow;
  attachment: { id: string; name: string; shared?: boolean };
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shared = attachment.shared === true;

  async function flip() {
    setBusy(true);
    setError("");
    try {
      // The same read-modify-write WalletAttach does, against the one file.
      const key = row.stopKind === "flight" ? "flights" : row.stopKind === "lodging" ? "lodging" : "activities";
      const got = await fetch(`/api/account/itinerary?trip=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      const gotData = (await got.json().catch(() => null)) as { itinerary?: Record<string, unknown> } | null;
      const itinerary = gotData?.itinerary;
      const rows = itinerary?.[key];
      if (!itinerary || !Array.isArray(rows)) {
        setError("Could not find that stop.");
        return;
      }
      const stop = (rows as Array<{ id: string; attachments?: Array<{ id: string; shared?: boolean }> }>).find(
        (r) => r.id === row.id,
      );
      const file = stop?.attachments?.find((a) => a.id === attachment.id);
      if (!file) {
        setError("That file is no longer on the trip.");
        return;
      }
      file.shared = !shared;

      const saved = await fetch("/api/account/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itinerary, tripId }),
      });
      if (!saved.ok) {
        setError("Could not save that.");
        return;
      }
      onSaved();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => void flip()}
        disabled={busy}
        aria-pressed={shared}
        style={{
          cursor: busy ? "default" : "pointer",
          border: "none",
          background: "none",
          ...TAP_INLINE,
          font: "600 11.5px/1 inherit",
          color: busy ? "#a8a29e" : shared ? "#15803d" : MUTED,
          textDecoration: "underline",
        }}
      >
        {busy ? "Saving…" : shared ? "Traveler can open this" : "Send to the traveler"}
      </button>
      {error && <span style={{ fontSize: 11.5, color: "#b42318" }}>{error}</span>}
    </span>
  );
}

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
          // 12.5px of underlined text is a 15-pixel-tall thing to hit with a
          // thumb. TAP_INLINE pads it to a real target and pulls the padding
          // back out with negative margin, so nothing around it moves.
          display: "inline-block",
          ...TAP_INLINE,
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
        style={{ alignSelf: "flex-start", border: 0, background: "none", cursor: "pointer", ...TAP_INLINE, fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
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
        style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter,sans-serif", fontSize: 13.5, lineHeight: 1.5, color: INK, outline: "none", resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => void save()} disabled={busy} className="wg-press" style={{ border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, borderRadius: 10, minHeight: 44, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} disabled={busy} style={{ border: "1px solid rgba(38,50,58,.16)", background: "none", cursor: "pointer", borderRadius: 10, minHeight: 44, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, color: "#57534e" }}>
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
        <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Your share</p>
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

/**
 * A wallet document — a boarding pass, a booking confirmation — that opens with
 * no signal.
 *
 * Online it opens the served file exactly as a plain link would. Offline it
 * opens the copy the background cache (lib/offline-trip-store) already put on
 * the device when the trip was last online — the traveler never downloads
 * anything by hand; the file is simply already in the wallet. Only the client's
 * own files are cached (offlineCapable): the advisor opens theirs through their
 * logged-in account, which is an online-only action anyway.
 */
function WalletDocLink({
  url,
  fileId,
  name,
  offlineCapable,
}: {
  url: string;
  fileId: string;
  name: string;
  offlineCapable: boolean;
}) {
  const [note, setNote] = useState("");
  // An image document (a boarding pass photographed or exported as a picture)
  // opened in a fitted overlay, rather than a raw new tab where a phone shows it
  // at full pixel size and you have to pinch it down.
  const [imageView, setImageView] = useState<string | null>(null);

  async function open(e: ReactMouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setNote("");
    // Get the bytes: the saved copy when offline, otherwise the served file.
    let blob: Blob | null = null;
    if (offlineCapable && typeof navigator !== "undefined" && !navigator.onLine) {
      blob = await readDocumentOffline(fileId);
      if (!blob) {
        setNote("Not saved for offline yet — open it once with a connection.");
        return;
      }
    } else {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) blob = await r.blob();
      } catch {
        /* fall through to a plain open */
      }
    }
    if (!blob) {
      window.open(url, "_blank", "noopener");
      return;
    }
    if (blob.type.startsWith("image/")) {
      // Fit it to the screen instead of opening it at native resolution.
      setImageView(URL.createObjectURL(blob));
      return;
    }
    // A PDF (or anything else) hands off to the OS viewer, which sizes it.
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => void open(e)}
        style={{ ...TAP_INLINE, fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
      >
        📎 {name}
      </a>
      {note && <span style={{ fontSize: 11, color: "#b42318" }}>{note}</span>}
      {imageView && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => { URL.revokeObjectURL(imageView); setImageView(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,20,25,.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); URL.revokeObjectURL(imageView); setImageView(null); }}
            aria-label="Close"
            style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top))", right: 14, border: 0, background: "rgba(255,255,255,.15)", color: "#fff", width: 38, height: 38, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageView} alt={name} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }} />
        </div>
      )}
    </span>
  );
}

export default function CompanionApp({
  trip = COMPANION_DEMO_TRIP,
  chat,
  advisorInbox = false,
  advisorShareId,
  sharedDraft,
}: {
  trip?: CompanionTrip;
  chat?: CompanionChat;
  /** The advisor's own side: a Messages tab that lists every client's chat. */
  advisorInbox?: boolean;
  /** The share token of the trip the advisor is currently viewing, when it has
   *  a client link. Lets "Ask about this" open THAT client's thread directly
   *  (with the attraction pinned) instead of dropping the advisor on the inbox
   *  list. Absent when the trip has never been shared — then the inbox shows. */
  advisorShareId?: string;
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
  // True while the message composer holds the keyboard open. The bottom tab bar
  // hides then rather than riding up squeezed between the composer and the
  // keyboard — the composer stays put on top of the keyboard, the tabs come
  // back the moment the field is dismissed (WhatsApp's own behaviour).
  const [composerUp, setComposerUp] = useState(false);
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

  // KEEP THE WALLET DOCUMENTS ON THE DEVICE. Whoever opens the trip with a
  // connection — the client through their share link, the advisor through their
  // own account — gets every boarding pass and confirmation quietly saved into
  // the wallet, so it opens at the gate with no signal (WalletDocLink reads it
  // back; lib/offline-trip-store holds it). Each side pulls from its own door:
  // the client from the share-token trip-file route, the advisor from the
  // login-gated account route (same-origin cookies ride along). Sequential and
  // fail-soft: it stays under the rate limit, skips anything already saved, and
  // leaves anything it can't reach for the next online open.
  useEffect(() => {
    // The client needs their share token to fetch; the advisor fetches by
    // account and needs none. Without either door, there is nothing to pull.
    const shareId = liveChat?.shareId;
    if (isClientViewer && !shareId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let cancelled = false;
    void (async () => {
      const files = trip.walletGroups.flatMap((g) => g.rows).flatMap((r) => r.attachments ?? []);
      for (const file of files) {
        if (cancelled) return;
        try {
          if (await readDocumentOffline(file.id)) continue;
          const url = isClientViewer
            ? `/api/trip-file/${encodeURIComponent(shareId!)}?id=${encodeURIComponent(file.id)}`
            : `/api/account/attachments?id=${encodeURIComponent(file.id)}`;
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          await saveDocumentOffline(file.id, blob);
        } catch {
          /* leave it for the next online open */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isClientViewer, liveChat?.shareId, trip.walletGroups]);

  // Opening the thread marks it read server-side (LiveChat's own fetch), but the
  // 15s peek poll is what clears this badge — so without clearing it here the
  // dot flashed back onto the Advisor tab for a few seconds after reading and
  // navigating away. Clear it the moment the messages screen is entered.
  // During render, not after the commit: as an effect the Advisor tab painted
  // once still carrying its dot after the screen had already opened.
  useOnValueChange(st.screen, () => {
    if (st.screen === "messages") setUnread(false);
  });

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
  /**
   * The Concierge/Guide and Traveler/Advisor switches, and the "Concierge" tab
   * name, are a demonstration of a tier that is not built — `concierge` is true
   * for the scripted sample and nothing else. On /app/preview, which promises
   * "this is what your client opens", they were three controls a client will
   * never have, sitting beside the Advisor tab with nothing to tell them apart.
   * The scripted thread survives; the switches do not.
   */
  const showcaseSwitches = hasConcierge && !trip.previewAsClient;
  const isConcierge = hasConcierge && (trip.previewAsClient || st.tmode === "concierge");
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
  const offline = useSyncExternalStore(subscribeOnline, getIsOffline, getIsOfflineServer);
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
  // READ / UNREAD on the Changes screen. The owner (a signed-in account) has
  // the server's own `acknowledged` flag; a client on a per-trip code has no
  // account and is never asked to manage anything server-side, so their read
  // state lives in their own browser. `readNow` folds both together, plus
  // whatever was marked read this session, so opening the screen clears the
  // badge at once rather than waiting for a reload.
  const alertKey = trip.tripId ?? liveChat?.shareId ?? null;
  /**
   * READ FROM STORAGE AS THE INITIAL VALUE, not in an effect afterwards.
   *
   * This ran as an effect, which is the setState the rule refuses — and it was
   * also visibly wrong: the alerts list painted once with everything unread
   * before the stored set arrived, so a client opening the screen saw their
   * own already-read alerts flash as new. A lazy initialiser runs before the
   * first paint instead.
   *
   * Storage blocked, or nothing stored, leaves the set empty — everything
   * reads as unread, which is the safe end of the mistake.
   */
  const [readNow, setReadNow] = useState<Set<string>>(() => {
    if (!isClientViewer || !alertKey || typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(`wg-alerts-read:${alertKey}`);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  // A client's read state is theirs alone (readNow, from their browser). The
  // server's `acknowledged` is the OWNER's own read flag — folding it into the
  // client's view would let the advisor's reading quietly mark the client's
  // alerts seen, which they were not.
  const isAlertRead = useCallback(
    (a: TripAlert) => readNow.has(a.id) || (!isClientViewer && a.acknowledged),
    [readNow, isClientViewer],
  );
  const unreadAlerts = liveAlerts.filter((a) => !isAlertRead(a));
  // Frozen the moment the Changes screen opens, so the cards being read now
  // stay marked new even as opening the screen records them read (clearing the
  // badge and, next time, the highlight). Opening is the read action — there is
  // no separate dismiss to press.
  const [seenOnOpen, setSeenOnOpen] = useState<Set<string> | null>(null);
  /**
   * THE SNAPSHOT DURING RENDER, THE SIDE EFFECTS AFTER IT — which used to be
   * one effect doing all three.
   *
   * Taking the snapshot in an effect meant the Changes screen painted once
   * with seenOnOpen still null, so every card was drawn without its "new"
   * highlight for a frame and then gained it. Adjusting during render is what
   * this reaction actually is: the screen changed, freeze what was unread at
   * that moment.
   *
   * Writing to storage and telling the server are genuine side effects and
   * stay in effects below, where they belong and where React may safely run
   * them once.
   */
  useOnValueChange(st.screen, () => {
    if (st.screen !== "alerts") {
      setSeenOnOpen(null);
      return;
    }
    const unreadIds = liveAlerts.filter((a) => !isAlertRead(a)).map((a) => a.id);
    setSeenOnOpen(new Set(unreadIds));
    if (unreadIds.length > 0) setReadNow((prev) => new Set([...prev, ...unreadIds]));
  });

  // A client's read set is theirs alone and lives in their browser. Written
  // whenever it changes rather than only when the screen opens, so the two can
  // never drift apart.
  useEffect(() => {
    if (!isClientViewer || !alertKey) return;
    try {
      localStorage.setItem(`wg-alerts-read:${alertKey}`, JSON.stringify([...readNow]));
    } catch {
      /* storage blocked — clears for this session only, which is fine */
    }
  }, [readNow, isClientViewer, alertKey]);

  // The owner's own read flag, server-side. Once per opening of the screen.
  useEffect(() => {
    if (st.screen !== "alerts" || isClientViewer || !trip.tripId) return;
    void fetch("/api/account/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: trip.tripId, all: true }),
    });
  }, [st.screen, isClientViewer, trip.tripId]);
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
    alerts: open ? "One needs you" : unreadAlerts.length > 0 ? `${unreadAlerts.length} to see` : settled ? "All settled" : "Nothing right now",
    wallet: "Kept offline",
    profile: hasConcierge ? "The trip is in your name" : "This trip, and you",
    pay: trip.payment?.label ?? "",
  };

  // This runs every render, not only on the activity screen. A real builder
  // trip always has a placeholder item on every day, but the CompanionTrip type
  // permits a day index out of range or a day with no items, so fall back to a
  // real day and guard the kind lookup rather than crash the whole app on mount.
  const actDay = days[st.actDay] ?? days[trip.todayIndex] ?? days[0];
  const act = actDay.items[st.actIdx] || actDay.items[0];
  const actKind = (act ? COMPANION_KIND[act.kind] : undefined) || COMPANION_KIND.rest;

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
  const tabDefs: [Screen, string, IconName][] = [["home", "Trip", "map-pin"]];
  if (hasConcierge)
    tabDefs.push(
      trip.previewAsClient
        ? // Where a client's advisor thread sits, under the name a client sees.
          [conciergeTabScreen, "Advisor", "chat"]
        : [conciergeTabScreen, isGuideMode ? "Guide" : "Concierge", "sparkle"],
    );
  if (hasMessages && conciergeTabScreen !== "messages") tabDefs.push(["messages", advisorInbox ? "Messages" : "Advisor", "chat"]);
  tabDefs.push(["wallet", "Wallet", "wallet"], ["profile", "You", "account"]);
  const tabs = tabDefs.map(([id, label, icon]) => {
    const on = st.screen === id || (id === "home" && (st.screen === "day" || st.screen === "activity" || st.screen === "alerts"));
    return { id, label, icon, on, badge: id === "messages" && unread && st.screen !== "messages" };
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
      <div style={{ position: "relative", margin: "14px 14px 0", height: 196, borderRadius: 20, overflow: "hidden", background: `linear-gradient(150deg, ${NAVY} 0%, #24405f 55%, #2c4a66 100%)`, color: CREAM }}>
        {/* Gold on the navy rather than cream on the gold. The panel carried
            the only gold on the opening screen and has become the only blue;
            the mark is what keeps both of them there. */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, opacity: 0.5 }}>
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
          <button onClick={() => go("alerts")} className="wg-press" style={{ alignSelf: "flex-start", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, font: `400 14px/1 ${serif}`, padding: "12px 20px", borderRadius: 14 }}>See the two options</button>
        </div>
      )}
      {settled && trip.swaps && (
        <div style={{ margin: "18px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#e7edf1", border: "1px solid rgba(21,50,75,.3)", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker("#1f3f5c")}>Settled</span>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#0b2437" }}>{trip.swaps[st.swap!].reply}</div>
        </div>
      )}

      <div style={{ marginTop: 22, paddingLeft: 20 }}>
        {/* "1 days" read wrong for a one-day trip; the odd hardcoded eight-day
            special case is gone with it. */}
        <div style={kicker(MUTED)}>{`${trip.days.length} ${trip.days.length === 1 ? "day" : "days"}`}</div>
      </div>
      <div style={{ display: "flex", gap: 9, overflowX: "auto", padding: "12px 20px 4px", scrollbarWidth: "none" }}>
        {days.map((d, i) => {
          const on = i === st.selDay;
          return (
            <button key={i} onClick={() => setSt((s) => ({ ...s, selDay: i, screen: "day", prev: "home" }))} className="wg-press" style={{ flex: "none", width: 64, padding: "11px 0 12px", borderRadius: 16, border: `1px solid ${on ? GOLD : d.today ? GOLD : "rgba(38,50,58,.1)"}`, background: on ? GOLD : d.today ? "#f7eee0" : "#ffffff", color: on ? ON_GOLD : INK, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
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
          <button onClick={() => go("day")} className="wg-link" style={{ border: 0, background: "none", cursor: "pointer", font: "600 12px/1 Inter,sans-serif", color: "#765321", ...TAP_INLINE }}>Full day →</button>
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
              <span style={{ flex: "none", width: 52, font: `600 ${highlight ? 13.5 : 12.5}px/1.5 ui-monospace,Menlo,monospace`, color: highlight ? "#765321" : MUTED, paddingTop: 2 }}>{it.time}</span>
              <span style={{ flex: "none", width: 9, height: 9, borderRadius: 14, background: it.dot, marginTop: 6 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                {highlight && <span style={{ ...kicker("#765321"), marginBottom: 1 }}>{isNow ? "Happening now" : "Next up"}</span>}
                <span style={{ fontSize: highlight ? 17 : 15, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
                <span style={{ fontSize: 12.5, color: MUTED }}>{it.place}</span>
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
            {currencyFmt(trip.payment.currency).format(
              (trip.payment.nextDue ? Math.min(trip.payment.nextDue.amountCents, trip.payment.remainingCents) : trip.payment.remainingCents) / 100,
            )}
            {trip.payment.nextDue?.dueDate && <span style={{ font: "600 13px/1 Inter,sans-serif", color: "#765321" }}> · Due {trip.payment.nextDue.dueDate}</span>}
          </div>
          <button onClick={() => go("pay")} className="wg-press" style={{ alignSelf: "flex-start", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, font: `400 14px/1 ${serif}`, padding: "12px 20px", borderRadius: 14 }}>
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
          <button onClick={() => go(usesRealChat ? "messages" : "chat")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: INK }}>Message</button>
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
          <button onClick={() => go("chat")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: INK }}>Open guide</button>
        </div>
      )}
      {advisorInbox && (
        <div style={{ margin: "14px 14px 0", padding: "16px 18px", borderRadius: 20, background: "#ece8df", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ flex: "none", width: 46, height: 46, borderRadius: 14, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", font: `400 20px/1 ${serif}`, color: "#765321" }}>❝</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Your clients</span>
            <span style={{ fontSize: 12, color: "#57534e" }}>Every trip you have shared, in one place</span>
          </div>
          <button onClick={() => go("messages")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: INK }}>Open</button>
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
          <button onClick={() => go("messages")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "11px 16px", borderRadius: 14, color: INK }}>Message</button>
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
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: INK, textWrap: "pretty" }}>{t.line}</p>
          {t.action && (
            <button onClick={() => t.go && go(t.go)} className="wg-press" style={{ alignSelf: "flex-start", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, font: `400 13.5px/1 ${serif}`, padding: "11px 18px", borderRadius: 14 }}>{t.action}</button>
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
            <div style={{ flex: "none", width: 54, paddingTop: 3, textAlign: "right", font: `600 12.5px/1.4 ui-monospace,Menlo,monospace`, color: isNow ? "#765321" : MUTED }}>{it.time}</div>
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
                <span style={{ fontSize: 12.5, color: MUTED }}>{it.place}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>{it.note}</span>
              </button>
              {it.walk && <span style={{ font: "400 11px/1 ui-monospace,Menlo,monospace", color: FAINT, paddingLeft: 2 }}>{it.walk}</span>}
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
      {/* No day-level "ask" here on purpose — a question belongs to a specific
          stop, not a whole day. Tap any attraction above to open it and "Ask
          about this", which pins that attraction to the message. */}
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
        {act.note && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: INK, textWrap: "pretty" }}>{act.note}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(38,50,58,.09)" }}>
          {actRows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "14px 16px", background: "#ffffff" }}>
              <span style={{ flex: "none", font: "600 11px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: MUTED }}>{r.label}</span>
              <span style={{ textAlign: "right", fontSize: 13.5, lineHeight: 1.4, color: INK }}>{r.value}</span>
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
              style={{ border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Directions
            </a>
          )}
          {act.phone && (
            <a
              href={`tel:${act.phone.replace(/[^\d+]/g, "")}`}
              className="wg-warm"
              style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, color: INK, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
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
              style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, color: INK, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
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
            style={{ border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", font: `400 14px/1 ${serif}`, padding: "13px 20px", borderRadius: 14, color: INK }}
          >
            Ask about this
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
      {/* The advisor's own side of the trip: a way to send the traveler a line
          by hand. Shown only where the account actually serves clients
          (advisorInbox), never on a client's own view. */}
      {!isClientViewer && advisorInbox && trip.tripId && <AdvisorAlertComposer tripId={trip.tripId} />}
      {/* Real flight-status alerts and hand-sent notes — never present on the
          demo. Newest first; unread until this screen is opened. */}
      {[...liveAlerts].reverse().map((a) => {
        // New until this view opened, then plain — the "did I already see this?"
        // the traveler asked for. Held to the open-time snapshot so a card does
        // not fade out from under them while they are still reading it.
        const unread = seenOnOpen ? seenOnOpen.has(a.id) : !isAlertRead(a);
        return (
          <div key={a.id} style={{ padding: "18px 18px", borderRadius: 20, background: unread ? "#f7eee0" : "#ffffff", border: `1px solid ${unread ? "rgba(183,138,74,.28)" : "rgba(38,50,58,.08)"}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={kicker(unread ? "#765321" : MUTED)}>{new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              {unread && <span aria-label="New" style={{ width: 7, height: 7, borderRadius: 14, background: GOLD }} />}
            </span>
            <div style={{ font: `400 20px/1.15 ${serif}`, color: unread ? "#4a3016" : INK }}>{a.title}</div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: unread ? "#5c4322" : "#57534e", textWrap: "pretty" }}>{a.note}</p>
          </div>
        );
      })}
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
                <span style={{ fontSize: 13, lineHeight: 1.5, color: INK, textWrap: "pretty" }}>{o.note}</span>
                <span style={{ font: "400 11px/1 ui-monospace,Menlo,monospace", color: MUTED }}>{o.meta}</span>
              </button>
            );
          })}
          <button onClick={confirmSwap} disabled={!st.pick} className="wg-press" style={{ border: 0, cursor: st.pick ? "pointer" : "default", background: GOLD, color: ON_GOLD, font: `400 15px/1 ${serif}`, padding: "15px 20px", borderRadius: 14, opacity: st.pick ? 1 : 0.45 }}>
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
          <span style={kicker(MUTED)}>Changes</span>
          <div style={{ font: `400 20px/1.15 ${serif}` }}>Nothing needs a decision</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>When something on the trip moves, it shows up here — with what changed and what, if anything, it asks of you.</p>
        </div>
      )}
      {handledSteps.length > 0 && (
      <div style={{ padding: "20px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={kicker(MUTED)}>Handled for you · Monday 07:20</span>
        <div style={{ font: `400 21px/1.12 ${serif}` }}>Sunday&apos;s flight home moved to 13:05</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: INK, textWrap: "pretty" }}>The airline moved it by an hour and three quarters. Nothing was asked of you; here is what happened.</p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {handledSteps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: "none", width: 11, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: 11, height: 11, borderRadius: 14, background: "#15324b", marginTop: 4 }} />
                {i < handledSteps.length - 1 && <span style={{ flex: 1, width: 1.5, background: "rgba(38,50,58,.12)" }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{s.what}</span>
                <span style={{ font: "400 11.5px/1.4 ui-monospace,Menlo,monospace", color: FAINT }}>{s.when}</span>
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
        <div style={{ alignSelf: "center", font: "400 11px/1 ui-monospace,Menlo,monospace", color: FAINT, background: "#ece8df", padding: "7px 12px", borderRadius: 14 }}>Tuesday 27 October</div>
        {st.messages.map((m, i) => {
          const mine = m.from === "me";
          return (
            /* THE SAME SHAPE AS THE REAL THREAD. The message block caps at 82%
               of the thread and sits on its own side; the bubble inside sizes
               to its own text against that definite width, so "yes" is a short
               bubble rather than one letter per line. This used to be a flat
               80% on the bubble itself, which is what LiveChat was fixed away
               from — leaving the sample, the one public demonstration of the
               product, showing the design the product no longer has. */
            <div key={i} style={{ maxWidth: "82%", alignSelf: mine ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "100%", width: "fit-content", marginLeft: mine ? "auto" : 0, background: mine ? NAVY : "#ffffff", color: mine ? CREAM : INK, borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "13px 15px", fontSize: 14, lineHeight: 1.5, boxShadow: "0 1px 2px rgba(23,45,82,.08)" }}>{m.text}</div>
            </div>
          );
        })}
        {st.typing && (
          <div style={{ alignSelf: "flex-start", background: "#ffffff", borderRadius: "14px 14px 14px 4px", padding: "14px 18px", font: "400 12px/1 ui-monospace,Menlo,monospace", color: MUTED, animation: "wgPulse 1.2s ease-in-out infinite" }}>{(st.role === "advisor" ? "The Cohens are" : `${firstName} is`)} typing…</div>
        )}
      </div>
      <div style={{ flexShrink: 0, position: "sticky", bottom: 0, background: CREAM, borderTop: "1px solid rgba(38,50,58,.08)", padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none" }}>
          {quickReplies.map((q, i) => (
            <button key={i} onClick={() => send(q)} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", cursor: "pointer", fontSize: 12.5, minHeight: 44, padding: "9px 16px", borderRadius: 14, color: INK, whiteSpace: "nowrap" }}>{q}</button>
          ))}
        </div>
        {/* ONE ROUNDED BAR, the shape the real thread was redesigned into —
            paperclip on the left, the field, a camera on the right, the round
            send button beside it. The sample kept a plain box and a square
            gold arrow, so the app a buyer was shown did not look like the app
            their client would open. The controls here are the demonstration
            and do nothing: this trip has no upload behind it. */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", gap: 1, background: "#ffffff", border: "1px solid rgba(38,50,58,.16)", borderRadius: 23, padding: "2px 4px 2px 3px" }}>
            <span aria-hidden="true" style={{ color: ICON_BLUE, opacity: 0.55, width: 38, height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="paperclip" className="h-[21px] w-[21px]" />
            </span>
            <input
              value={st.draft}
              onChange={(e) => setSt((s) => ({ ...s, draft: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder={st.role === "advisor" ? "Reply to the Cohens…" : `Message ${firstName}…`}
              /* 16px, not 14: iOS Safari zooms the whole page into any input
                 under 16px the moment it is focused. */
              style={{ flex: 1, minWidth: 0, border: 0, background: "none", padding: "11px 6px 11px 8px", fontFamily: "Inter,sans-serif", fontSize: 16, lineHeight: 1.4, color: INK, outline: "none" }}
            />
            <span aria-hidden="true" style={{ color: ICON_BLUE, opacity: 0.55, width: 38, height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="camera" className="h-[21px] w-[21px]" />
            </span>
          </div>
          <button onClick={() => send()} aria-label="Send" className="wg-press" style={{ flex: "none", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, width: 46, height: 46, borderRadius: 23, fontSize: 17, padding: 0 }}>↑</button>
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
          <div style={{ ...kicker(MUTED), paddingLeft: 4 }}>{g.name}</div>
          {g.items.map((it, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRadius: 16, background: it.tint, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: INK, textWrap: "pretty" }}>{it.note}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  /** True when this row's documents are the shipped samples, which need no
   *  account and no share token to open. */
  const att0Sample = (r: { attachments?: Array<{ sampleUrl?: string }> }) =>
    Boolean(r.attachments?.some((a) => a.sampleUrl));

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
          <span style={kicker(MUTED)}>Trip balance</span>
          <span style={{ font: `400 19px/1.2 ${serif}`, color: "#0b2437" }}>
            {currencyFmt(trip.payment.currency).format(trip.payment.remainingCents / 100)}
            {trip.payment.remainingCents > 0 ? " remaining" : " — paid in full"}
          </span>
          <span style={{ fontSize: 12.5, color: MUTED }}>
            {currencyFmt(trip.payment.currency).format(trip.payment.paidCents / 100)} paid so far
            {trip.payment.totalCents ? ` of ${currencyFmt(trip.payment.currency).format(trip.payment.totalCents / 100)} total` : ""}
          </span>
        </button>
      )}
      {trip.walletGroups.length === 0 && (
        <p style={{ margin: "4px 4px 0", fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>Flights, where you are staying and anything held for you appear here as they are added to the trip.</p>
      )}
      {trip.walletGroups.map((g, gi) => (
        <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ ...kicker(MUTED), paddingLeft: 4 }}>{g.name}</div>
          {g.rows.map((r, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>{r.title}</span>
                <span style={{ flex: "none", font: "400 11.5px/1 ui-monospace,Menlo,monospace", color: MUTED }}>{r.ref}</span>
              </div>
              {r.sub && <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>{r.sub}</span>}
              {(r.phone || r.address) && (
                /* CALL AND DIRECTIONS ARE THE TWO THINGS SOMEBODY TAPS WHILE
                   STANDING IN A STREET, and they were 12.5px of underlined
                   text with no padding at all. TAP_INLINE gives each a real
                   target; the gap goes to 36 so that after the negative
                   margins the two zones still do not touch — a thumb that
                   misses Directions must not place a phone call. */
                <div style={{ display: "flex", gap: 36, marginTop: 2 }}>
                  {r.phone && (
                    <a
                      href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                      style={{ ...TAP_INLINE, fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
                    >
                      Call
                    </a>
                  )}
                  {r.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...TAP_INLINE, fontSize: 12.5, fontWeight: 600, color: "#1f3f5c", textDecoration: "underline" }}
                    >
                      Directions
                    </a>
                  )}
                </div>
              )}
              {/* THE SAME LIST, TWO DOORS. Whoever owns the account opens a
                  file through their own account; the client opens it through
                  this trip's code, and only the files the adviser marked for
                  them are in the payload at all. See app/api/trip-file. */}
              {r.attachments && r.attachments.length > 0 && (att0Sample(r) || !isClientViewer || liveChat?.shareId) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  {r.attachments.map((att) => (
                    <span key={att.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      {/* A shipped sample is a static file and needs neither of
                          the two doors below — it has no owner to check and no
                          share token to check it against. */}
                      <WalletDocLink
                        url={
                          att.sampleUrl
                            ? att.sampleUrl
                            : isClientViewer
                              ? `/api/trip-file/${encodeURIComponent(liveChat!.shareId)}?id=${encodeURIComponent(att.id)}`
                              : `/api/account/attachments?id=${encodeURIComponent(att.id)}`
                        }
                        fileId={att.id}
                        name={att.name}
                        offlineCapable={!att.sampleUrl}
                      />
                      {!att.sampleUrl && !isClientViewer && trip.tripId && r.id && r.stopKind && (
                        <WalletShareToggle
                          tripId={trip.tripId}
                          row={r}
                          attachment={att}
                          onSaved={() => router.refresh()}
                        />
                      )}
                    </span>
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
      <div style={{ ...kicker(MUTED), paddingLeft: 4 }}>Getting around, day by day</div>
      {guideDays.length === 0 && (
        <p style={{ margin: "0 4px", fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>Nothing added yet.</p>
      )}
      {guideDays.map((d, i) => (
        <div key={d.date ?? i} style={{ padding: "15px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: MUTED }}>{d.name}</span>
          {d.guideNote && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: INK, textWrap: "pretty" }}>{d.guideNote}</p>}
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
          <div style={{ ...kicker(MUTED), paddingLeft: 4 }}>{g.name}</div>
          {g.items.map((it, i) => (
            <div key={i} style={{ padding: "16px 18px", borderRadius: 16, background: it.tint, border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: INK, textWrap: "pretty" }}>{it.note}</span>
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
          <div style={{ ...kicker(MUTED), paddingLeft: 4 }}>From your planning answers</div>
          {trip.prefs.map((p, i) => (
            <div key={i} style={{ padding: "15px 18px", borderRadius: 16, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14 }}>
              <span style={{ font: "600 11px/1 Inter,sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: MUTED }}>{p.label}</span>
              <span style={{ textAlign: "right", fontSize: 13.5, lineHeight: 1.4 }}>{p.value}</span>
            </div>
          ))}
        </div>
      )}
      {guideSection}
      {/* Trip kind — Concierge or Guide — lives here on the phone, where the
          desktop showcase has it as a toolbar above the frame. Only when a
          live advisor is attached; a wired trip is read one way. */}
      {showcaseSwitches && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ ...kicker(MUTED), paddingLeft: 4 }}>How you are reading this trip</div>
          <div style={{ display: "flex", gap: 6, padding: 5, background: "#ece8df", borderRadius: 14, alignSelf: "flex-start" }}>
            {tmodeOpts.map((o) => (
              <button key={o.id} onClick={o.pick} style={{ border: 0, cursor: "pointer", font: `400 13px/1 ${serif}`, padding: "10px 16px", borderRadius: 14, background: o.bg, color: o.fg }}>{o.label}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding: 20, borderRadius: 20, background: "#f7eee0", border: "1px solid rgba(183,138,74,.25)", display: "flex", flexDirection: "column", gap: 11 }}>
        {/* A client on a code from their advisor has no account — "signed in"
            would simply be false for them, so this reads differently for the
            two people who can land on this screen. */}
        <span style={kicker("#765321")}>{liveChat?.side === "client" ? "Your trip" : "Signed in as"}</span>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#5c4322", textWrap: "pretty" }}>
          {liveChat?.side === "client"
            ? "You opened this with the code your advisor sent you — no account needed."
            : st.role === "advisor"
              ? "The advisor side: the trips you are holding today, and the one that needs a decision from you."
              : "The trip is in your name. Two others can look at it; nobody but you can change it."}
        </p>
        {showcaseSwitches && (
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
      <AdvisorInbox
        pendingShare={pendingShare}
        onPendingShareUsed={() => setPendingShare(null)}
        onComposerFocus={setComposerUp}
        openShareId={advisorShareId}
        subject={st.chatSubject}
        onSubjectUsed={() => setSt((s) => ({ ...s, chatSubject: null }))}
        places={shareablePlaces}
      />
    ) : liveChat ? (
      <LiveChat chat={liveChat} subject={st.chatSubject} onSubjectUsed={() => setSt((s) => ({ ...s, chatSubject: null }))} places={shareablePlaces} onComposerFocus={setComposerUp} />
    ) : (
      guideChat
    );
  else if (st.screen === "wallet") body = walletScreen;
  else if (st.screen === "profile") body = profileScreen;
  else if (st.screen === "pay") body = payScreen;

  // The advisor's Messages tab is a root tab, reached from the bottom pill, and
  // its inbox carries its own back arrow (an open thread → the conversation
  // list). So the app header shows NO back of its own there — two back arrows
  // stacked in one conversation was the confusion. To leave Messages for the
  // trip, the bottom pill does it, the same as any other tab.
  const canBack = st.screen !== "home" && !(advisorInbox && st.screen === "messages");

  // ── the phone itself ────────────────────────────────────────────────────
  const phone = (
    <div className="wg-phone" style={{ display: "flex", flexDirection: "column", background: CREAM, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}>
      {/* header */}
      <div style={{ flexShrink: 0, padding: "calc(20px + env(safe-area-inset-top)) 18px 10px", display: "flex", alignItems: "center", gap: 10, background: CREAM, borderBottom: "1px solid rgba(38,50,58,.08)" }}>
        {canBack && (
          <button onClick={back} aria-label="Back" className="wg-fade" style={{ border: "1px solid rgba(38,50,58,.14)", background: "#ffffff", width: 34, height: 34, borderRadius: 14, cursor: "pointer", fontSize: 15, color: "#57534e", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>←</button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ font: "600 9.5px/1 Inter,sans-serif", letterSpacing: ".14em", textTransform: "uppercase", color: MUTED }}>{kickers[st.screen]}</div>
          <div style={{ font: `400 19px/1.15 ${serif}`, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titles[st.screen]}</div>
        </div>
        <button onClick={() => go("alerts")} aria-label="Changes" title="Changes" className="wg-fade" style={{ position: "relative", border: "1px solid rgba(38,50,58,.14)", background: "#ffffff", width: 34, height: 34, borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: NAVY }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {(open || unreadAlerts.length > 0) && <span style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: 14, background: GOLD, border: `2px solid ${CREAM}` }} />}
        </button>
      </div>
      {/* Offline, and working from the saved copy — say so plainly, so a blank
          messages thread or a slow document reads as "no signal", not "broken".
          The itinerary and wallet are all here; anything that needs the network
          waits for it. */}
      {offline && (
        <div style={{ flexShrink: 0, padding: "7px 18px", background: "#fef6e7", borderBottom: "1px solid rgba(38,50,58,.08)", display: "flex", alignItems: "center", gap: 7, font: "600 11.5px/1.3 Inter,sans-serif", color: "#765321" }}>
          <span aria-hidden="true">✈️</span>
          Offline — showing your saved trip.
        </div>
      )}
      {/* content */}
      <div className="wg-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>{body}</div>
      {/* tabs — an icon over a label per tab, with one gold pill that slides to
          the active one (the messenger/travel-app bottom bar). Hidden while the
          message composer holds the keyboard, so it never rides up wedged
          between the input and the keyboard. */}
      {!(composerUp && st.screen === "messages") && (
      <div style={{ flexShrink: 0, position: "relative", padding: "8px 10px", background: "#ece8df", borderTop: "1px solid rgba(38,50,58,.08)", display: "flex" }}>
        {(() => {
          const idx = tabs.findIndex((t) => t.on);
          if (idx < 0) return null; // a screen with no tab of its own (pay) — no pill
          return (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 8,
                bottom: 8,
                left: `calc(10px + ${idx} * (100% - 20px) / ${tabs.length})`,
                width: `calc((100% - 20px) / ${tabs.length})`,
                background: GOLD,
                borderRadius: 16,
                boxShadow: "0 3px 10px rgba(183,138,74,.34)",
                transition: "left .28s cubic-bezier(.4,0,.2,1)",
              }}
            />
          );
        })()}
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            aria-current={t.on ? "page" : undefined}
            aria-label={t.badge ? `${t.label} (unread messages)` : undefined}
            style={{ position: "relative", zIndex: 1, flex: 1, border: 0, cursor: "pointer", background: "transparent", color: t.on ? ON_GOLD : MUTED, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "9px 3px", transition: "color .2s ease" }}
          >
            {/* THE WORD UNDER THE ICON, WHICH WAS NOT THERE.
                The bar was icon-only, with the label kept as the button's
                accessible name and nothing on the screen — a map pin, a speech
                bubble, a wallet and a person, standing for Trip, Advisor,
                Wallet and You. Two of those four are not guessable: a person
                glyph reads as a profile rather than "You", and a pin reads as
                the map rather than the trip. Every phone puts the word under
                the glyph for that reason.
                It also made the bar invisible to anything reading the screen
                by its text: an outside scan of this page reported that the
                tabs did not switch, having found no control by any of their
                names. They did switch, and do — all four, at 390 and at 1280.
                The name is one element now instead of two facts that could
                disagree, so the label and the accessible name cannot drift. */}
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={t.icon} className="h-5 w-5" strokeWidth={t.on ? 2.1 : 1.7} />
              {t.badge && <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -5, width: 8, height: 8, borderRadius: 14, background: t.on ? CREAM : GOLD, border: `2px solid ${t.on ? GOLD : "#ece8df"}` }} />}
            </span>
            <span style={{ font: `${t.on ? 600 : 500} 10.5px/1 Inter,sans-serif`, letterSpacing: ".01em" }}>{t.label}</span>
          </button>
        ))}
      </div>
      )}
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
          {showcaseSwitches && (
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
  kind?: "text" | "image" | "video" | "audio" | "file" | "location" | "poll";
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
  /** One emoji per side — both people see both. */
  reactions?: Partial<Record<ChatSide, string>>;
  /** kind "poll": the question, its options, and votes keyed by voter id. */
  poll?: { question: string; options: string[]; votes?: Record<string, number> };
};

/** The reactions the chat offers — kept in step with lib/companion-chat-store's
 *  REACTION_EMOJIS, defined here too so this client file pulls no server code. */
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"] as const;

/** A poll asks between this many and this many options — mirrors the server. */
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 5;

/**
 * A stable, anonymous id for THIS device, so several travellers on the one
 * shared trip link can each vote in a poll and be counted once. It says nothing
 * about who they are — it only separates one browser from another — and lives
 * only in this browser. The advisor never uses it (the server votes them as
 * "advisor"); it is the client side's way of not being one lumped-together vote.
 */
function deviceVoterId(): string {
  try {
    const key = "wg-companion-voter";
    let id = localStorage.getItem(key);
    if (!id) {
      id = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

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
    let active = true;
    // The unsupported branch used to run synchronously, before any of the
    // asynchronous work below — which is the setState the rule refuses. It is
    // the same answer either way; it just no longer arrives during the effect.
    if (!publicKey || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      void Promise.resolve().then(() => {
        if (active) setStatus("unsupported");
      });
      return () => {
        active = false;
      };
    }
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
            color: status === "on" ? INK : CREAM,
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

/**
 * The advisor's own control on the Changes screen: send the traveler a line by
 * hand — "your driver is running twenty minutes late" — that lands on their
 * Changes feed and is pushed to their phone. Shown only on the advisor's side,
 * never a client's; the server checks the plan again (see the send route).
 */
function AdvisorAlertComposer({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const serif = "Georgia,'Times New Roman',serif";
  const clean = text.trim();

  async function send() {
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/account/alerts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, text: clean }),
      });
      if (r.ok) {
        setText("");
        setSent(true);
        setTimeout(() => setSent(false), 2500);
        router.refresh();
      } else {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? "Could not send that.");
      }
    } catch {
      setError("Could not send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "16px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>Send the traveler an alert</span>
        <span style={{ fontSize: 12, color: "#57534e" }}>A driver running late, a change of plan — it lands on their Changes and is pushed to their phone.</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 280))}
        placeholder="Your driver is running about 20 minutes late."
        rows={2}
        style={{ resize: "none", border: "1px solid rgba(38,50,58,.16)", borderRadius: 14, padding: "11px 13px", font: `400 14px/1.4 ${serif}`, color: INK, outline: "none" }}
      />
      {error && <span style={{ fontSize: 12, color: "#b42318" }}>{error}</span>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 11.5, color: sent ? "#1f7a4d" : FAINT }}>{sent ? "Sent." : `${text.length}/280`}</span>
        <button
          onClick={() => void send()}
          disabled={busy || !clean}
          className="wg-press"
          style={{ flex: "none", border: 0, background: GOLD, color: ON_GOLD, cursor: clean && !busy ? "pointer" : "default", font: `400 13px/1 ${serif}`, padding: "11px 18px", borderRadius: 14, opacity: busy || !clean ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
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

/** A poll's little bar-chart glyph for the attach menu. */
function PollGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 20V10M12 20V4M17 20v-6" />
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

/**
 * The location picker — a map you move under a fixed pin and send that exact
 * spot, the way a phone messenger does it, in place of typing an address into a
 * box. Opens on the device's own position when it can, and still offers "my
 * current location" and the trip's own stops for the times a pin on a map is
 * not what you want. When Maps can't load (no key, or offline) it falls back to
 * just those two, so Location is never a dead button.
 */
function LocationPicker({
  onPickPin,
  onUseCurrent,
  onPickPlace,
  onClose,
  places,
}: {
  onPickPin: (loc: { lat: number; lng: number }) => void;
  onUseCurrent: () => void;
  onPickPlace: (place: { label: string; address: string }) => void;
  onClose: () => void;
  places: { label: string; address: string }[];
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(googleMapsAvailable() ? "loading" : "unavailable");
  const [locating, setLocating] = useState(false);
  // Address search: the typed query, the dropdown of matches, and the Places
  // services that produce them (created once the map is ready).
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<GPlacePrediction[]>([]);
  // Set once the Places autocomplete service is wired — a ref alone would not
  // re-render the search bar into view when it becomes ready.
  const [searchReady, setSearchReady] = useState(false);
  const autoRef = useRef<InstanceType<GPlacesApi["AutocompleteService"]> | null>(null);
  const placesRef = useRef<InstanceType<GPlacesApi["PlacesService"]> | null>(null);
  const tokenRef = useRef<unknown>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Ask for address matches as you type, lightly debounced, once there is
  // enough to search on. Fails quiet — no suggestions rather than an error — if
  // the Places API isn't enabled on the key.
  useEffect(() => {
    const svc = autoRef.current;
    if (!svc || query.trim().length < 3) { setPredictions([]); return; }
    const t = window.setTimeout(() => {
      try {
        svc.getPlacePredictions({ input: query, sessionToken: tokenRef.current ?? undefined }, (preds) => setPredictions(preds ?? []));
      } catch { setPredictions([]); }
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  function chooseAddress(p: GPlacePrediction) {
    setQuery(p.description);
    setPredictions([]);
    const svc = placesRef.current;
    if (!svc) return;
    svc.getDetails({ placeId: p.place_id, fields: ["geometry"], sessionToken: tokenRef.current ?? undefined }, (place) => {
      const loc = place?.geometry?.location;
      if (loc && mapRef.current) {
        mapRef.current.setCenter({ lat: loc.lat(), lng: loc.lng() });
        mapRef.current.setZoom(17);
      }
      // A details call closes the billing session; start a fresh token.
      const pl = googleMaps()?.places;
      if (pl) tokenRef.current = new pl.AutocompleteSessionToken();
    });
  }

  const centreOnDevice = useCallback((first: boolean) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const map = mapRef.current;
        if (map) { map.setCenter(p); map.setZoom(16); }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: first ? 8000 : 10000 },
    );
  }, []);

  useEffect(() => {
    if (status === "unavailable") return;
    let cancelled = false;
    void (async () => {
      const ok = await loadGoogleMaps();
      if (cancelled) return;
      const maps = googleMaps();
      if (!ok || !maps || !mapDivRef.current) { setStatus("unavailable"); return; }
      mapRef.current = new maps.Map(mapDivRef.current, {
        center: { lat: 40.7128, lng: -74.006 },
        zoom: 15,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      setStatus("ready");
      centreOnDevice(true);
      // Wire address search, if the Places library is there. Best-effort: the
      // map still works if the key has no Places access.
      try {
        if (maps.importLibrary) await maps.importLibrary("places");
        const p = googleMaps()?.places;
        if (p && mapDivRef.current) {
          autoRef.current = new p.AutocompleteService();
          placesRef.current = new p.PlacesService(mapDivRef.current);
          tokenRef.current = new p.AutocompleteSessionToken();
          if (!cancelled) setSearchReady(true);
        }
      } catch {
        /* no autocomplete — the pin and current-location still work */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendPin() {
    const c = mapRef.current?.getCenter?.();
    if (!c) return;
    onPickPin({ lat: c.lat(), lng: c.lng() });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share a location" style={{ position: "absolute", inset: 0, zIndex: 32, background: CREAM, display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid rgba(38,50,58,.08)" }}>
        <button onClick={onClose} aria-label="Close" className="wg-fade" style={{ border: "1px solid rgba(38,50,58,.14)", background: "#fff", width: 34, height: 34, borderRadius: 12, cursor: "pointer", fontSize: 15, color: "#57534e", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>←</button>
        <span style={{ font: "600 16px/1.1 Inter,sans-serif", color: INK }}>Share a location</span>
      </div>

      {status === "unavailable" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 8, padding: 24, textAlign: "center", color: MUTED }}>
          <Icon name="map-pin" className="h-8 w-8" strokeWidth={1.2} />
          <span style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 260 }}>A map isn’t available here right now — you can still send where you are, or a stop from the trip below.</span>
        </div>
      ) : (
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <div ref={mapDivRef} style={{ position: "absolute", inset: 0, background: "#e7edf1" }} />
          {/* The fixed pin — the map moves under it, so its tip always marks the
              point that Send will use. pointer-events off so it never eats a drag. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-100%)", pointerEvents: "none", color: GOLD, filter: "drop-shadow(0 3px 4px rgba(15,20,25,.35))" }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 4.6 6 12 6.4 12.5a.8.8 0 0 0 1.2 0C13 21 19 13.6 19 9a7 7 0 0 0-7-7Z" /><circle cx="12" cy="9" r="2.6" fill="#fff" /></svg>
          </div>
          {status === "loading" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: "500 13px/1 Inter,sans-serif", color: MUTED }}>Loading map…</div>
          )}
          {/* Address search — type a street, pick from the dropdown, the map
              jumps there and drops the pin; then nudge it to the exact door.
              Floats over the map, top; the suggestions hang below it. Only
              shown once the Places service is wired (autoRef set on ready). */}
          {status === "ready" && searchReady && (
            <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 12, boxShadow: "0 4px 14px rgba(15,20,25,.18)", padding: "0 12px", height: 44 }}>
                <Icon name="search" className="h-[18px] w-[18px]" strokeWidth={1.8} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search an address"
                  aria-label="Search an address"
                  autoComplete="off"
                  style={{ flex: 1, border: 0, outline: "none", background: "transparent", font: "500 15px/1 Inter,sans-serif", color: INK, minWidth: 0 }}
                />
                {query && (
                  <button onClick={() => { setQuery(""); setPredictions([]); }} aria-label="Clear" className="wg-fade" style={{ flex: "none", border: 0, background: "none", cursor: "pointer", color: FAINT, display: "flex", padding: 0 }}>
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                )}
              </div>
              {predictions.length > 0 && (
                <div style={{ marginTop: 6, background: "#fff", borderRadius: 12, boxShadow: "0 6px 18px rgba(15,20,25,.2)", overflow: "hidden" }}>
                  {predictions.map((p) => (
                    <button key={p.place_id} onClick={() => chooseAddress(p)} className="wg-warm" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, borderTop: "1px solid rgba(38,50,58,.06)", background: "#fff", cursor: "pointer", padding: "10px 12px" }}>
                      <Icon name="map-pin" className="h-4 w-4" strokeWidth={1.6} />
                      <span style={{ fontSize: 13, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => centreOnDevice(false)}
            title="My location"
            aria-label="Centre on my location"
            className="wg-press"
            style={{ position: "absolute", right: 14, bottom: 16, width: 44, height: 44, borderRadius: "50%", border: 0, background: "#fff", color: ICON_BLUE, cursor: "pointer", boxShadow: "0 4px 14px rgba(15,20,25,.22)", display: "flex", alignItems: "center", justifyContent: "center", opacity: locating ? 0.6 : 1 }}
          >
            <Icon name="map-pin" className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
      )}

      <div style={{ flexShrink: 0, borderTop: "1px solid rgba(38,50,58,.08)", background: CREAM, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, maxHeight: "42%", overflowY: "auto" }}>
        {status === "ready" && (
          <button onClick={sendPin} className="wg-press" style={{ border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, borderRadius: 14, minHeight: 48, fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="map-pin" className="h-[18px] w-[18px]" /> Send this location
          </button>
        )}
        <button onClick={onUseCurrent} className="wg-warm" style={{ border: "1px solid rgba(38,50,58,.14)", cursor: "pointer", background: "#fff", color: INK, borderRadius: 14, minHeight: 46, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="map-pin" className="h-[17px] w-[17px]" /> Send my current location
        </button>
        {places.length > 0 && (
          <>
            <div style={{ padding: "4px 4px 0", font: "600 10px/1 Inter,sans-serif", letterSpacing: ".08em", textTransform: "uppercase", color: FAINT }}>From this trip</div>
            {places.map((p, i) => (
              <button key={i} onClick={() => onPickPlace(p)} className="wg-warm" style={{ display: "flex", flexDirection: "column", width: "100%", textAlign: "left", border: "1px solid rgba(38,50,58,.1)", borderRadius: 12, background: "#fff", cursor: "pointer", padding: "10px 13px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{p.label}</span>
                <span style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.address}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Compose a poll — a question and two to five options — over the thread. A small
 * sheet rather than an inline row, so a half-typed poll never sits in the
 * message box. Nothing is sent until Create; the options grow up to the cap.
 */
function PollComposer({ onSend, onClose }: { onSend: (question: string, options: string[]) => Promise<boolean>; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const filled = options.filter((o) => o.trim()).length;
  const canSend = question.trim().length > 0 && filled >= MIN_POLL_OPTIONS;
  const field: CSSProperties = { width: "100%", border: "1px solid rgba(38,50,58,.16)", borderRadius: 10, padding: "11px 12px", fontFamily: "Inter,sans-serif", fontSize: 16, color: INK, outline: "none", background: "#fff" };

  async function submit() {
    if (!canSend || busy) return;
    setBusy(true);
    const ok = await onSend(question, options);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Create a poll" onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 33, background: "rgba(15,20,25,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CREAM, borderRadius: "20px 20px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12, maxHeight: "88%", overflowY: "auto", animation: "wgIn .2s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ font: "600 16px/1 Inter,sans-serif", color: INK }}>New poll</span>
          <button onClick={onClose} aria-label="Close" className="wg-fade" style={{ border: 0, background: "none", cursor: "pointer", color: FAINT, display: "flex" }}><Icon name="close" className="h-5 w-5" /></button>
        </div>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question…" aria-label="Poll question" maxLength={140} style={field} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input value={opt} onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} maxLength={80} style={field} />
              {options.length > MIN_POLL_OPTIONS && (
                <button onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove option ${i + 1}`} className="wg-fade" style={{ flex: "none", border: 0, background: "none", cursor: "pointer", color: FAINT, display: "flex" }}><Icon name="close" className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </div>
        {options.length < MAX_POLL_OPTIONS && (
          <button onClick={() => setOptions((prev) => [...prev, ""])} className="wg-link" style={{ alignSelf: "flex-start", border: 0, background: "none", cursor: "pointer", color: ICON_BLUE, fontSize: 13.5, fontWeight: 600, padding: "2px 0" }}>+ Add option</button>
        )}
        <button onClick={() => void submit()} disabled={!canSend || busy} className="wg-press" style={{ border: 0, cursor: canSend && !busy ? "pointer" : "default", background: GOLD, color: ON_GOLD, borderRadius: 14, minHeight: 50, fontSize: 15, fontWeight: 700, opacity: canSend && !busy ? 1 : 0.5 }}>Create poll</button>
      </div>
    </div>
  );
}

function LiveChat({
  chat,
  subject,
  onSubjectUsed,
  places = [],
  initialDraft,
  onInitialDraftUsed,
  onComposerFocus,
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
  /** Told when the composer takes or loses the keyboard, so the shell can pull
   *  the bottom tab bar out of the way while typing and bring it back after. */
  onComposerFocus?: (focused: boolean) => void;
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
  // The full-panel map picker — opened from Location, a pin you move over a map
  // (plus "my current location" and the trip's own stops).
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  // The compose-a-poll sheet, opened from the paperclip.
  const [pollComposeOpen, setPollComposeOpen] = useState(false);
  // True while the message composer (or a caption box) holds focus. Drives, with
  // the overlays below, whether the shell hides its bottom tab bar.
  const [composerFocused, setComposerFocused] = useState(false);
  // The `at` of a message being changed — while set, the composer holds that
  // message's words rather than a new message, and Send saves the change
  // instead of posting another one.
  const [editingAt, setEditingAt] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Partial<Record<ChatSide, string>>>({});
  // The `at` of the one message whose "⋯" menu (Report / Edit / Delete) is
  // open. Only ever one at a time, so a single value does the job of a map.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  // Long-press and swipe-to-reply, the two gestures a phone messenger runs on:
  // hold a bubble to open its actions, drag it right to reply to it. Tracked in
  // refs so a drag doesn't re-render the whole thread on every pointer move —
  // the bubble is nudged by writing transform straight onto its element.
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureRef = useRef<{ x: number; y: number; at: string; el: HTMLElement; moved: boolean; swiping: boolean } | null>(null);
  // When a long-press opens the sheet, the finger is still down; lifting it
  // fires a synthesized click on whatever is now under it — the freshly-opened
  // dim overlay — which would slam the sheet shut again. This eats that one tap.
  const swallowNextOverlayTapRef = useRef(false);
  function openMenu(at: string) {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    setMenuOpenAt(at);
  }
  function onMsgPointerDown(e: ReactPointerEvent<HTMLDivElement>, at: string) {
    // The mouse keeps the visible "⋯" button; touch gets hold-and-swipe.
    if (e.pointerType === "mouse") return;
    const el = e.currentTarget;
    gestureRef.current = { x: e.clientX, y: e.clientY, at, el, moved: false, swiping: false };
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const g = gestureRef.current;
      if (g && !g.moved) {
        gestureRef.current = null;
        swallowNextOverlayTapRef.current = true;
        setTimeout(() => { swallowNextOverlayTapRef.current = false; }, 600);
        openMenu(at);
      }
    }, 420);
  }
  function onMsgPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      g.moved = true;
      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    }
    // A mostly-horizontal drag to the right is a reply gesture; follow the
    // finger up to a cap and leave vertical scrolling alone.
    if (g.moved && Math.abs(dx) > Math.abs(dy) && dx > 0) {
      g.swiping = true;
      g.el.style.transition = "none";
      g.el.style.transform = `translateX(${Math.min(dx, 72)}px)`;
    }
  }
  function endMsgGesture(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    if (!g) return;
    gestureRef.current = null;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    g.el.style.transition = "transform .18s ease";
    g.el.style.transform = "";
    if (g.swiping && dx > 52 && Math.abs(dy) < 44) {
      const m = messages.find((x) => x.at === g.at);
      if (m && !m.deletedAt) startReply(m);
    }
  }
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
  // Initialised from `subject` so a chat that MOUNTS with one already set — the
  // advisor opening a client's thread straight from "Ask about this" — pins it
  // from the first paint. The change-watcher below covers the other case, where
  // the chat is already open and the subject arrives after (the client tapping
  // "Ask about this" without leaving the thread).
  const [itineraryRef, setItineraryRef] = useState<string | null>(subject ?? null);
  // A picture or video opened full-size, over the whole chat panel.
  const [viewerMedia, setViewerMedia] = useState<{ kind: "image" | "video"; mediaId: string; text: string } | null>(null);
  // Briefly highlighted after tapping a quote to jump to the message it
  // quotes — long enough to catch the eye, not so long it feels stuck.
  const [jumpFlashAt, setJumpFlashAt] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
    if (!menuOpenAt && !viewerMedia) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuOpenAt(null); setViewerMedia(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpenAt, viewerMedia]);

  useEffect(() => {
    if (!attachOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) setAttachOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAttachOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [attachOpen]);

  // Grows the composer with what is actually typed, up to a cap beyond which
  // it scrolls internally rather than eating the whole screen.
  const MAX_COMPOSER_PX = 120;
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
  }, [draft]);

  /**
   * Picked up once per "Ask about this" tap, then handed back so the parent
   * clears it — otherwise navigating away and back would restage it over
   * whatever the traveler had already set up to send.
   *
   * THE REF IS GONE, AND IT WAS DOING TWO JOBS. It held the newest callback so
   * the effect would not re-run when the parent re-rendered with a fresh
   * function, and it was written during render, which React forbids: a render
   * that gets thrown away would have left the ref pointing at a callback from
   * a tree that never existed. Staging the subject is a value-change reaction,
   * so it happens during render where it belongs — and the field is no longer
   * painted empty for a frame after the tap. Telling the parent is a genuine
   * side effect and stays in an effect, keyed on the subject alone, which is
   * what the ref was really buying.
   */
  useOnValueChange(subject, () => {
    if (subject) setItineraryRef(subject);
  });
  useEffect(() => {
    if (subject) onSubjectUsed?.();
    // The callback is deliberately not a dependency: this fires once per
    // subject, not again because the parent re-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  // A place shared in from outside, put straight into the composer — picked up
  // once, then handed back so the parent clears it, the same way "Ask about
  // this" is, and split for the same reason.
  useOnValueChange(initialDraft, () => {
    if (initialDraft) setDraft(initialDraft);
  });
  useEffect(() => {
    if (initialDraft) onInitialDraftUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/companion/chat?share=${encodeURIComponent(shareId)}`, { cache: "no-store" });
      if (!r.ok) {
        // Say why, and stop rendering a blank panel. A non-2xx here used to
        // leave `loaded` false with no note, so the whole thread showed as an
        // empty screen — which reads as broken and hides the real reason (a 404
        // is the plan gate: the trip's owner is not on a plan that carries
        // client messaging, or the link is stale). Surface it instead.
        const d = await r.json().catch(() => null);
        setNote((d && typeof d.error === "string" && d.error) || "Messages aren’t available on this trip right now.");
        setLoaded(true);
        return;
      }
      const d = await r.json();
      const msgs: LiveMsg[] = Array.isArray(d.messages) ? d.messages : [];
      setMessages(msgs);
      setAvailable(d.available !== false);
      setReadAt(d.readMarkers && typeof d.readMarkers === "object" ? d.readMarkers : {});
      setOtherTyping(Boolean(d.typing));
      if (typeof d.imageLimit === "number" && d.imageLimit > 0) setImageLimit(d.imageLimit);
      if (typeof d.docLimit === "number" && d.docLimit > 0) setDocLimit(d.docLimit);
      setNote("");
      setLoaded(true);
      // Keep the thread on the device so it still READS with no signal.
      void saveMessagesOffline(shareId, msgs);
    } catch {
      // No signal: messaging needs the network to SEND, but the conversation
      // itself was saved on the last online open — show it (read-only) rather
      // than a blank panel, and say sending waits for the network.
      const cached = await readMessagesOffline<LiveMsg>(shareId).catch(() => null);
      if (cached && cached.length) setMessages(cached);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setNote(cached && cached.length
          ? "You’re offline — showing saved messages. New messages send when you’re back online."
          : "You’re offline — your messages will load when you’re back online.");
      }
      setLoaded(true);
    }
  }, [shareId]);

  // Async wrapper rather than a bare call from the effect body: a bare call
  // enters it synchronously, which the rule counts as a setState during the
  // effect.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    const t = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
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
  // Also called when a chat image/video finishes loading and grows — a thread
  // ending in media used to open scrolled ABOVE the newest item because this
  // ran on message change, before the media had its real height. Only re-pins
  // when the reader was already near the bottom.
  function pinToBottomIfNear() {
    const el = scrollerRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, otherTyping]);

  // The keyboard opening shrinks the visual viewport, which shrinks the whole
  // phone (height:100dvh) and with it the message list — the newest message
  // would otherwise end up hidden under the composer. Re-pin to the bottom
  // whenever the viewport resizes, so the last message stays in view above the
  // keyboard the way it does in a real messaging app.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => pinToBottomIfNear();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Hide the shell's bottom tab bar whenever the keyboard is up OR a full-screen
  // overlay is open — otherwise the tabs sit wedged over the keyboard, or poke
  // out from under the map picker / poll sheet, and a stray tap on one would
  // navigate away mid-task.
  const chromeHidden = composerFocused || menuOpenAt !== null || locationPickerOpen || pollComposeOpen || viewerMedia !== null || staged !== null;
  useEffect(() => {
    onComposerFocus?.(chromeHidden);
  }, [chromeHidden, onComposerFocus]);
  // Leaving the thread must always hand the tab bar back.
  useEffect(() => () => onComposerFocus?.(false), [onComposerFocus]);

  // One place to POST from — text, a picture, a place, or a voice note all
  // land here; the reply carries the whole thread back, so the send is also
  // the refresh. Whatever is staged in `replyingTo` rides along automatically
  // — a caller sends its own payload without having to remember the quote.
  // Resolves true only when the send was confirmed OK, so callers can hold on
  // to what they typed or staged and restore it when it did not go through.
  async function post(payload: Record<string, unknown>): Promise<boolean> {
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
        return true;
      } else {
        setNote((d && d.error) || "That didn't send. Try again.");
        void load();
        return false;
      }
    } catch {
      setNote("That didn't send. Try again.");
      return false;
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
    // Clear optimistically, but put the text back if the send failed — a failed
    // send used to wipe the message with nothing left to resend.
    setDraft("");
    void post({ text: t }).then((ok) => { if (!ok) setDraft(t); });
  }

  /** A message either side can reply to — anything still standing. Staged
   *  the same way an edit is: one bar above the composer, cleared on send
   *  or Cancel. */
  function startReply(m: LiveMsg) {
    if (sending) return;
    // Dropping out of an edit to reply must not leave the half-edited words in
    // the box, where they would post as a brand-new message.
    if (editingAt) setDraft("");
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
      if (r.ok && d) {
        setMessages(Array.isArray(d.messages) ? d.messages : []);
        // Leave edit mode only when the change actually saved. It used to run
        // in `finally`, so a failed edit was discarded and dropped out of
        // editing — the change is now kept staged for a retry on failure.
        setEditingAt(null);
        setDraft("");
      } else {
        setNote((d && d.error) || "That couldn't be changed.");
      }
    } catch {
      setNote("That couldn't be changed.");
    } finally {
      setSending(false);
    }
  }

  // Toggle my reaction on a message. Post and take the fresh thread back, like
  // every other write here; the 15s poll reconciles the other side's.
  async function react(at: string, emoji: string) {
    setMenuOpenAt(null);
    try {
      const r = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: shareId, reactAt: at, reaction: emoji }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d && Array.isArray(d.messages)) setMessages(d.messages);
    } catch {
      /* leave the thread as it was; the next poll will reconcile */
    }
  }

  // Cast (or clear) this device's vote on a poll. Optimistic like a reaction —
  // post and take the fresh tally back; the poll reconciles others' votes.
  async function castVote(at: string, option: number) {
    try {
      const r = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share: shareId, pollVoteAt: at, pollOption: option, voterId: deviceVoterId() }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d && Array.isArray(d.messages)) setMessages(d.messages);
      else if (d?.error) setNote(d.error);
    } catch {
      /* the next poll reconciles */
    }
  }

  // Send a new poll. Clears and closes the composer only once it lands.
  async function sendPoll(question: string, options: string[]): Promise<boolean> {
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean).slice(0, MAX_POLL_OPTIONS);
    if (!q || opts.length < MIN_POLL_OPTIONS) return false;
    return post({ poll: { question: q, options: opts } });
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
      if (!dataUrl) { setNote(`Could not read that ${noun}.`); return; }
      // Clear the staged pick only once the send is confirmed. clearStaged()
      // used to run synchronously while post was still in flight, so a failed
      // media/voice-note send lost the file and caption with nothing to retry.
      void post({ dataUrl, text }).then((ok) => { if (ok) clearStaged(); });
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
    } catch (err) {
      // Say which wall we hit, so "the mic doesn't work" becomes something a
      // person can act on. A denied permission, a mic another app is holding,
      // and a device with no mic each need a different move.
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setNote("Microphone access is off. Open Settings → Apps → this app → Permissions and allow the microphone, then try again.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setNote("The microphone is busy in another app. Close anything using it (a call, a recorder) and try again.");
      } else if (name === "NotFoundError") {
        setNote("No microphone was found on this device.");
      } else {
        setNote("Couldn't reach the microphone. Check the app's microphone permission.");
      }
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
    // Cleared only once the send lands, like every other send path here — a
    // failed post keeps the staged place so "try again" has something to send.
    void post(
      "address" in stagedLocation
        ? { address: stagedLocation.address, label: stagedLocation.label }
        : { lat: stagedLocation.lat, lng: stagedLocation.lng, label: stagedLocation.label },
    ).then((ok) => {
      if (ok) setStagedLocation(null);
    });
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

  // No mutable accumulator for the date dividers: whether one belongs above a
  // message is a fact about that message and the one before it, so it is
  // derived per row below. The variable this replaced was declared here and
  // reassigned inside the map during render, which React forbids — a render
  // that gets discarded would have left it holding a day from a tree that
  // never reached the screen.

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
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", position: "relative", animation: "wgIn .28s ease both" }}>
      <div ref={scrollerRef} onScroll={noteScrollPosition} className="wg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
        {!available && (
          <div style={{ alignSelf: "center", textAlign: "center", font: "400 12px/1.5 Inter,sans-serif", color: "#765321", background: "#f7eee0", padding: "10px 14px", borderRadius: 14 }}>
            Messaging isn&apos;t connected yet.
          </div>
        )}
        {available && loaded && messages.length === 0 && !note && (
          <div style={{ alignSelf: "center", maxWidth: "80%", textAlign: "center", font: "400 13px/1.6 Inter,sans-serif", color: MUTED }}>
            {side === "advisor" ? "No messages yet. Anything you send reaches your client on their app." : `No messages yet. Send a message, a photo, a video, a voice note or your location to ${advisorName}.`}
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.from === side;
          const day = new Date(m.at).toDateString();
          const showDivider = i === 0 || new Date(messages[i - 1].at).toDateString() !== day;
          const seenRead = Boolean(readAt[otherSide] && readAt[otherSide]! >= m.at);
          const bubble: CSSProperties = {
            // Width comes from the message row's own cap (below), not a percentage
            // of this shrink-to-fit column — a percentage here collapsed a short
            // message like "hi" to one letter per line.
            maxWidth: "100%",
            width: "fit-content",
            alignSelf: mine ? "flex-end" : "flex-start",
            background: mine ? NAVY : "#ffffff",
            color: mine ? CREAM : INK,
            borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            boxShadow: "0 1px 2px rgba(23,45,82,.08)",
            overflow: "hidden",
          };
          let content: ReactNode;
          if (m.deletedAt) {
            content = (
              <div style={{ maxWidth: "100%", width: "fit-content", alignSelf: mine ? "flex-end" : "flex-start", padding: "10px 15px", borderRadius: 14, background: "rgba(38,50,58,.06)", fontSize: 13, fontStyle: "italic", color: MUTED }}>
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
                  // Keyboard-operable, not mouse-only: opens the viewer on
                  // Enter/Space as well as click.
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewerMedia({ kind: "image", mediaId: m.mediaId!, text: m.text })}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewerMedia({ kind: "image", mediaId: m.mediaId!, text: m.text }); } }}
                  // Once the photo has its real height, re-pin to the bottom if
                  // the reader was already there — the thread opened above it.
                  onLoad={pinToBottomIfNear}
                  style={{ display: "block", width: "100%", maxWidth: 240, maxHeight: 280, objectFit: "cover", cursor: "pointer" }}
                />
                {m.text && <div style={{ padding: "9px 13px", fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</div>}
              </div>
            );
          } else if (m.kind === "video" && m.mediaId) {
            content = (
              <div style={bubble}>
                <video controls preload="metadata" onLoadedMetadata={pinToBottomIfNear} style={{ display: "block", width: "100%", maxWidth: 240, maxHeight: 280 }}>
                  <source src={`/api/media?id=${encodeURIComponent(m.mediaId)}`} />
                </video>
                {m.text && <div style={{ padding: "9px 13px", fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</div>}
              </div>
            );
          } else if (m.kind === "audio" && m.mediaId) {
            content = (
              <div style={{ ...bubble, padding: "8px 12px" }}>
                <ChatVoiceNote mediaId={m.mediaId} mine={mine} />
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
          } else if (m.kind === "poll" && m.poll) {
            const poll = m.poll;
            const votes = poll.votes ?? {};
            const total = Object.keys(votes).length;
            const myKey = side === "advisor" ? "advisor" : `c:${deviceVoterId()}`;
            const myVote = votes[myKey];
            content = (
              <div style={{ maxWidth: "100%", width: 268, alignSelf: mine ? "flex-end" : "flex-start", background: "#ffffff", color: INK, border: "1px solid rgba(38,50,58,.1)", borderRadius: 16, boxShadow: "0 1px 2px rgba(23,45,82,.08)", overflow: "hidden", padding: "13px 14px 11px", display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: GOLD, display: "flex" }}><PollGlyph size={15} /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{poll.question}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {poll.options.map((opt, oi) => {
                    const count = Object.values(votes).filter((v) => v === oi).length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const chosen = myVote === oi;
                    return (
                      <button
                        key={oi}
                        onClick={() => void castVote(m.at, oi)}
                        aria-label={chosen ? `Remove your vote for ${opt}` : `Vote for ${opt}`}
                        style={{ position: "relative", border: `1px solid ${chosen ? GOLD : "rgba(38,50,58,.14)"}`, background: "#fff", borderRadius: 10, cursor: "pointer", padding: "9px 11px", textAlign: "left", overflow: "hidden", display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: chosen ? "rgba(183,138,74,.20)" : "rgba(38,50,58,.06)", transition: "width .3s ease" }} />
                        <span style={{ position: "relative", flex: 1, minWidth: 0, fontSize: 13, fontWeight: chosen ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
                        {chosen && <span style={{ position: "relative", color: GOLD, display: "flex" }}><Icon name="check" className="h-4 w-4" strokeWidth={2.4} /></span>}
                        <span style={{ position: "relative", fontSize: 12, fontWeight: 600, color: MUTED, minWidth: 16, textAlign: "right" }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: 11, color: FAINT }}>{total === 0 ? "No votes yet — tap to vote" : `${total} vote${total === 1 ? "" : "s"} · tap to change`}</span>
              </div>
            );
          } else {
            content = (
              <div style={{ ...bubble, padding: "13px 15px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {m.text}
                {m.editedAt && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7, fontStyle: "italic" }}>(edited)</span>}
              </div>
            );
          }
          // A live message always has at least one action — Reply on any
          // live one, Report on theirs, Delete (and often Edit) on your own.
          // A deleted one has none, so its "⋯" is dropped rather than
          // opening onto nothing.
          const hasMenu = !m.deletedAt;
          // Its own menu, not any menu: the dot beside every other message
          // stays receded while this one is open.
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
              <span style={{ display: "block", fontSize: 12, lineHeight: 1.35, color: mine ? "rgba(255,255,255,.85)" : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <div style={{ alignSelf: "center", margin: "6px 0 2px", font: "600 11px/1 Inter,sans-serif", color: FAINT, background: "rgba(38,50,58,.05)", padding: "5px 13px", borderRadius: 999 }}>
                  {dayLabel(m.at)}
                </div>
              )}
              <div
                data-msg-at={m.at}
                onPointerDown={hasMenu ? (e) => onMsgPointerDown(e, m.at) : undefined}
                onPointerMove={hasMenu ? onMsgPointerMove : undefined}
                onPointerUp={hasMenu ? endMsgGesture : undefined}
                onPointerCancel={hasMenu ? endMsgGesture : undefined}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  // The message block caps at ~82% of the thread width and sits on
                  // its own side; the bubble inside sizes to its text against this
                  // definite width, so short and long messages both look right.
                  maxWidth: "82%",
                  alignSelf: mine ? "flex-end" : "flex-start",
                  alignItems: mine ? "flex-end" : "flex-start",
                  gap: 2,
                  background: jumpFlashAt === m.at ? "rgba(183,138,74,.18)" : "transparent",
                  borderRadius: 10,
                  transition: "background .5s ease",
                  // Hold to open actions, drag right to reply — let the browser
                  // keep vertical scrolling, we handle the horizontal drag.
                  touchAction: "pan-y",
                }}
              >
              {itineraryTag}
              <div className="wg-msgrow" style={{ display: "flex", alignItems: "center", gap: 1, flexDirection: mine ? "row-reverse" : "row", maxWidth: "100%" }}>
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
                  <button
                    onClick={() => openMenu(m.at)}
                    title="Message options"
                    aria-label="Message options"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    /* GONE ON A PHONE, where holding the bubble opens the same
                       actions — WhatsApp and Signal show no per-message button
                       and neither do we there. Kept only on a hover device (a
                       desktop mouse), where it fades in on hover of its own row,
                       since there is no press-and-hold with a mouse. The CSS for
                       both is wg-msgdots / wg-msgrow in the style block below. */
                    className="wg-msgdots"
                    style={{ flex: "none", border: 0, background: "none", cursor: "pointer", padding: 8, margin: -6, color: FAINT, display: "flex", alignItems: "center" }}
                  >
                    <Icon name="more" className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* Reactions hang under the bubble, on the message's own side,
                  both people's showing. Tapping mine again removes it. */}
              {(m.reactions?.advisor || m.reactions?.client) && (
                <div style={{ display: "flex", gap: 4, marginTop: 1, flexDirection: mine ? "row-reverse" : "row" }}>
                  {(() => {
                    const counts = new Map<string, number>();
                    for (const e of [m.reactions?.advisor, m.reactions?.client]) if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
                    return [...counts.entries()].map(([e, c]) => {
                      const isMine = m.reactions?.[side] === e;
                      return (
                        <button
                          key={e}
                          onClick={() => void react(m.at, e)}
                          aria-label={`${e} reaction${c > 1 ? `, ${c}` : ""}${isMine ? " — yours, tap to remove" : ""}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", border: `1px solid ${isMine ? GOLD : "rgba(38,50,58,.12)"}`, background: isMine ? "rgba(183,138,74,.14)" : "#ffffff", borderRadius: 999, padding: "1px 6px 1px 5px", boxShadow: "0 1px 2px rgba(23,45,82,.08)" }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1.4 }}>{e}</span>
                          {c > 1 && <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>{c}</span>}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
              {/* Time under every message, the way a messenger shows it — with
                  the sent/read tick on the last one I sent (gold once it's been
                  read), not repeated down the thread. */}
              {!m.deletedAt && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 5px 0", fontSize: 10.5, color: FAINT }}>
                  {msgTime(m.at)}
                  {mine && m.at === lastMineAt && (
                    <span style={{ display: "inline-flex", color: seenRead ? GOLD : FAINT }}>
                      <Icon name={seenRead ? "check-check" : "check"} className="h-3 w-3" />
                    </span>
                  )}
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
              <span style={{ fontSize: 13, fontWeight: 600, color: INK, textTransform: "capitalize" }}>{staged.noun} ready to send</span>
              {staged.kind === "audio" && <audio src={staged.previewUrl} controls style={{ height: 30, width: 200, maxWidth: "100%" }} />}
              {staged.kind === "file" && staged.fileName && (
                <span style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staged.fileName}</span>
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
                style={{ flex: 1, minWidth: 0, border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", borderRadius: 14, padding: "14px 17px", fontFamily: "Inter,sans-serif", fontSize: 16, color: INK, outline: "none" }}
              />
            )}
            <button onClick={() => sendStaged()} disabled={sending} aria-label="Send" className="wg-press" style={{ flex: staged.kind === "audio" ? 1 : "none", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, height: 46, minWidth: 46, borderRadius: staged.kind === "audio" ? 14 : "50%", fontSize: 14, fontWeight: 700, padding: staged.kind === "audio" ? "0 20px" : 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: sending ? 0.6 : 1 }}>
              {staged.kind === "audio" ? "Send voice note" : <Icon name="send" className="h-[20px] w-[20px]" strokeWidth={1.9} />}
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
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                {"address" in stagedLocation ? stagedLocation.label : "Your location"}, ready to send
              </span>
              <span style={{ fontSize: 11.5, color: MUTED }}>
                {"address" in stagedLocation ? stagedLocation.address : `${stagedLocation.lat.toFixed(4)}, ${stagedLocation.lng.toFixed(4)}`}
              </span>
            </div>
            <button onClick={() => setStagedLocation(null)} disabled={sending} title="Discard" aria-label="Discard" className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#ffffff", color: ICON_BLUE, cursor: "pointer", width: 36, height: 36, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => sendStagedLocation()} disabled={sending} className="wg-press" style={{ border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, height: 46, borderRadius: 14, fontSize: 14, fontWeight: 700, opacity: sending ? 0.6 : 1 }}>
            Send location
          </button>
        </div>
      ) : (
        <div style={{ flexShrink: 0, background: "rgba(247,245,240,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderTop: "1px solid rgba(38,50,58,.06)", padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {editingAt && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: MUTED, padding: "0 2px" }}>
              <span>Editing your message</span>
              <button onClick={cancelEdit} className="wg-link" style={{ border: 0, background: "none", cursor: "pointer", ...TAP_INLINE, fontSize: 11.5, color: FAINT }}>Cancel</button>
            </div>
          )}
          {replyingTo && !editingAt && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "rgba(38,50,58,.05)", borderLeft: `3px solid ${GOLD}`, borderRadius: 8, padding: "6px 9px" }}>
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#57534e" }}>
                  Replying to {replyingTo.from === side ? "yourself" : otherName}
                </span>
                <span style={{ display: "block", fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {replyingTo.text || (replyingTo.kind && replyingTo.kind !== "text" ? replyingTo.kind : "")}
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} title="Cancel reply" aria-label="Cancel reply" className="wg-link" style={{ flex: "none", border: 0, background: "none", cursor: "pointer", color: FAINT, display: "flex" }}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            {/* The one input that asks for the camera itself (capture), so the
                menu's "Camera" takes a fresh photo while the bar's Photos button
                and the menu's "Photo" open the gallery. */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: "none" }} onChange={(e) => { pickVideo(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={docRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => { pickDocument(e.target.files?.[0]); e.target.value = ""; }} />
            {/* One rounded input bar — attach on the left, the growing field, a
                camera on the right — with the round voice/send button beside it,
                the WhatsApp / Signal shape. */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", gap: 1, background: "#ffffff", border: "1px solid rgba(38,50,58,.08)", borderRadius: 24, boxShadow: "0 1px 3px rgba(23,45,82,.05)", padding: "2px 4px 2px 3px" }}>
              {!editingAt && (
                <div ref={attachMenuRef} style={{ position: "relative", flex: "none" }}>
                  <button
                    onClick={() => setAttachOpen((o) => !o)}
                    disabled={sending || recording}
                    title="Attach"
                    aria-label="Attach a photo, video, document or location"
                    aria-expanded={attachOpen}
                    style={{ border: 0, background: "none", color: ICON_BLUE, cursor: "pointer", width: 38, height: 42, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: sending || recording ? 0.6 : 1 }}
                  >
                    <Icon name="paperclip" className="h-[21px] w-[21px]" />
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
                      <button role="menuitem" onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: INK }}>
                        <Icon name="image" className="h-4 w-4" /> Photo library
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); videoRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: INK }}>
                        <Icon name="video" className="h-4 w-4" /> Video
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); docRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: INK }}>
                        <DocGlyph /> Document
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); setLocationPickerOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: INK }}>
                        <Icon name="map-pin" className="h-4 w-4" /> Location
                      </button>
                      <button role="menuitem" onClick={() => { setAttachOpen(false); setPollComposeOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, color: INK }}>
                        <PollGlyph /> Poll
                      </button>
                    </div>
                  )}
                </div>
              )}
              <textarea
                ref={draftRef}
                rows={1}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); noteTyping(); }}
                onFocus={() => { setComposerFocused(true); requestAnimationFrame(() => pinToBottomIfNear()); }}
                onBlur={() => setComposerFocused(false)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={editingAt ? "Edit your message…" : side === "advisor" ? "Reply to your client…" : `Message ${otherName}…`}
                // 16px, not 14: iOS Safari auto-zooms the whole page into any
                // text input under 16px the moment it is focused, which is
                // exactly what reads as the screen "jumping" when the keyboard
                // opens. Grows with what is typed (see the effect above),
                // rather than staying squashed to one line.
                style={{ flex: 1, minWidth: 0, resize: "none", overflow: "auto", border: 0, background: "none", borderRadius: 0, padding: "11px 6px 11px 8px", fontFamily: "Inter,sans-serif", fontSize: 16, lineHeight: 1.4, color: INK, outline: "none", boxShadow: "none", WebkitAppearance: "none", WebkitTapHighlightColor: "transparent" }}
              />
              {!editingAt && (
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={sending || recording}
                  title="Camera"
                  aria-label="Take a photo with the camera"
                  style={{ flex: "none", border: 0, background: "none", color: ICON_BLUE, cursor: "pointer", width: 38, height: 42, borderRadius: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: sending || recording ? 0.6 : 1 }}
                >
                  <Icon name="camera" className="h-[20px] w-[20px]" />
                </button>
              )}
            </div>
            {/* One round button that morphs — the voice-note mic while the field
                is empty, a red stop while recording, the send arrow the moment
                there is something to send (or an edit to save). */}
            {recording ? (
              <button onClick={() => stopRecording()} title="Stop recording" aria-label="Stop recording" style={{ flex: "none", border: 0, cursor: "pointer", background: "#b5442e", color: "#fff", width: 46, height: 46, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", animation: "wgPulse 1.1s ease-in-out infinite" }}>
                <Icon name="stop" className="h-[19px] w-[19px]" />
              </button>
            ) : draft.trim() || editingAt ? (
              <button onClick={() => send()} disabled={sending} title="Send" aria-label="Send" className="wg-press" style={{ flex: "none", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, width: 46, height: 46, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: sending ? 0.6 : 1 }}>
                {editingAt ? <Icon name="check" className="h-[21px] w-[21px]" strokeWidth={2.4} /> : <Icon name="send" className="h-[20px] w-[20px]" strokeWidth={1.9} />}
              </button>
            ) : (
              <button onClick={() => void startRecording()} disabled={sending} title="Record a voice note" aria-label="Record a voice note" className="wg-press" style={{ flex: "none", border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, width: 46, height: 46, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: sending ? 0.6 : 1 }}>
                <Icon name="microphone" className="h-[20px] w-[20px]" />
              </button>
            )}
          </div>
        </div>
      )}
      {/* Message actions — the WhatsApp long-press sheet: a full-width dim over
          the thread, the reaction row floating as its own pill (so the six
          emoji can never be clipped by a bubble's edge the way an anchored
          dropdown was), and the actions listed below it. Opened by holding a
          bubble or tapping its "⋯". Scoped to the phone frame, like the photo
          viewer. */}
      {menuOpenAt && (() => {
        const m = messages.find((x) => x.at === menuOpenAt);
        if (!m || m.deletedAt) return null;
        const mine = m.from === side;
        const canEdit = mine && (m.kind ?? "text") === "text";
        const item: CSSProperties = { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "13px 18px", fontSize: 14.5, color: INK };
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Message options"
            onClick={() => { if (swallowNextOverlayTapRef.current) { swallowNextOverlayTapRef.current = false; return; } setMenuOpenAt(null); }}
            style={{ position: "absolute", inset: 0, zIndex: 28, background: "rgba(15,20,25,.34)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: mine ? "flex-end" : "flex-start", gap: 12, padding: "0 16px" }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 2, background: "#ffffff", borderRadius: 999, padding: "7px 9px", boxShadow: "0 14px 38px rgba(15,20,25,.3)", animation: "wgIn .16s ease both" }}>
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { void react(m.at, e); setMenuOpenAt(null); }}
                  aria-label={m.reactions?.[side] === e ? `Remove ${e} reaction` : `React ${e}`}
                  className="wg-fade"
                  style={{ border: 0, cursor: "pointer", background: m.reactions?.[side] === e ? "rgba(183,138,74,.18)" : "none", borderRadius: 999, fontSize: 25, lineHeight: 1, padding: "6px 7px" }}
                >
                  {e}
                </button>
              ))}
            </div>
            <div onClick={(e) => e.stopPropagation()} role="menu" style={{ minWidth: 210, maxWidth: "86%", borderRadius: 16, background: "#ffffff", boxShadow: "0 14px 38px rgba(15,20,25,.3)", overflow: "hidden", animation: "wgIn .18s ease both" }}>
              <button role="menuitem" className="wg-warm" onClick={() => { startReply(m); setMenuOpenAt(null); }} style={item}>
                <Icon name="reply" className="h-[18px] w-[18px]" /> Reply
              </button>
              {canEdit && (
                <button role="menuitem" className="wg-warm" onClick={() => { startEdit(m); setMenuOpenAt(null); }} style={item}>
                  <Icon name="pencil" className="h-[18px] w-[18px]" /> Edit
                </button>
              )}
              {!mine && (
                reported[m.at] ? (
                  <span style={{ ...item, color: FAINT, cursor: "default" }}><Icon name="flag" className="h-[18px] w-[18px]" /> Reported</span>
                ) : (
                  <button role="menuitem" className="wg-warm" onClick={() => { void report(m.at); setMenuOpenAt(null); }} style={item}>
                    <Icon name="flag" className="h-[18px] w-[18px]" /> Report
                  </button>
                )
              )}
              {mine && (
                <button role="menuitem" className="wg-warm" onClick={() => { setMenuOpenAt(null); void deleteMine(m.at); }} style={{ ...item, color: "#b5442e" }}>
                  <Icon name="trash" className="h-[18px] w-[18px]" /> Delete
                </button>
              )}
            </div>
          </div>
        );
      })()}
      {/* The map location picker — a full-panel overlay over the thread, like
          WhatsApp's own location screen. Staging (not sending) on pick, so the
          same confirm-before-send bar every attachment gets still applies. */}
      {locationPickerOpen && (
        <LocationPicker
          places={places}
          onClose={() => setLocationPickerOpen(false)}
          onPickPin={(loc) => { setLocationPickerOpen(false); setStagedLocation({ lat: loc.lat, lng: loc.lng, label: "Pinned location" }); }}
          onUseCurrent={() => { setLocationPickerOpen(false); pickLocation(); }}
          onPickPlace={(p) => { setLocationPickerOpen(false); pickPlaceLocation(p); }}
        />
      )}
      {pollComposeOpen && <PollComposer onSend={sendPoll} onClose={() => setPollComposeOpen(false)} />}
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
  lastKind: "text" | "image" | "video" | "audio" | "file" | "location" | "poll" | null;
  lastFrom: ChatSide | null;
  lastAt: string;
};

// What the list shows when the last message carries no text of its own — a
// photo, a voice note, a location. The glyph is the SAME one the paperclip
// menu uses for that kind (Icon / DocGlyph / PollGlyph), never a coloured
// emoji, so the two read as one app.
const INBOX_KIND_META: Record<string, { glyph: ReactNode; label: string }> = {
  image: { glyph: <Icon name="image" className="h-3.5 w-3.5" />, label: "Photo" },
  video: { glyph: <Icon name="video" className="h-3.5 w-3.5" />, label: "Video" },
  audio: { glyph: <Icon name="microphone" className="h-3.5 w-3.5" />, label: "Voice message" },
  file: { glyph: <DocGlyph size={13} />, label: "Document" },
  location: { glyph: <Icon name="map-pin" className="h-3.5 w-3.5" />, label: "Location" },
  poll: { glyph: <PollGlyph size={13} />, label: "Poll" },
};

/**
 * The advisor's inbox — one conversation per client they have shared a trip
 * with. Tap one to open that thread; every client is its own chat, and this is
 * the one place they all live.
 */
function AdvisorInbox({
  pendingShare,
  onPendingShareUsed,
  onComposerFocus,
  openShareId,
  subject,
  onSubjectUsed,
  places = [],
}: {
  /** A place shared in from outside, waiting for the advisor to pick which
   *  client's thread it belongs in. */
  pendingShare?: string | null;
  onPendingShareUsed?: () => void;
  /** Bubbled up from the open thread's composer so the shell can pull the
   *  bottom tab bar out of the way while the advisor is typing. */
  onComposerFocus?: (focused: boolean) => void;
  /** The share token of the trip the advisor is viewing. When the advisor taps
   *  "Ask about this" on that trip, we open THIS conversation straight away
   *  rather than making them find it in the list. */
  openShareId?: string;
  /** The attraction tapped through "Ask about this", to pin to the message and
   *  hand to the opened thread. */
  subject?: string | null;
  onSubjectUsed?: () => void;
  /** Stops from the viewed trip that can be shared by address, for the open
   *  thread's Location button. */
  places?: { label: string; address: string }[];
}) {
  const serif = "Georgia,'Times New Roman',serif";
  const [convos, setConvos] = useState<InboxConvo[] | null>(null);
  const [open, setOpen] = useState<InboxConvo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Which conversation's "⋯" menu is open, and which are pinned to the top —
  // pinning is a per-device convenience, kept in the browser like a read
  // marker, not a shared setting.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("wg-inbox-pinned") || "[]") as string[]); } catch { return new Set(); }
  });
  function togglePin(shareId: string) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(shareId)) next.delete(shareId); else next.add(shareId);
      try { localStorage.setItem("wg-inbox-pinned", JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
    setMenuFor(null);
  }

  // The advisor's OWN name for a conversation. Kept on the device, like the pin
  // — it is the advisor's private label ("The Cohens — honeymoon"), never sent
  // anywhere, so the client always sees the advisor's own name on their side,
  // never whatever the advisor filed them under. Empty falls back to the
  // client's name, then the trip name.
  const [names, setNames] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("wg-inbox-names") || "{}") as Record<string, string>; } catch { return {}; }
  });
  const nameOf = (c: InboxConvo) => names[c.shareId] || c.client || c.name;
  // The conversation whose rename box is open.
  const [renaming, setRenaming] = useState<InboxConvo | null>(null);
  function saveName(shareId: string, raw: string) {
    setNames((prev) => {
      const next = { ...prev };
      const t = raw.trim();
      if (t) next[shareId] = t; else delete next[shareId];
      try { localStorage.setItem("wg-inbox-names", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }

  // Long-press a conversation to open its actions — no per-row button, the way
  // WhatsApp's list reads. A press that turns into the menu swallows the tap
  // that would otherwise open the thread on finger-up.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  // Lifting the finger after a long-press fires a click on whatever is now
  // under it — the sheet's own dim backdrop — which would slam it shut again.
  // This eats that one tap.
  const swallowTap = useRef(false);
  function onRowDown(c: InboxConvo) {
    pressFired.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      pressFired.current = true;
      swallowTap.current = true;
      setTimeout(() => { swallowTap.current = false; }, 600);
      setMenuFor(c.shareId);
    }, 450);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }
  function onRowClick(c: InboxConvo) {
    if (pressFired.current) { pressFired.current = false; return; }
    setOpen(c);
  }

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

  // Async wrapper rather than a bare call from the effect body: a bare call
  // enters it synchronously, which the rule counts as a setState during the
  // effect.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    const t = setInterval(() => void load(), 8000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [load]);

  // "Ask about this" on the viewed trip: jump straight into that client's
  // thread rather than dropping the advisor on the list to hunt for it. Only
  // when a subject is actually pending (the advisor tapped it) and a matching
  // conversation exists — otherwise the inbox shows as normal. Once opened, the
  // thread's own subject wiring pins the attraction and clears it.
  //
  // Done as a render-phase value-change (not an effect) so it lands in the same
  // paint the list arrives in — the advisor never sees the inbox flash before
  // the thread opens. The key is null until the list is here with a pending
  // subject, so it fires the once, when the list loads.
  const autoOpenKey = !open && subject && openShareId && convos ? openShareId : null;
  useOnValueChange(autoOpenKey, () => {
    if (!autoOpenKey || !convos) return;
    const match = convos.find((c) => c.shareId === autoOpenKey);
    if (match) setOpen(match);
  });

  if (open) {
    return (
      <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", animation: "wgIn .28s ease both" }}>
        <button onClick={() => setOpen(null)} className="wg-warm" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, border: 0, borderBottom: "1px solid rgba(38,50,58,.08)", background: "#ece8df", cursor: "pointer", padding: "12px 16px", textAlign: "left" }}>
          <span style={{ fontSize: 15, color: "#57534e" }}>←</span>
          <span style={{ font: `400 17px/1.1 ${serif}` }}>{nameOf(open)}</span>
        </button>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <LiveChat
            chat={{ shareId: open.shareId, side: "advisor", advisorName: nameOf(open) }}
            initialDraft={pendingShare}
            onInitialDraftUsed={onPendingShareUsed}
            onComposerFocus={onComposerFocus}
            subject={open.shareId === openShareId ? subject : null}
            onSubjectUsed={onSubjectUsed}
            places={open.shareId === openShareId ? places : []}
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
      {convos === null && <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: FAINT }}>Loading…</div>}
      {convos && convos.length === 0 && (
        <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ font: `400 19px/1.2 ${serif}` }}>No conversations yet.</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "#57534e", textWrap: "pretty" }}>Create a client app link on a trip in the planner and share it. When the client opens it, your chat with them appears here.</span>
        </div>
      )}
      {[...(convos ?? [])]
        .sort((a, b) => {
          const pa = pinned.has(a.shareId) ? 1 : 0;
          const pb = pinned.has(b.shareId) ? 1 : 0;
          if (pa !== pb) return pb - pa;
          return (b.lastAt || "").localeCompare(a.lastAt || "");
        })
        .map((c) => {
        // The last line, the way a messenger's list reads it: the text if there
        // is any, else what the last message WAS — a small glyph and a word for
        // a photo / voice note / location, drawn from the SAME icon set as the
        // paperclip menu (not a coloured emoji), in the muted preview tone. Only
        // a truly empty thread says "No messages yet". "You: " when the advisor
        // sent it.
        const you = c.lastFrom === "advisor" ? "You: " : "";
        const kp = !c.lastText && c.lastKind ? INBOX_KIND_META[c.lastKind] : null;
        const isPinned = pinned.has(c.shareId);
        // One row, no side button — hold it for actions, tap it to open. The
        // whole row is the target, the way a messenger's list works.
        return (
          <button
            key={c.shareId}
            onClick={() => onRowClick(c)}
            onPointerDown={() => onRowDown(c)}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            onPointerCancel={endPress}
            onContextMenu={(e) => { e.preventDefault(); setMenuFor(c.shareId); }}
            className="wg-warm"
            style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid rgba(38,50,58,.08)", background: "#ffffff", borderRadius: 16, padding: "15px 16px", display: "flex", alignItems: "center", gap: 13, touchAction: "pan-y" }}
          >
            <span style={{ flex: "none", width: 42, height: 42, borderRadius: 12, background: "#e7edf1", display: "flex", alignItems: "center", justifyContent: "center", font: `400 18px/1 ${serif}`, color: "#1f3f5c" }}>{(nameOf(c) || "?").charAt(0).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                {isPinned && <Icon name="map-pin" className="h-3.5 w-3.5" aria-label="Pinned" />}
                {nameOf(c)}
              </span>
              <span style={{ fontSize: 12.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                {!c.lastAt ? (
                  "No messages yet"
                ) : c.lastText ? (
                  `${you}${c.lastText}`
                ) : kp ? (
                  <>
                    {you}
                    <span style={{ flexShrink: 0, display: "inline-flex", color: FAINT }}>{kp.glyph}</span>
                    {kp.label}
                  </>
                ) : (
                  `${you}Message`
                )}
              </span>
            </span>
            {c.count > 0 && <span aria-label={`${c.count} unread`} style={{ flex: "none", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: GOLD, color: ON_GOLD, fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.count}</span>}
          </button>
        );
      })}

      {/* Long-press actions — a sheet, since there is no per-row button to hang
          a menu off any more. Pin, Rename (the advisor's own private label) and
          Delete. */}
      {menuFor && (() => {
        const c = (convos ?? []).find((x) => x.shareId === menuFor);
        if (!c) return null;
        const isPinned = pinned.has(c.shareId);
        const item: CSSProperties = { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: 0, background: "none", cursor: "pointer", padding: "14px 18px", fontSize: 14.5, color: INK };
        return (
          <div
            // A fresh press anywhere on the dim area clears the one-tap guard,
            // so a deliberate tap to dismiss always closes — the guard only
            // exists to eat the click the finger-lift synthesises the instant
            // the sheet opens, never a real tap-outside.
            onPointerDown={() => { swallowTap.current = false; }}
            onClick={() => { if (swallowTap.current) { swallowTap.current = false; return; } setMenuFor(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,20,25,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: CREAM, borderRadius: "20px 20px 0 0", padding: "8px 8px calc(8px + env(safe-area-inset-bottom))", animation: "wgIn .2s ease both" }}>
              <div style={{ padding: "10px 18px 8px", font: `400 15px/1.1 ${serif}`, color: "#57534e", borderBottom: "1px solid rgba(38,50,58,.08)" }}>{nameOf(c)}</div>
              <button role="menuitem" className="wg-warm" onClick={() => togglePin(c.shareId)} style={item}>
                <Icon name="map-pin" className="h-[18px] w-[18px]" /> {isPinned ? "Unpin" : "Pin to top"}
              </button>
              <button role="menuitem" className="wg-warm" onClick={() => { setMenuFor(null); setRenaming(c); }} style={item}>
                <Icon name="pencil" className="h-[18px] w-[18px]" /> Rename
              </button>
              <button role="menuitem" className="wg-warm" onClick={() => { setMenuFor(null); void deleteConvo(c.shareId); }} disabled={deleting === c.shareId} style={{ ...item, color: "#b5442e", opacity: deleting === c.shareId ? 0.5 : 1 }}>
                <Icon name="trash" className="h-[18px] w-[18px]" /> Delete conversation
              </button>
            </div>
          </div>
        );
      })()}

      {/* Rename — the advisor's own name for this conversation, kept on the
          device. The client never sees it; on their side the chat stays the
          advisor's own name. */}
      {renaming && (
        <RenameConversation
          initial={nameOf(renaming)}
          fallback={renaming.client || renaming.name}
          onSave={(v) => { saveName(renaming.shareId, v); setRenaming(null); }}
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}

/**
 * A small sheet to rename a conversation to whatever the advisor wants. Empty
 * (or "Reset") clears it back to the client's own name.
 */
function RenameConversation({ initial, fallback, onSave, onClose }: { initial: string; fallback: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 41, background: "rgba(15,20,25,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CREAM, borderRadius: "20px 20px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12, animation: "wgIn .2s ease both" }}>
        <span style={{ font: "600 16px/1 Inter,sans-serif", color: INK }}>Rename conversation</span>
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSave(v); } }}
          placeholder={fallback}
          aria-label="Conversation name"
          maxLength={60}
          style={{ width: "100%", border: "1px solid rgba(38,50,58,.16)", borderRadius: 10, padding: "12px 13px", fontFamily: "Inter,sans-serif", fontSize: 16, color: INK, outline: "none", background: "#fff" }}
        />
        <span style={{ fontSize: 12, color: FAINT, lineHeight: 1.4 }}>Only you see this name. Your client always sees the chat as your name.</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onSave("")} className="wg-warm" style={{ flex: "none", border: "1px solid rgba(38,50,58,.16)", background: "#fff", cursor: "pointer", borderRadius: 12, minHeight: 46, padding: "0 16px", fontSize: 13.5, fontWeight: 600, color: "#57534e" }}>Reset</button>
          <button onClick={() => onSave(v)} className="wg-press" style={{ flex: 1, border: 0, cursor: "pointer", background: GOLD, color: ON_GOLD, borderRadius: 12, minHeight: 46, fontSize: 14.5, fontWeight: 700 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A 44-pixel hit area on a control that has to look like inline text.
 *
 * An outside audit measured the small controls in here — the document-sharing
 * toggle, the day-note action, "Full day →", the chat's Cancel — as inline
 * underlined buttons with no padding and 11.5 to 12.5 pixel text. On a phone
 * those are roughly fifteen pixels tall. They are also some of the ones a
 * traveller uses most, and one of them decides whether a document is visible
 * to a client.
 *
 * Making them physically bigger was the wrong answer: they sit inline beside a
 * heading or in a row of running text, and a 44px button there pushes the line
 * apart. So the padding grows and an equal negative margin takes the space
 * back — the control looks exactly as it did and the finger has 44 pixels to
 * land on. That is the standard trick and it is worth naming once rather than
 * writing out at six call sites.
 *
 * Where a control is already a block with its own padding, give it minHeight
 * instead; this is only for the ones pretending to be text.
 */
const TAP_INLINE = { padding: "13px 8px", margin: "-13px -8px" } as const;

const CSS = `
@keyframes wgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes wgPulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.wg-app-root { min-height: 100dvh; background: #15324b; color: #26323a; }
/* The app's own scroll region owns its overscroll: a pull past the top or
 * bottom stays inside it and never chains to the document, so the fixed header
 * and tab bar do not bounce. */
.wg-scroll { overscroll-behavior: contain; }
.wg-scroll::-webkit-scrollbar, .wg-toolbar::-webkit-scrollbar { display: none; }
/* The per-message "⋯": nothing to see on a phone, where holding the bubble
 * opens the same actions — that is how WhatsApp and Signal read. On a hover
 * device (a desktop mouse) there is no press-and-hold, so it fades in on hover
 * of its own message row and on keyboard focus. */
.wg-msgdots { opacity: 0; transition: opacity .14s ease; }
@media (hover: none) { .wg-msgdots { display: none; } }
@media (hover: hover) {
  .wg-msgrow:hover .wg-msgdots { opacity: .4; }
  .wg-msgdots:focus-visible { opacity: .7; }
}
/* No blue focus box on the message field — some Android WebViews draw one over
 * a focused textarea regardless of inline styles, which read as a sloppy square
 * around the composer. Kill the outline, the tap highlight and any focus ring. */
.wg-phone textarea, .wg-phone input, .wg-phone button { -webkit-tap-highlight-color: transparent; }
.wg-phone textarea:focus, .wg-phone textarea:focus-visible, .wg-phone input:focus, .wg-phone input:focus-visible { outline: none; box-shadow: none; }
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
