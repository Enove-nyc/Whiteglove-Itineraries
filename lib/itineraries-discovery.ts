import { BRAND_CONTACT_EMAIL, BRAND_NAME, BRAND_ORIGIN } from "@/lib/site-brand-core";

export const ITINERARIES_TITLE = "Your trip, together | White Glove Itineraries";
export const ITINERARIES_DESCRIPTION = "Build your itinerary, organise trip details and share the journey with White Glove Itineraries.";

/** Public product facts only; never read sessions, trip stores or customer documents. */
export function itinerariesStructuredData() {
  const origin = BRAND_ORIGIN.itineraries;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: BRAND_NAME.itineraries,
        url: `${origin}/`,
        email: BRAND_CONTACT_EMAIL.itineraries,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: BRAND_NAME.itineraries,
        url: `${origin}/`,
        description: ITINERARIES_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}
