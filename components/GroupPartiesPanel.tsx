"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GroupTotals, Party } from "@/data/trip-parties";

/**
 * The group trip, as an adviser reads it: one line per family, four answers.
 *
 * WHO HAS PAID, WHO OWES, WHO IS MISSING INFORMATION, WHO NEEDS ATTENTION —
 * and each family's row says all four without opening anything. The families
 * that need something sort to the top, because a list in roster order makes an
 * adviser read every row to find the two that matter.
 *
 * ONE ITINERARY, SEVERAL FAMILIES. There is no per-family copy of the trip and
 * nothing here creates one: a party is derived from the travelers already on
 * the itinerary. Change the trip and every family's copy changed, because
 * there is only ever the one.
 *
 * NO ANSWERS ON THIS SCREEN. Whether a family has answered the form is shown;
 * what they wrote is not, here or in the payload behind it. A passport number
 * belongs to the family that gave it and is read in one place, the form screen.
 */

type Payload = {
  tripId: string | null;
  tripName: string;
  currency: string;
  splitByParty: boolean;
  parties: Party[];
  totals: GroupTotals | null;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const NEED_TONE: Record<string, string> = {
  overdue: "border-red-300 bg-red-50 text-red-800",
  owes: "border-amber-300 bg-amber-50 text-amber-900",
  "no-contact": "border-stone-300 bg-stone-50 text-stone-700",
  "no-form": "border-stone-300 bg-stone-50 text-stone-700",
};

/**
 * The fetching half. Kept apart from the rendering half below so the layout
 * can be rendered from a payload — in a test, or from a preview — without a
 * session, and so there is exactly one place that decides how a party reads.
 */
export default function GroupPartiesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/account/parties", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) setError(payload?.error || "Could not read this trip just now.");
        else setData(payload as Payload);
      } catch {
        if (active) setError("Could not reach the site just now.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-stone-500">Reading the trip…</p>;
  if (error) return <p className="text-sm font-semibold text-red-700">{error}</p>;
  if (!data?.tripId) {
    return (
      <p className="text-sm leading-6 text-stone-600">
        Open a trip in the{" "}
        <Link href="/itinerary" className="font-semibold text-[var(--navy)] underline decoration-[var(--gold)] underline-offset-2">
          planner
        </Link>{" "}
        first — this reads whichever trip you have open.
      </p>
    );
  }

  return <GroupParties data={data} />;
}

export function GroupParties({ data }: { data: Payload }) {
  const { parties, totals, currency } = data;

  if (parties.length < 2) {
    // One family is a trip, not a group. Said plainly rather than shown as a
    // list of one, and it names the field that makes it a group.
    return (
      <p className="text-sm leading-6 text-stone-600">
        <span className="font-semibold text-[var(--navy)]">{data.tripName}</span> has one party on it. Put a family name
        against each traveler in the planner — travelers sharing a family name are one party here, for the roster and for
        the split.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-[var(--gold-light)] bg-[#fcfaf6] p-5">
        <p className="font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--navy)]">{data.tripName}</p>
        <p className="mt-1 text-sm text-stone-600">
          {totals?.travelers} travelers · {totals?.parties} families
          {data.splitByParty && totals ? ` · ${money(totals.paidCents, currency)} in, ${money(totals.remainingCents, currency)} out` : ""}
        </p>
        {totals && totals.needing > 0 && (
          <p className="mt-2 text-sm font-semibold text-[var(--navy)]">
            {totals.needing} of {totals.parties} need something.
          </p>
        )}
        {!data.splitByParty && (
          // An open balance is one pot. Saying so beats showing every family
          // owing nothing, which would read as everybody paid.
          <p className="mt-2 text-xs leading-5 text-stone-500">
            This trip&apos;s balance is not split by family, so there is no per-family share to show. Split it on{" "}
            <Link href="/payments" className="font-semibold text-[var(--navy)] underline">
              Payments
            </Link>
            .
          </p>
        )}
        {totals && totals.unmatchedResponses > 0 && (
          // Never guessed into a family — see data/trip-parties.ts.
          <p className="mt-2 text-xs leading-5 text-stone-500">
            {totals.unmatchedResponses} form {totals.unmatchedResponses === 1 ? "answer" : "answers"} could not be
            matched to a family by name. Read them on{" "}
            <Link href="/forms" className="font-semibold text-[var(--navy)] underline">
              Client forms
            </Link>
            .
          </p>
        )}
      </div>

      <ul className="divide-y divide-[var(--gold-light)] rounded-xl border border-[var(--gold-light)] bg-white">
        {parties.map((party) => (
          <li key={party.unitKey} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-semibold text-[var(--navy)]">
                {party.label}
                <span className="ml-2 text-sm font-normal text-stone-600">
                  {party.travelerCount} {party.travelerCount === 1 ? "traveler" : "travelers"}
                </span>
              </p>
              {party.share && (
                <p className="text-sm text-stone-600">
                  {party.share.remainingCents === 0 ? (
                    <span className="font-semibold text-emerald-800">Paid</span>
                  ) : (
                    <>
                      <span className="font-semibold text-[var(--navy)]">{money(party.share.remainingCents, currency)}</span> of{" "}
                      {money(party.share.assignedCents, currency)} left
                    </>
                  )}
                </p>
              )}
            </div>

            <p className="mt-1 text-sm text-stone-600">
              {party.contact ? (
                <>
                  {party.contact.name} · {party.contact.email || party.contact.phone}
                </>
              ) : (
                <span className="text-stone-500">No contact yet</span>
              )}
              {party.answered === true && <span className="ml-2 text-emerald-800">· form answered</span>}
            </p>

            {party.needs.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {party.needs.map((need) => (
                  <li
                    key={`${party.unitKey}-${need.kind}`}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NEED_TONE[need.kind] ?? NEED_TONE["no-form"]}`}
                  >
                    {need.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
