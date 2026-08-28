import type { PageBlock } from "@/data/page-blocks";

/**
 * The About page for the general-travel product, on the general-travel domain.
 *
 * WHAT WAS THERE INSTEAD. data/pages.ts holds one About page and both
 * deployments rendered it, so whitegloveitineraries.com — which sells trip
 * building to travel advisers and is explicitly not a kosher travel product —
 * introduced itself by explaining how to tell whether you can walk to a minyan
 * from a hotel on Shabbos, described a kosher food finder, and listed refusing
 * to give a hechsher among the things the business will not do. An adviser
 * reading it learned about a different company.
 *
 * NOTHING HERE IS NEW MARKETING. Every claim is one the product already makes
 * somewhere that is checked: the plans and their limits are lib/account-plans.ts
 * and lib/account-limits.ts, the free-and-paid split is /pricing, the
 * one-directional relationship with the kosher site is the settled architecture.
 * The shape is deliberately the kosher page's — why it exists, how it works,
 * how the business is paid, what it will not do — because that shape is the
 * decision worth keeping: an about page that says what it will not do is worth
 * more than one that only sells.
 *
 * AND IT NAMES NO PERSON, which is the same standing rule the other one keeps.
 * White Glove is not based anywhere; it is a website.
 *
 * The owner's own edit wins over all of this. app/about/page.tsx only reaches
 * for these blocks when he has not written the page himself.
 */
export const ITINERARIES_ABOUT_BLOCKS: PageBlock[] = [
  {
    id: "about-why",
    kind: "text",
    heading: "Why it exists",
    body:
      "A trip that has been properly planned arrives as a pile of confirmations in somebody's inbox. White Glove Itineraries is where that becomes one document: flights, hotels, transport, activities, documents, maps and times, in the order they happen, on the phone of the person travelling. It is built for the people who plan trips for other people, and it works the same way for somebody planning one trip of their own.",
  },
  {
    id: "about-how",
    kind: "list",
    heading: "How it works",
    items: [
      "You build the trip in the planner — days, flights, lodging, stops and notes — and it stays editable to the last minute.",
      "Driving times come from real routing rather than straight lines, because a plan built on straight lines falls apart on the second day.",
      "When it is ready you hand the traveller a link. It opens as an app on their phone: a day at a time, with the travel wallet kept for when there is no signal.",
      "Each trip has its own link, so a client sees their trip and no other, and cannot reach anybody else's.",
      "Travellers on the same trip see their own documents and notes. What one person is shown is not automatically what the next person is shown.",
    ],
  },
  {
    id: "about-paid",
    kind: "text",
    heading: "How the business is paid",
    body:
      "Directly, and the prices are on the pricing page rather than behind a call. One Trip is a single small fee for somebody planning one trip for themselves. Advisor Starter and Advisor Pro are monthly, for people running client trips, and add handing each client their own app — Pro puts the adviser's own name and logo on it in place of ours. There is no free tier that quietly stops working mid-trip, and nothing here is paid for by selling what is in anybody's itinerary.",
  },
  {
    id: "about-not",
    kind: "list",
    heading: "What we will not do",
    items: [
      "Book anything. This is where a trip is built and carried, not a travel agency — the arranging stays with you.",
      "Claim a rate is the lowest anywhere. We are not a comparison site and do not read the whole market.",
      "Sell what is in a trip. An itinerary holds somebody's dates, documents and movements, and it is not inventory.",
      "Show a client an adviser's private notes. Advisor-only information stays advisor-only, on the server rather than hidden in the page.",
    ],
  },
];
