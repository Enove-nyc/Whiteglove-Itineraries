// A planner's own content library: hotels, activities, tours, contacts —
// saved once, reused on any trip afterward. Pure data model + pure
// transforms, the same discipline data/itinerary.ts and data/proposal.ts
// keep. A LibraryItem is deliberately shaped like a ProposalComponent —
// same fields, same kinds — so inserting one into a proposal option is a
// straight copy, never a second shape to keep in sync.

import type { Itinerary, ItinActivity } from "@/data/itinerary";
import { PROPOSAL_COMPONENT_LABEL, type ProposalComponent, type ProposalComponentKind } from "@/data/proposal";

export type LibraryItem = {
  id: string;
  kind: ProposalComponentKind;
  name: string;
  description?: string;
  photoMediaId?: string;
  price?: number;
  address?: string;
  phone?: string;
  notes?: string;
  /** The city or trip this is filed under — "Rome" — for grouping and search. */
  destination?: string;
  /**
   * Set when this was pulled from White Glove's own destination/kosher
   * database (lib/attraction-search.ts) rather than typed by hand — the
   * slug it came from, so the planner can tell a record backed by the
   * site's own listing from one they wrote themselves.
   *
   * A COPY, NEVER A LIVE LINK. Saved once, at the moment it was picked; the
   * site's own listing can change afterward without silently rewriting
   * something a planner already built a proposal around. If the source
   * listing improves, saving it again from search is how that's picked up
   * — the same way a proposal component is never re-fetched either.
   */
  sourceSlug?: string;
  savedAt: string;
  updatedAt: string;
};

export type LibraryPack = {
  id: string;
  /** "Rome Family Trip", "Rome Kosher/Shabbos Pack" — the planner's own name. */
  name: string;
  destination?: string;
  description?: string;
  photoMediaId?: string;
  /** References into the library's own items — not a copy of them, so
   *  editing an item updates every pack that uses it. */
  itemIds: string[];
  savedAt: string;
  updatedAt: string;
};

export function emptyLibraryItem(kind: ProposalComponentKind = "activity"): LibraryItem {
  const now = new Date().toISOString();
  return { id: "", kind, name: "", savedAt: now, updatedAt: now };
}

export function emptyLibraryPack(name: string): LibraryPack {
  const now = new Date().toISOString();
  return { id: "", name, itemIds: [], savedAt: now, updatedAt: now };
}

/** A saved item, turned into a fresh proposal component — the id is the
 *  caller's to mint, since the same item can be dropped onto more than one
 *  option, or more than once onto the same one. */
export function libraryItemToProposalComponent(item: LibraryItem, id: string): ProposalComponent {
  return {
    id,
    kind: item.kind,
    name: item.name,
    description: item.description,
    photoMediaId: item.photoMediaId,
    price: item.price,
    address: item.address,
    phone: item.phone,
    notes: item.notes,
  };
}

/** The items a pack actually resolves to right now — an item deleted after
 *  the pack was built just quietly drops out rather than leaving a hole. */
export function itemsInPack(pack: LibraryPack, items: LibraryItem[]): LibraryItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return pack.itemIds.map((id) => byId.get(id)).filter((i): i is LibraryItem => Boolean(i));
}

/**
 * A saved pack, dropped onto a trip — "Duplicate → Customize → Send".
 *
 * Every item lands as an UNSCHEDULED stop, the same convention
 * lib/trip-setup.ts's applyTemplate already uses for a destination outline:
 * a template is a starting point, never a plan for a day nobody chose. A
 * LibraryItem has no dates of its own — nothing here invents a check-in or a
 * flight time it does not have, which is also why a hotel or flight from the
 * pack lands as a stop to remember to book, labelled with its kind, rather
 * than a fabricated ItinLodging or ItinFlight neither of which this data
 * actually has enough to fill in for real.
 *
 * Additive and idempotent, the same three rules applyTemplate keeps: the
 * title is only set from the pack when the trip is still unnamed, nothing
 * already on the trip is touched, and applying the same pack twice does not
 * duplicate what it already added.
 */
export function applyLibraryPack(itin: Itinerary, pack: LibraryPack, items: LibraryItem[], uid: () => string): Itinerary {
  const named = itin.title && itin.title !== "My trip";
  const existing = new Set(itin.activities.map((activity) => activity.name.toLowerCase()));

  const added: ItinActivity[] = items
    .map((item) => ({ ...item, name: item.kind === "activity" ? item.name : `${PROPOSAL_COMPONENT_LABEL[item.kind]}: ${item.name}` }))
    // Applying the same pack twice should not double the list.
    .filter((item) => !existing.has(item.name.toLowerCase()))
    .map((item) => ({
      id: uid(),
      name: item.name,
      address: item.address,
      phone: item.phone,
      // Unscheduled on purpose — see the function note above.
      date: "",
      notes: [item.description, item.notes].filter(Boolean).join(" — ") || undefined,
    }));

  return {
    ...itin,
    title: named ? itin.title : pack.name,
    activities: [...itin.activities, ...added],
  };
}
