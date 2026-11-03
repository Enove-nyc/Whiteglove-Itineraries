import type { PageBlock } from "@/data/page-blocks";

export const ITINERARIES_ABOUT_BLOCKS: PageBlock[] = [
  { id: "about-development", kind: "text", heading: "Your itinerary, together.", body: "White Glove Itineraries brings the details of a journey into one connected place for travellers and travel advisers." },
  { id: "about-why", kind: "text", heading: "Built around the whole journey", body: "Flights, accommodation, activities, documents and conversations belong with the trip. Keep them together from the first plan to the last day." },
  { id: "about-how", kind: "list", heading: "Plan, organise and travel", items: [
    "Build a day-by-day itinerary with flights, places to stay, transport, activities and notes.",
    "Keep the schedule, directions and travel documents together on the traveller’s phone.",
    "Manage client trips, share itineraries and keep conversations with the right journey.",
    "Organise booking confirmations and update the plan as details change.",
  ] },
  { id: "about-paid", kind: "text", heading: "Your White Glove account", body: "Log in to return to your saved trips. New accounts are available through an invitation from White Glove." },
  { id: "about-not", kind: "text", heading: "Travel software, for your plans", body: "White Glove Itineraries is a self-service itinerary and trip-management platform. You build and manage your trip; White Glove does not provide personal trip-planning or booking services." },
];
