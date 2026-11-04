import type { MetadataRoute } from "next";
import { currentBrand } from "@/lib/site-brand";

// Web app manifest — makes the site installable as an app (and Play Store-ready
// once wrapped as a Trusted Web Activity).
//
// BRAND-AWARE, so the two domains install as themselves: whitegloveitineraries.com
// adds to a home screen as "White Glove Itineraries", whiteglovekoshertravel.com
// as "White Glove Kosher Travel". Reading the request's brand (its Host, or the
// proxy header the itineraries domain arrives with) is a request-time API, which
// Next treats as opting this route out of static caching — which is exactly
// right, because the answer depends on which door the request came through.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await currentBrand();
  const itineraries = brand === "itineraries";
  return {
    name: itineraries ? "White Glove Itineraries" : "White Glove Kosher Travel",
    short_name: "White Glove",
    description: itineraries
      ? "Your itinerary, private travel wallet and trip group chat, ready for travel."
      : "Thoughtfully planned kosher travel and Jewish heritage journeys — kevarim, kosher food, minyanim, and trip planning.",
    // The itineraries app is the planner app, not the marketing site, so it
    // launches straight into /app; the kosher app is the whole site and opens
    // at the root. A rebuilt TWA bakes this in as its launch URL, which is the
    // reliable way to land on /app — the middleware redirect only fires when
    // the app announces itself with a header newer Chrome versions may drop.
    start_url: itineraries ? "/app" : "/",
    display: "standalone",
    background_color: "#102F35",
    theme_color: "#102F35",
    orientation: "portrait",
    categories: ["travel", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
