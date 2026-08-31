// What an agency earns from a trip — pure data model + pure transforms, the
// same discipline data/trip-payments.ts keeps (and the same cents-as-whole-
// integers rule: see that file's own note on why).
//
// A DIFFERENT MONEY FROM data/trip-payments.ts. Payments is what a CLIENT
// pays the agency for the trip; this is what a SUPPLIER — a hotel, a tour
// operator, an airline — pays the agency back for bringing them the
// business. The two totals are unrelated: a trip can be paid in
// full by the client and still be waiting on its commission from the hotel,
// or the other way round. Kept as two separate ledgers rather than folded
// into one, the same reason a trip's balance and its itinerary are two
// separate things that happen to be about the same trip.

export type CommissionRecord = {
  id: string;
  /** "Hotel Bristol", "ABC Tours" — whoever the booking was made through. */
  supplier: string;
  /** What was actually booked — "5 nights, deluxe room". Not required. */
  description?: string;
  /** What the trip was charged for this booking — the client-facing price. */
  revenueCents: number;
  /** What the agency actually paid the supplier for it. */
  costCents: number;
  /** What the agency expects back from the supplier for this booking. */
  expectedCommissionCents: number;
  /** What has actually arrived so far — see receivedTotal below for why this
   *  is its own number rather than a status flag. */
  receivedCommissionCents: number;
  /** When the most recent payment against this booking's commission arrived. */
  receivedAt?: string;
  /** ISO 4217, uppercase — e.g. "USD". Defaults to the trip's own balance
   *  currency when a record is created, so a booking logged in the same
   *  money the client is being charged in reads correctly without the
   *  planner having to set it by hand every time. */
  currency: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export function emptyCommissionRecord(currency = "USD"): CommissionRecord {
  const now = new Date().toISOString();
  return {
    id: "",
    supplier: "",
    revenueCents: 0,
    costCents: 0,
    expectedCommissionCents: 0,
    receivedCommissionCents: 0,
    currency,
    createdAt: now,
    updatedAt: now,
  };
}

/** What the trip was charged for, all told — the client-facing total. */
export function tripRevenueCents(records: CommissionRecord[]): number {
  return records.reduce((sum, r) => sum + r.revenueCents, 0);
}

/** What the agency paid its suppliers for the trip, all told. */
export function supplierCostCents(records: CommissionRecord[]): number {
  return records.reduce((sum, r) => sum + r.costCents, 0);
}

/** What the agency expects back from suppliers, across every booking. */
export function expectedCommissionCents(records: CommissionRecord[]): number {
  return records.reduce((sum, r) => sum + r.expectedCommissionCents, 0);
}

/** What has actually arrived, across every booking — RECEIVED IS ITS OWN
 *  NUMBER, not "expected minus outstanding", because a supplier sometimes
 *  pays more or less than first quoted; this is the one that has to match
 *  what the bank actually shows. */
export function receivedCommissionCents(records: CommissionRecord[]): number {
  return records.reduce((sum, r) => sum + r.receivedCommissionCents, 0);
}

/** What's still owed — never negative, even if a supplier overpaid one
 *  booking and underpaid another. */
export function outstandingCommissionCents(records: CommissionRecord[]): number {
  return Math.max(0, expectedCommissionCents(records) - receivedCommissionCents(records));
}

export function formatCommissionCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
