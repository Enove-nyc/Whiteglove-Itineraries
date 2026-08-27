/**
 * One trip, several families — and the four questions an adviser actually has.
 *
 * WHO HAS PAID, WHO OWES, WHO IS MISSING INFORMATION, WHO NEEDS ATTENTION. A
 * group trip already worked on this site: travelers carry a `family`, and that
 * one field is both the privacy unit (redactForTraveler) and the payment unit
 * (data/trip-payments.ts). What there was no way to do was LOOK at it. The
 * adviser could see a total and a list of assignments and had to hold the
 * roster in their head to turn that into "the Weisses still owe $1,200".
 *
 * NOTHING NEW IS STORED. A party is derived from the travelers on the trip and
 * the balance already beside it, every time, so it cannot drift out of step
 * with either. There is no group record to create, no second place a family's
 * name lives, and no master itinerary copied per family — the itinerary is one
 * itinerary and always was.
 *
 * NO PRIVATE DATA CROSSES A PARTY LINE, and the type is what enforces it: a
 * Party carries no form answers at all — not the passport number, not the
 * emergency contact, not one field of it. Whether somebody answered is a fact
 * about the trip's progress; what they answered is theirs, and it stays behind
 * the planner's own authenticated route. There is deliberately nowhere on this
 * type to put it.
 *
 * A FORM IS MATCHED BY AN EXACT NAME OR NOT AT ALL. Responses are typed by
 * whoever filled them in, against no traveler record. Guessing which family
 * "D. Weiss" belongs to would attribute one family's answers to another, which
 * is the one failure this file must never have. So a response counts for a
 * party only when its name matches a traveler in that party exactly, and only
 * when it matches nobody in any other party; anything else is left unmatched
 * and reported as such, because "we cannot tell" is a true answer and a guess
 * is not.
 *
 * Pure, like every other data/*.ts here.
 */

import {
  travelersOf,
  travelerUnitKey,
  unitsOf,
  type ItinTraveler,
  type Itinerary,
} from "@/data/itinerary";
import {
  OPEN_BALANCE_UNIT_KEY,
  hasBalance,
  nextDueFor,
  paidCentsFor,
  remainingCentsFor,
  type TripBalance,
} from "@/data/trip-payments";
import { type ClientFormTemplate, type ClientFormResponse } from "@/data/client-form";

/** Why a party is on the adviser's list. Ordered by how much it costs to ignore. */
export type PartyNeedKind = "overdue" | "owes" | "no-contact" | "no-form";

export type PartyNeed = { kind: PartyNeedKind; label: string };

export type PartyShare = {
  assignedCents: number;
  paidCents: number;
  remainingCents: number;
  /** The next unpaid instalment, when there is a schedule. */
  nextDue: { label: string; dueDate?: string } | null;
};

export type Party = {
  /** Matches travelerUnitKey() — "family:weiss family" or "solo:<id>". */
  unitKey: string;
  /** "Weiss family", or a solo traveler's own name. */
  label: string;
  travelers: ItinTraveler[];
  travelerCount: number;
  /**
   * Who to ring — the first person in the party with a way of being reached.
   * Null when nobody in it has an email or a phone, which is itself a need.
   */
  contact: { name: string; email?: string; phone?: string } | null;
  /**
   * This party's money, or null when the trip's balance is not split by party
   * — an open balance is one pot everybody pays into, and pretending it were a
   * share would invent a number nobody agreed.
   */
  share: PartyShare | null;
  /**
   * Whether somebody in this party has answered the form.
   *
   * Null when no form has been set up at all, which is not the same as "not
   * answered" and must not read that way.
   */
  answered: boolean | null;
  needs: PartyNeed[];
};

export type GroupTotals = {
  parties: number;
  travelers: number;
  assignedCents: number;
  paidCents: number;
  remainingCents: number;
  /** How many parties still owe something. */
  owing: number;
  /** How many have a need of any kind — the "needs attention" count. */
  needing: number;
  /**
   * Form responses that could not be attributed to any one party. Shown as a
   * number, never guessed into a family. See the note at the top.
   */
  unmatchedResponses: number;
};

