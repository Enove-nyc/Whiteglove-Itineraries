import type { PageBlock } from "@/data/page-blocks";

export const ITINERARIES_ABOUT_BLOCKS: PageBlock[] = [
  {
    id: "about-development",
    kind: "text",
    heading: "In development · Preparing for launch",
    body: "White Glove Itineraries is a company in development. We look forward to welcoming you soon. We are preparing for launch and are not open for business yet.",
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
    body: "Purchases and subscriptions are not yet available. We will share our launch plans, available features and pricing when they are ready.",
  },
  {
    id: "about-not",
    kind: "text",
    heading: "What we will not do",
    body: "White Glove Itineraries is being developed as a general travel itinerary and trip-management platform. We are building software for planning and carrying a trip; we are not offering a personal trip-planning or booking service.",
  },
];

