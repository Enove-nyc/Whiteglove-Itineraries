import type { MapKind } from "@/lib/map-markers";

/**
 * The logo mark as a map pin: a hand holding a compass, tinted in the kind's
 * colour.
 *
 * The markers used to be a simplified compass rose drawn in SVG. That kept the
 * colours clear at twenty-six pixels, but it was not the site's mark — the mark
 * is the glove with the compass in its palm.
 *
 * Kind is told by the colour of the mark itself (and by the legend and popup),
 * not by a ring or a disc around the pin. Every renderer paints the same line
 * art in `GLOVE_MARK_SRC` with the same `MAP_STYLE` colour: the legend chips
 * and the Leaflet markers mask it in CSS, and Google Maps — which will only
 * take an image URL — is handed that artwork tinted into a data URI
 * (lib/tinted-mark.ts). Nothing is baked ahead of time, so this table is the
 * only place a kind's colour is written and no two of them can disagree.
 */

export const MAP_STYLE: Record<MapKind, { color: string; label: string; /** Pin height in CSS pixels at full zoom. */ size: number }> = {
  // Deep and saturated, one hue apart. Line art has no fill to carry a pale
  // colour, so mid-tone gold and dusty purple washed out over light terrain and
  // stopped marking anything; these hold their own against a sunlit map.
  // FUNCTIONAL WAYFINDING COLOURS, NOT BRAND CHROME — kept out of the
  // Mushroom/Teal/Brass system so the kinds stay tellable apart at pin size. An
  // intentional, documented exception to the palette migration.
  center: { color: "#0d1f3d", label: "What you searched for", size: 44 },
  kever: { color: "#6d4a11", label: "Kevarim", size: 36 },
  attraction: { color: "#8e2c11", label: "Things to do", size: 36 },
  stay: { color: "#0d4c5e", label: "Places to stay", size: 36 },
  kosher: { color: "#125c37", label: "Kosher food", size: 34 },
  shul: { color: "#7a1f4b", label: "Shuls", size: 36 },
  airport: { color: "#4c2a7d", label: "Airports", size: 34 },
};

/**
 * The bare line-art mark, to be tinted per kind.
 *
 * One file, one path: the legend chips (components/CompassMark.tsx), the
 * Leaflet markers (through the `.wg-glove-mark` rule in globals.css) and the
 * Google markers (lib/tinted-mark.ts) all draw this, so the pins on the map and
 * the pins in the legend cannot come apart.
 */
export const GLOVE_MARK_SRC = "/map-glove-pin.png";

/** Intrinsic pixel size of the artwork in `GLOVE_MARK_SRC`. */
export const GLOVE_MARK_INTRINSIC = { width: 62, height: 96 };

/**
 * How big a pin should be at a given zoom.
 *
 * The map opens on everything, which at continent zoom is nearly three hundred
 * points inside a few hundred pixels. At full size they pile into a heap where
 * no individual place can be picked out — the pins stop being pins and become
 * texture. Shrinking them out there keeps the shape of where things ARE, which
 * is what that view is for, and they come up to full size as soon as somebody
 * zooms in far enough to want to press one.
 *
 * Google Maps uses roughly 4 for a continent, 7 for a country, and 11 for a
 * city.
 */
export function pinScale(zoom: number): number {
  if (zoom <= 5) return 0.5;
  if (zoom <= 7) return 0.7;
  if (zoom <= 9) return 0.85;
  return 1;
}

export type GlovePin = {
  /** The artwork every renderer starts from, before it is tinted. */
  url: string;
  /** Drawn width in CSS pixels. */
  width: number;
  /** Drawn height in CSS pixels. */
  height: number;
  /** Horizontal anchor from the left of the icon (tip of the cuff, centred). */
  anchorX: number;
  /** Vertical anchor from the top of the icon (tip of the cuff). */
  anchorY: number;
  color: string;
  label: string;
};

/**
 * The pin for one kind at the current zoom, whichever engine draws the map.
 *
 * The box is the shape of the artwork, so the mark fills it rather than sitting
 * letterboxed inside a wider frame, and the cuff is the tip that sits on the
 * coordinate — not the middle of the pin — so a place's marker reads as "here"
 * rather than floating above it.
 */
export function markPinFor(kind: MapKind, zoom = 11): GlovePin {
  const style = MAP_STYLE[kind];
  const height = Math.max(14, Math.round(style.size * pinScale(zoom)));
  const width = Math.max(10, Math.round((height * GLOVE_MARK_INTRINSIC.width) / GLOVE_MARK_INTRINSIC.height));
  return {
    url: GLOVE_MARK_SRC,
    width,
    height,
    anchorX: width / 2,
    // A hair above the very bottom, so anti-aliasing on the cuff tip does not
    // leave a gap between the pin and the map.
    anchorY: height * 0.97,
    color: style.color,
    label: style.label,
  };
}

/** The kinds a visitor can switch on and off, in the order they are offered. */
export const TOGGLEABLE_KINDS: MapKind[] = ["kever", "attraction", "stay", "kosher", "shul", "airport"];
