import type { AccountPlan } from "@/lib/account-plans";
import { mayBrandOwnItinerary, mayServeCompanionClients } from "@/lib/account-limits";

/**
 * Where an account can go, as data — deliberately not in a component file.
 *
 * THIS LIVED IN components/AccountMenu.tsx AND TOOK /advisor DOWN WITH IT.
 * That file is "use client", and Next turns every export of a client module
 * into a client reference: importing one on the server gives you a marker
 * object, not the function. app/advisor/page.tsx is a server component and
 * called `advisorPlacesFor(plan)`, so the page threw on every request —
 *
 *   Attempted to call advisorPlacesFor() from the server but
 *   advisorPlacesFor is on the client.
 *
 * — and the advisor's own dashboard served the error page to anybody who had
 * paid for it. Nothing about the function was ever client-only: no hooks, no
 * browser, just a plan and a filter. It was in that file because that is where
 * the menu using it happened to be.
 *
 * The build does not catch this. It is a runtime error on render, and the page
 * is behind a login, so nothing that runs without an account will see it.
 * tests/server-client-boundary.test.ts is what catches it now.
 */

export const ACCOUNT_PLACES = [
  { label: "Itineraries", href: "/itinerary" },
  { label: "Routes", href: "/my-route" },
  { label: "Favorites", href: "/account#account-favorites" },
  { label: "My info", href: "/account" },
] as const;

/**
 * The advisor tools — Pipeline, Proposal, Library, Forms, Payments, Agency —
 * had no home in navigation anywhere: a Starter or Pro advisor reached them
 * only by remembering the address or scrolling a long paragraph on /account.
 * Named here, gated by the same lib/account-limits functions the pages
 * themselves check, so this list can never offer a door a plan doesn't open.
 */
const ADVISOR_PLACES = [
  { label: "Dashboard", href: "/advisor", need: "clients" },
  { label: "Messages", href: "/app?screen=messages", need: "clients" },
  { label: "Trip pipeline", href: "/pipeline", need: "clients" },
  { label: "Proposals", href: "/proposal", need: "clients" },
  { label: "Content library", href: "/library", need: "clients" },
  { label: "Client forms", href: "/forms", need: "clients" },
  { label: "Payments", href: "/payments", need: "clients" },
  { label: "Group trip", href: "/group", need: "clients" },
  { label: "Agency", href: "/agency", need: "brand" },
] as const;

export function advisorPlacesFor(plan: AccountPlan | undefined) {
  if (!plan) return [];
  const clients = mayServeCompanionClients(plan);
  const brand = mayBrandOwnItinerary(plan);
  return ADVISOR_PLACES.filter((place) => (place.need === "brand" ? brand : clients));
}

/**
 * THE SCREENS THAT ARE ABOUT ONE TRIP, as opposed to the tools above.
 *
 * The advisor's work on a trip is spread across separate top-level pages —
 * /itinerary, /proposal, /addons, /forms, /payments, /group — and each of them
 * is a standalone screen that operates on whichever trip is currently open on
 * the account. There was nothing anywhere saying WHICH trip that is, and no way
 * to get from Payments to Proposals except back out through the global menu.
 *
 * So an advisor with twenty clients, halfway through the Harpers' Rome trip,
 * had to hold "the open trip is the Harpers" in their head across every screen
 * — and the one screen that names a trip, the pipeline, is the one they had to
 * leave to get anywhere.
 *
 * Split out from ADVISOR_PLACES rather than duplicated: Pipeline, Library and
 * Agency are tools that span every trip and have no business in a bar about
 * one, while /addons is trip work that was in no menu at all — reachable only
 * by typing the address. Labels are the ones already in use above, so nothing
 * here gains a second name.
 */
export const TRIP_PLACES = [
  // Open to any signed-in account, unlike the five below it — a traveller
  // planning their own trip has an itinerary and no clients.
  { label: "Itinerary", href: "/itinerary", need: "any" },
  { label: "Proposals", href: "/proposal", need: "clients" },
  { label: "Extras", href: "/addons", need: "clients" },
  { label: "Client forms", href: "/forms", need: "clients" },
  { label: "Payments", href: "/payments", need: "clients" },
  { label: "Group trip", href: "/group", need: "clients" },
] as const;

export type TripPlace = (typeof TRIP_PLACES)[number];

/**
 * The trip screens this plan can actually open.
 *
 * Gated by the same lib/account-limits function the pages themselves check, so
 * the bar can never offer a door the plan does not open — the same rule
 * advisorPlacesFor follows, for the same reason.
 */
export function tripPlacesFor(plan: AccountPlan | undefined): TripPlace[] {
  if (!plan) return [];
  const clients = mayServeCompanionClients(plan);
  return TRIP_PLACES.filter((place) => place.need === "any" || clients);
}
