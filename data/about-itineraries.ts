import type { PageBlock } from "@/data/page-blocks";

export const ITINERARIES_ABOUT_BLOCKS: PageBlock[] = [
  {
    id: "about-development",
    kind: "text",
    heading: "In development — not open for business yet",
    body: "White Glove Itineraries is a company and platform in development. The full website is available as a preview so you can see the direction we are taking. We are not accepting purchases or subscriptions, and we have not announced an opening date.",
  },
  {
    id: "about-why",
    kind: "text",
    heading: "What we hope to change",
    body: "Planning a trip can leave flights, accommodation, activities, messages and documents spread across different places. Our ambition is to bring them into one connected experience for the people who plan a trip and the people who travel on it. We hope to make a meaningful step forward in how that work is organised.",
  },
  {
    id: "about-how",
    kind: "list",
    heading: "What we are planning to offer",
    items: [
      "An itinerary builder for organising flights, accommodation, transport, activities, dates and notes in one day-by-day plan.",
      "A companion app designed to put the itinerary, directions and saved travel documents on the traveller’s phone.",
      "Tools for advisers to manage client trips, share an itinerary, keep conversations with the right trip and present the work under their own brand.",
      "Ways to organise booking confirmations and keep important trip information together as plans change.",
    ],
  },
  {
    id: "about-paid",
    kind: "text",
    heading: "Plans and pricing are not open yet",
    body: "You are looking at a development preview, including example itineraries and app screens. These show the product we are working toward; they are not an offer of a service that is already open. Features, pricing and availability may change before launch.",
  },
  {
    id: "about-not",
    kind: "text",
    heading: "What we will not do",
    body: "White Glove Itineraries is being developed as a general travel itinerary and trip-management platform. We are building software for planning and carrying a trip; we are not offering a personal trip-planning or booking service.",
  },
];
