/** Geographic names shared by search and directory filters; no network or data-store reads. */
export function geographicKey(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/þ/g, "th").replace(/ð/g, "d").replace(/ł/g, "l").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, " ").trim();
}

const COUNTRIES: Record<string, readonly string[]> = {
  "United States": ["USA", "US", "U.S.A.", "United States of America"],
  "United Kingdom": ["UK", "U.K.", "Britain", "Great Britain"],
  Czechia: ["Czech Republic"],
  "United Arab Emirates": ["UAE", "U.A.E."],
  Turkey: ["Türkiye", "Turkiye"],
  "South Korea": ["Republic of Korea", "Korea"],
  Netherlands: ["Holland"],
};

const canonicalByAlias = new Map(Object.entries(COUNTRIES).flatMap(([name, aliases]) => [name, ...aliases].map((alias) => [geographicKey(alias), name])));

export function canonicalCountry(country: string): string {
  return canonicalByAlias.get(geographicKey(country)) ?? country;
}

const CITY_NAMES: Record<string, readonly string[]> = {
  Rome: ["Roma"], Prague: ["Praha"], Vienna: ["Wien"], Florence: ["Firenze"], Venice: ["Venezia"],
  Munich: ["München", "Munchen"], Cologne: ["Köln", "Koln"], Zurich: ["Zürich", "Zuerich"], Lucerne: ["Luzern"],
  "New York": ["New York City", "NYC"], "New York City": ["New York", "NYC"], "Kraków": ["Krakow", "Cracow"], Krakow: ["Kraków", "Cracow"],
};

export function cityNames(city: string): string[] { return [city, ...(CITY_NAMES[city] ?? [])]; }

export function geographicTerms(city: string, country: string): string[] {
  const canonical = canonicalCountry(country);
  return [...cityNames(city), canonical, ...(COUNTRIES[canonical] ?? [])];
}

export function sameCountry(a: string, b: string): boolean {
  return geographicKey(canonicalCountry(a)) === geographicKey(canonicalCountry(b));
}
