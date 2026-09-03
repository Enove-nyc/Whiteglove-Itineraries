"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * PUT THIS TRIP ON MY PHONE.
 *
 * The Trip Pass, spent. One button, because spending the pass and getting the
 * code are one intention: the server does both in a single action (see
 * "app-code" in app/api/account/trips/route.ts) so a pass can never end up
 * spent on a trip with no way into it.
 *
 * The code it hands back is the same kind of code an adviser sends a client,
 * and it opens the same app — the difference is only that there is nobody on
 * the other end of this one, so the app carries no Messages.
 *
 * IT NAMES NO PRICE. When there is no pass left this says so and links to the
 * account page, where the amount is read from Stripe. Nothing on this site
 * prints an amount except offerLine().
 */
export default function TripAppCode({
  tripId,
  tripName,
  code: existing,
}: {
  tripId: string;
  tripName: string;
  /** Already in the app: show the code rather than the button. */
  code?: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(existing ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [needsPass, setNeedsPass] = useState(false);
  const [copied, setCopied] = useState(false);

  async function put() {
    setBusy(true);
    setProblem("");
    setNeedsPass(false);
    try {
      const res = await fetch("/api/account/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "app-code", id: tripId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; code?: string; error?: string; needsPass?: boolean } | null;
      if (!res.ok || !data?.ok || !data.code) {
        setNeedsPass(Boolean(data?.needsPass));
        setProblem(data?.error || "That could not be done just now.");
        return;
      }
      setCode(data.code);
      router.refresh();
    } catch {
      setProblem("That could not be done just now.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      // A browser that refuses the clipboard is not an error worth a message —
      // the code is on the screen and can be read off it.
    }
  }

  if (code) {
    return (
      <div className="rounded-2xl border border-[var(--gold)]/30 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--gold-ink)]">{tripName} is in the app</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Open the app on your phone and enter this code. It opens this trip and nothing else, and it keeps working with
          no signal.
        </p>
        <p className="mt-3 font-mono text-xl font-bold tracking-[0.18em] text-[var(--navy)]">{code}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            {copied ? "Copied" : "Copy the code"}
          </button>
          <Link
            href={`/i/${encodeURIComponent(code)}/app`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--navy)] underline decoration-[var(--gold)] decoration-2 underline-offset-4"
          >
            Open it here
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--gold-light)] bg-white p-5">
      <p className="text-sm leading-6 text-stone-600">
        {tripName} is not in the app yet. A Trip Pass opens one trip on your phone — a day at a time, with the wallet
        kept for when there is no signal.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={put}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-md bg-[var(--navy)] px-4 text-sm font-semibold text-[var(--cream)] disabled:opacity-60"
        >
          {busy ? "One moment…" : "Put this trip in the app"}
        </button>
      </div>
      {problem && (
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {problem}
          {needsPass && (
            <>
              {" "}
              <Link href="/account" className="font-semibold text-[var(--gold-ink)] underline">
                Get a Trip Pass
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
