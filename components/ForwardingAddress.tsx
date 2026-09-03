"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isUnconfirmed, waitingLine, type PendingImport } from "@/data/inbound-import";

/**
 * THE ADDRESS TO FORWARD A CONFIRMATION TO, WHERE SOMEBODY WOULD LOOK FOR IT.
 *
 * It was already in the planner, inside Smart Import — which is exactly where
 * it is not wanted. Forwarding happens in a mail app, on a phone, away from
 * this site; the address has to be somewhere you can go and copy it from
 * without first opening a trip and a panel inside it.
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
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState<PendingImport[]>([]);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/inbound", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { address?: string; pending?: PendingImport[] } | null;
        if (cancelled || !data?.address) return;
        setAddress(data.address);
        setPending(data.pending ?? []);
      } catch {
        // Forwarding is one way in among three. Silence here costs nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!address) return null;

  /**
   * A new address, and the old one stops working immediately.
   *
   * ASKED BEFORE IT HAPPENS, because it cannot be undone and because anybody
   * who has saved the old address in their contacts — including the person
   * doing this — will be forwarding into a dead letter box afterwards. It is
   * also how an account issued one of the old character addresses gets a
   * memorable one.
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
      if (data?.address) setAddress(data.address);
      setConfirming(false);
    } catch {
      // Left as it was. The address on screen is still the working one.
    } finally {
      setRotating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers refuse without a permission the user never granted. The
      // address is on screen either way, which is what it is there for.
      setCopied(false);
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
        <span className="min-w-0 break-all font-mono text-sm text-[var(--navy)]">{address}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--gold-light)] bg-white px-4 text-xs font-bold text-[var(--navy)] transition hover:border-[var(--gold)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-500">
        This address is yours alone — the four words are what tell us it is your trip, so keep them to yourself. Send
        from a different email address and it still arrives, marked for you to confirm.
      </p>
      {confirming ? (
        <div className="mt-3 rounded-lg border border-[var(--gold-light)] bg-white p-3">
          <p className="text-xs leading-5 text-stone-600">
            The address above stops working straight away. Anywhere you have saved it — your own contacts included —
            will need the new one.
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
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-11 items-center rounded-full border border-stone-300 px-4 text-xs font-bold text-[var(--navy)]"
            >
              Keep this one
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 text-xs font-semibold text-stone-500 underline"
        >
          Change this address
        </button>
      )}
      {pending.some(isUnconfirmed) && (
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Something is waiting that was sent from an address we could not match to you. The planner says which.
        </p>
      )}
      {pending.length > 0 && (
        <p className="mt-3 text-sm font-semibold text-[var(--gold-ink)]">
          {waitingLine(pending.length)} —{" "}
          <Link href="/itinerary" className="text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-4">
            open the planner to check
          </Link>
          .
        </p>
      )}
    </section>
  );
}
