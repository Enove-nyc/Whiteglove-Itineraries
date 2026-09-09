"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isUnconfirmed, waitingLine, type PendingImport } from "@/data/inbound-import";

type InboundState = {
  address: string;
  privateAddress: string;
  accountEmail: string;
  trustedSenders: string[];
  maxTrustedSenders: number;
  pending: PendingImport[];
};

const EMPTY: InboundState = { address: "", privateAddress: "", accountEmail: "", trustedSenders: [], maxTrustedSenders: 6, pending: [] };

/**
 * THE ADDRESS TO FORWARD A CONFIRMATION TO, WHERE SOMEBODY WOULD LOOK FOR IT.
 *
 * It was already in the planner, inside Smart Import — which is exactly where
 * it is not wanted. Forwarding happens in a mail app, on a phone, away from
 * this site; the address has to be somewhere you can go and copy it from
 * without first opening a trip and a panel inside it.
 *
 * ONE ADDRESS, MATCHED BY SENDER — the owner's word was that this should work
 * "like all other sites": one thing to remember, not a private token to go
 * find. It works because it is matched against every email the account is
 * known to send from — the account's own address, plus whoever is added
 * below. Nothing is proven by a From line; it is typed by whoever sends the
 * message and forging it costs nothing. So a match by sender is never enough
 * on its own — see the unconfirmed note and the review step it points at.
 *
 * THE PRIVATE ADDRESS STILL EXISTS, folded under "Prefer a private address?"
 * for anyone who wants the stronger guarantee: a random token nobody else can
 * guess, checked before the sender ever is. Removing it outright would have
 * taken away the one address that needs no trust in a From line at all.
 *
 * NOTHING IS DRAWN UNTIL MAIL CAN ACTUALLY ARRIVE. The route hands back an
 * empty address while the inbound provider is unwired, and an empty address
 * draws nothing at all rather than an address that goes nowhere.
 *
 * REVIEW STAYS IN THE PLANNER. Anything forwarded waits until it is checked
 * against a trip, and a trip is what the planner has — so this says how many
 * are waiting and links there, rather than becoming a second review screen.
 */
