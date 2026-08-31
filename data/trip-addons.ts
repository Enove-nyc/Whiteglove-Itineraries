// Optional extras a planner offers on top of a trip — travel insurance, an
// airport transfer, a private tour, a spa day. Pure data model + pure
// transforms, the same discipline data/proposal.ts and data/trip-payments.ts
// keep, and the same cents-as-whole-integers rule (see trip-payments.ts's
// own note on why).
//
// AN ADD-ON IS NOT A PROPOSAL OPTION. A proposal is several whole trips to
// choose between, before the trip exists; an add-on is a single optional
// extra tacked onto a trip that's already confirmed. They're offered and
// answered the same way (a public link the client accepts or declines from),
// but kept as their own model rather than folded into the proposal's
// component list, since an add-on's only two states that matter are
// accepted or not — it never needs a proposal's multi-option comparison.

export type AddonStatus = "offered" | "accepted" | "declined";

export const ADDON_STATUS_LABEL: Record<AddonStatus, string> = {
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
};

export type AddonItem = {
  id: string;
  /** "Travel insurance", "Airport transfer", "Private city tour". */
  name: string;
  description?: string;
  priceCents: number;
  /** ISO 4217, uppercase — e.g. "USD". Defaults to the trip's own balance
   *  currency when an add-on is offered, so what a client is asked to pay
   *  reads in the same money as the rest of the trip's balance. */
  currency: string;
  status: AddonStatus;
  createdAt: string;
  updatedAt: string;
  /** When the client answered — accepted or declined. Absent while still offered. */
  respondedAt?: string;
};

export function emptyAddonItem(currency = "USD"): AddonItem {
  const now = new Date().toISOString();
  return { id: "", name: "", priceCents: 0, currency, status: "offered", createdAt: now, updatedAt: now };
}

/** Only what's been accepted counts toward what the client owes. */
export function acceptedAddonsCents(items: AddonItem[]): number {
  return items.filter((i) => i.status === "accepted").reduce((sum, i) => sum + i.priceCents, 0);
}

/** What's still waiting on an answer — neither accepted nor declined yet. */
export function pendingAddons(items: AddonItem[]): AddonItem[] {
  return items.filter((i) => i.status === "offered");
}

export function formatAddonCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