function contactOf(travelers: readonly ItinTraveler[]): Party["contact"] {
  const reachable = travelers.find((traveler) => traveler.email?.trim() || traveler.phone?.trim());
  if (!reachable) return null;
  return {
    name: reachable.name,
    email: reachable.email?.trim() || undefined,
    phone: reachable.phone?.trim() || undefined,
  };
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase("en");

/**
 * Which party each response belongs to, or nothing.
 *
 * Two travelers with the same name in different families is not a match — it
 * is an ambiguity, and this returns null for it rather than picking one.
 */
export function attributeResponses(
  itinerary: Itinerary,
  responses: readonly ClientFormResponse[],
): { byUnit: Map<string, number>; unmatched: number } {
  const travelers = travelersOf(itinerary);
  const unitsByName = new Map<string, Set<string>>();
  for (const traveler of travelers) {
    const key = nameKey(traveler.name);
    if (!key) continue;
    const units = unitsByName.get(key) ?? new Set<string>();
    units.add(travelerUnitKey(traveler));
    unitsByName.set(key, units);
  }

  const byUnit = new Map<string, number>();
  let unmatched = 0;
  for (const response of responses) {
    const units = unitsByName.get(nameKey(response.respondentName));
    if (!units || units.size !== 1) {
      unmatched += 1;
      continue;
    }
    const unitKey = [...units][0];
    byUnit.set(unitKey, (byUnit.get(unitKey) ?? 0) + 1);
  }
  return { byUnit, unmatched };
}

function needsFor(
  share: PartyShare | null,
  contact: Party["contact"],
  answered: boolean | null,
  today: string,
  currencyLabel: (cents: number) => string,
): PartyNeed[] {
  const needs: PartyNeed[] = [];
  if (share && share.remainingCents > 0) {
    const due = share.nextDue?.dueDate;
    if (due && due < today) {
      needs.push({ kind: "overdue", label: `${currencyLabel(share.remainingCents)} overdue — ${share.nextDue?.label} was due ${due}` });
    } else {
      needs.push({
        kind: "owes",
        label: due ? `${currencyLabel(share.remainingCents)} due by ${due}` : `${currencyLabel(share.remainingCents)} still owed`,
      });
    }
  }
  if (!contact) needs.push({ kind: "no-contact", label: "No email or phone for anybody in this family" });
  if (answered === false) needs.push({ kind: "no-form", label: "Has not answered the form yet" });
  return needs;
}

/**
 * The trip's parties, in the order they first appear on the traveler list.
 *
 * `today` is passed in rather than read so a due date can be tested without
 * moving a clock, the same way the reminders are.
 */
export function partiesOf(
  itinerary: Itinerary,
  balance: TripBalance | null,
  options: {
    today: string;
    template?: ClientFormTemplate | null;
    responses?: readonly ClientFormResponse[];
    /** How to write an amount. Injected so this file stays free of Intl. */
    formatAmount: (cents: number) => string;
  },
): { parties: Party[]; totals: GroupTotals } {
  const travelers = travelersOf(itinerary);
  const units = unitsOf(itinerary);
  const formSetUp = Boolean(options.template && options.template.fields.length > 0);
  const { byUnit, unmatched } = attributeResponses(itinerary, options.responses ?? []);

  // An open balance is one pot, not a set of shares — see PartyShare above.
  const splitByParty =
    Boolean(balance) &&
    hasBalance(balance as TripBalance) &&
    !(balance as TripBalance).assignments.some((assignment) => assignment.unitKey === OPEN_BALANCE_UNIT_KEY);

  const parties: Party[] = units.map((unit) => {
    const mates = travelers.filter((traveler) => travelerUnitKey(traveler) === unit.unitKey);
    const contact = contactOf(mates);

    let share: PartyShare | null = null;
    if (splitByParty && balance) {
      const assigned = balance.assignments.find((a) => a.unitKey === unit.unitKey);
      if (assigned) {
        share = {
          assignedCents: assigned.amountCents,
          paidCents: paidCentsFor(balance, unit.unitKey),
          remainingCents: remainingCentsFor(balance, unit.unitKey),
          nextDue: nextDueFor(balance, unit.unitKey),
        };
      }
    }

    const answered = formSetUp ? (byUnit.get(unit.unitKey) ?? 0) > 0 : null;

    return {
      unitKey: unit.unitKey,
      label: unit.label,
      travelers: mates,
      travelerCount: mates.length,
      contact,
      share,
      answered,
      needs: needsFor(share, contact, answered, options.today, options.formatAmount),
    };
  });

  const totals: GroupTotals = {
    parties: parties.length,
    travelers: travelers.length,
    assignedCents: parties.reduce((sum, party) => sum + (party.share?.assignedCents ?? 0), 0),
    paidCents: parties.reduce((sum, party) => sum + (party.share?.paidCents ?? 0), 0),
    remainingCents: parties.reduce((sum, party) => sum + (party.share?.remainingCents ?? 0), 0),
    owing: parties.filter((party) => (party.share?.remainingCents ?? 0) > 0).length,
    needing: parties.filter((party) => party.needs.length > 0).length,
    unmatchedResponses: unmatched,
  };

  return { parties, totals };
}

/** Everything that needs attention first, then the rest in roster order. */
export function sortForAdviser(parties: readonly Party[]): Party[] {
  const worst = (party: Party) => {
    if (party.needs.some((need) => need.kind === "overdue")) return 0;
    if (party.needs.some((need) => need.kind === "owes")) return 1;
    if (party.needs.length > 0) return 2;
    return 3;
  };
  return [...parties].sort((a, b) => worst(a) - worst(b));
}

/** True when this trip is worth showing as a group at all. */
export function isGroupTrip(itinerary: Itinerary): boolean {
  return unitsOf(itinerary).length > 1;
}