export default function ForwardingAddress() {
  const [state, setState] = useState<InboundState>(EMPTY);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [showPrivate, setShowPrivate] = useState(false);
  const [newSender, setNewSender] = useState("");
  const [senderBusy, setSenderBusy] = useState(false);
  const [senderError, setSenderError] = useState("");

  // Shared by the initial load and by removeSender's error fallback, so both
  // read the account's actual state rather than trusting an optimistic guess.
  async function load(): Promise<boolean> {
    try {
      const res = await fetch("/api/account/inbound", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as Partial<InboundState> | null;
      if (!data?.address) return false;
      setState({ ...EMPTY, ...data });
      return true;
    } catch {
      // Forwarding is one way in among three. Silence here costs nothing.
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/account/inbound", { cache: "no-store" }).catch(() => null);
      if (cancelled || !res) return;
      const data = (await res.json().catch(() => null)) as Partial<InboundState> | null;
      if (cancelled || !data?.address) return;
      setState({ ...EMPTY, ...data });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state.address) return null;

  /**
   * A new PRIVATE address, and the old one stops working immediately.
   *
   * ASKED BEFORE IT HAPPENS, because it cannot be undone and because anybody
   * who has saved the old address will be forwarding into a dead letter box
   * afterwards. The shared address above is unaffected — this only touches
   * the token address folded under "Prefer a private address?".
   */
  async function rotate() {
    setRotating(true);
    try {
      const res = await fetch("/api/account/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const data = (await res.json().catch(() => null)) as { address?: string } | null;
      if (data?.address) setState((prev) => ({ ...prev, privateAddress: data.address! }));
      setConfirmingRotate(false);
    } catch {
      // Left as it was. The address on screen is still the working one.
    } finally {
      setRotating(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers refuse without a permission the user never granted. The
      // address is on screen either way, which is what it is there for.
      setCopied(false);
    }
  }

  async function addSender(e: React.FormEvent) {
    e.preventDefault();
    setSenderBusy(true);
    setSenderError("");
    try {
      const res = await fetch("/api/account/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addSender", sender: newSender }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; trustedSenders?: string[] } | null;
      if (!res.ok || !data?.ok) {
        setSenderError(data?.error || "Could not save that just now.");
        return;
      }
      setState((prev) => ({ ...prev, trustedSenders: data.trustedSenders ?? prev.trustedSenders }));
      setNewSender("");
    } catch {
      setSenderError("Could not reach the server. Nothing was added.");
    } finally {
      setSenderBusy(false);
    }
  }

  async function removeSender(sender: string) {
    // Optimistic: the list is short and this is a settings change, not
    // something that needs to hold on screen while it round-trips.
    setState((prev) => ({ ...prev, trustedSenders: prev.trustedSenders.filter((s) => s !== sender) }));
    try {
      const res = await fetch("/api/account/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeSender", sender }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; trustedSenders?: string[] } | null;
      if (data?.trustedSenders) setState((prev) => ({ ...prev, trustedSenders: data.trustedSenders! }));
      else void load();
    } catch {
      void load();
    }
  }

  return (
    <section aria-labelledby="account-forwarding" className="mt-8">
      <h2 id="account-forwarding" className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">
        Forward a confirmation
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Send a flight, hotel, restaurant or ticket confirmation to this address and the details are read out of it,
        ready to check against your trip. Attachments too — the airline&rsquo;s PDF, a screenshot, a photo of a printed
        voucher. Nothing is added to a trip until you look at it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] px-4 py-3">
        <span className="min-w-0 break-all font-mono text-sm text-[var(--navy)]">{state.address}</span>
        <button
          type="button"
          onClick={() => copy(state.address)}
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] bg-white px-4 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-500">
        One address, for anyone in your household. It works when sent from {state.accountEmail || "your account's email"}
        {" "}or any address you add below. Sent from somewhere else, it still arrives, marked for you to confirm.
      </p>

      <div className="mt-4 rounded-lg border border-[var(--gold-light)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Also works from</p>
        <ul className="mt-2 space-y-1.5">
          <li className="flex items-center justify-between gap-3 text-sm text-[var(--navy)]">
            <span className="min-w-0 truncate">{state.accountEmail || "your account"}</span>
            <span className="shrink-0 text-xs font-semibold text-stone-400">your account</span>
          </li>
          {state.trustedSenders.map((sender) => (
            <li key={sender} className="flex items-center justify-between gap-3 text-sm text-[var(--navy)]">
              <span className="min-w-0 truncate">{sender}</span>
              <button
                type="button"
                onClick={() => void removeSender(sender)}
                className="shrink-0 text-xs font-semibold text-stone-500 underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {state.trustedSenders.length < state.maxTrustedSenders ? (
          <form onSubmit={addSender} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={newSender}
              onChange={(e) => setNewSender(e.target.value)}
              placeholder="A spouse or travel agent's email"
              className="min-h-11 flex-1 rounded-md border border-[var(--gold-light)] bg-white px-3 text-sm text-[var(--navy)] outline-none focus:border-[var(--gold)]"
            />
            <button
              type="submit"
              disabled={senderBusy || !newSender.trim()}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] px-4 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)] disabled:opacity-50"
            >
              {senderBusy ? "Adding…" : "Add"}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-stone-500">
            That is {state.maxTrustedSenders} — remove one above to add another.
          </p>
        )}
        {senderError && <p className="mt-2 text-xs font-semibold text-red-700">{senderError}</p>}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowPrivate((v) => !v)}
          className="text-xs font-semibold text-stone-500 underline"
        >
          {showPrivate ? "Hide the private address" : "Prefer a private address instead?"}
        </button>
        {showPrivate && (
          <div className="mt-3 rounded-lg border border-[var(--gold-light)] bg-[#FAF8F3] p-4">
            <p className="text-xs leading-5 text-stone-600">
              This one is yours alone — a random address nobody else can guess, checked before anything about who sent
              it. Anything sent here needs no confirming.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="min-w-0 break-all font-mono text-sm text-[var(--navy)]">{state.privateAddress}</span>
              <button
                type="button"
                onClick={() => copy(state.privateAddress)}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] bg-white px-4 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {confirmingRotate ? (
              <div className="mt-3 rounded-lg border border-[var(--gold-light)] bg-white p-3">
                <p className="text-xs leading-5 text-stone-600">
                  The address above stops working straight away. Anywhere you have saved it will need the new one.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={rotate}
                    disabled={rotating}
                    className="inline-flex min-h-11 items-center rounded-full bg-[var(--navy)] px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {rotating ? "Changing…" : "Yes, change it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRotate(false)}
                    className="inline-flex min-h-11 items-center rounded-full border border-stone-300 px-4 text-xs font-bold text-[var(--navy)]"
                  >
                    Keep this one
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRotate(true)}
                className="mt-3 text-xs font-semibold text-stone-500 underline"
              >
                Change this address
              </button>
            )}
          </div>
        )}
      </div>

      {state.pending.some(isUnconfirmed) && (
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Something is waiting that was sent from an address we could not match to you. The planner says which.
        </p>
      )}
      {state.pending.length > 0 && (
        <p className="mt-3 text-sm font-semibold text-[var(--gold-ink)]">
          {waitingLine(state.pending.length)} —{" "}
          <Link href="/itinerary" className="text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            open the planner to check
          </Link>
          .
        </p>
      )}
    </section>
  );
}
