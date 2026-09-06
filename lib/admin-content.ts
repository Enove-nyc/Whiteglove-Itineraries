import { cemeteries } from "@/data/cemeteries";
import { guidedDestinations, unguidedDestinations } from "@/data/destinations";
import type { DirectoryDraft } from "@/lib/directory-fields";
import { applyReview, type ReviewInput } from "@/lib/suggestions";
import { remember } from "@/lib/recycle-store";
import { heritageTownHref } from "@/lib/route-migration";

type RedisResult<T> = { result?: T };

export type SiteSettings = {
  heroTitle: string;
  heroSubtitle: string;
  searchPlaceholder: string;
  publicNotice: string;
  footerEmail: string;
  bookingNotice: string;
};

export type EditableLocation = {
  id: string;
  route: string;
  title: string;
  yiddishTitle: string;
  category: "city-guide" | "destination" | "cemetery";
  country: string;
  address: string;
  coordinates: string;
  shomerContact: string;
  source: string;
  notes: string;
  status: "published" | "draft" | "needs-review";
  lastVerified: string;
};

export type EditableAccommodation = {
  id: string;
  locationId: string;
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  bookingLink: string;
  amenities: string;
  kosherInfo: string;
  notes: string;
  status: "published" | "draft" | "needs-review";
  lastVerified: string;
};

export type SuggestionStatus = "pending" | "approved" | "rejected" | "needs-info";

/**
 * One decision, kept forever.
 *
 * Changing your mind about a correction is normal — a phone number that looked
 * wrong turns out to be right, or the other way round. The first answer is
 * part of the record rather than a mistake to be overwritten, which is what
 * §8's "history" asks for.
 */
export type SuggestionReview = {
  at: string;
  status: SuggestionStatus;
  notes: string;
  /** The wording accepted, when the reviewer edited before approving. */
  accepted?: string;
};

/**
 * A place a traveller sent in from their own itinerary — the fields lifted out
 * of the trip in lib/place-offers.ts, carried structured so the review card can
 * show them field by field and accepting can write a real listing from them
 * rather than the owner retyping a paragraph. Present only on `targetType:
 * "new"` submissions that came from the planner "send it in" path.
 */
export type SubmittedPlace = {
  kind: "stop" | "stay";
  name: string;
  address?: string;
  coordinates?: string;
  country?: string;
  /** A link they put on it — a map, the place's own site. */
  href?: string;
  phone?: string;
};

export type EditSuggestion = {
  id: string;
  targetType: "location" | "accommodation" | "site" | "directory" | "new";
  targetId: string;
  title: string;
  name: string;
  email: string;
  issue: string;
  currentInfo: string;
  suggestedInfo: string;
  source: string;
  status: SuggestionStatus;
  createdAt: string;
  /** The latest decision. `history` has all of them. */
  reviewedAt?: string;
  reviewerNotes?: string;
  /**
   * The correction as it was accepted, when the reviewer changed the wording
   * before approving it. `suggestedInfo` keeps the visitor's own words.
   */
  acceptedInfo?: string;
  history?: SuggestionReview[];
  /**
   * A directory listing filled in on the same form the owner uses, field by
   * field, rather than described in a paragraph. Present only for directory
   * submissions; when it is there, accepting can write the listing instead of
   * the owner retyping it.
   */
  draft?: DirectoryDraft;
  /**
   * A place lifted from a traveller's itinerary and sent in. Present only for
   * planner "send it in" submissions; when it is here, accepting publishes it
   * as a listing (see publishSubmittedPlace) instead of only filing the note.
   */
  place?: SubmittedPlace;
  /** Consent the submitter gave for their own number, if they gave any. */
  contactConsent?: boolean;
  contactConsentNote?: string;
};

export type PromotionPlacement =
  | "popup"
  | "fixed-top-banner"
  | "sticky-bottom-banner"
  | "homepage-promo"
  | "inline-content"
  | "sidebar"
  | "destination-specific"
  | "accommodation-page"
  | "sponsored-listing"
  | "itinerary-footer"
  | "full-page-takeover";

export type PromotionDevice = "all" | "mobile" | "desktop";

export type Promotion = {
  id: string;
  title: string;
  description: string;
  buttonText: string;
  targetHref: string;
  imageUrl: string;
  pdfUrl: string;
  /** A video to play instead of the picture. Takes precedence when both are set. */
  videoUrl: string;
  /**
   * Who the advertisement is for.
   *
   * An advert used to carry nothing about whose it was — a title, a picture
   * and placements, and no way to look at a live one and know who to ring when
   * it needed changing. Never shown to a visitor; this is the owner's record.
   */
  advertiserName: string;
  advertiserPhone: string;
  advertiserEmail: string;
  placements: PromotionPlacement[];
  targetPaths: string;
  device: PromotionDevice;
  startDate: string;
  endDate: string;
  priority: number;
  maxViewsPerVisitor: number;
  enabled: boolean;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
  lastShownAt?: string;
  lastClickedAt?: string;
};

export type AdminContentBundle = {
  settings: SiteSettings;
  locations: EditableLocation[];
  accommodations: EditableAccommodation[];
  suggestions: EditSuggestion[];
  promotions: Promotion[];
  updatedAt?: string;
};

const contentKey = "white-glove:content";

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/**
 * A value goes in the request body, never in the address.
 *
 * This used to put the whole bundle in the URL — `set/<key>/<the entire
 * encoded content store>`. With every location seeded that address is over
 * 300,000 characters, which no HTTP server accepts: measured against a stock
 * Node server it is refused outright, and the save reports "connect the
 * private database" as though nothing were configured. Reads stay on GET,
 * where the address is only the key.
 *
 * The same shape lib/hechsher-store.ts and lib/media.ts already use.
 */
/**
 * Configured, but the store could not be reached at all.
 *
 * Told apart from "there is nothing there" ON PURPOSE, and the distinction is
 * the whole point of it. Every save in this file reads the bundle, changes one
 * thing and writes the whole thing back — so a read that quietly returned
 * "empty" during a blip, followed by a write that succeeded, would replace
 * every location, every listing and every advert with nothing. A hard failure
 * was protecting against that by accident; this protects against it on purpose.
 */
const UNREACHABLE = Symbol("the content store could not be reached");

async function redis<T>(command: string, body?: string): Promise<RedisResult<T> | undefined | typeof UNREACHABLE> {
  const config = redisConfig();
  if (!config) return undefined;
  try {
    const response = await fetch(`${config.url}/${command}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body,
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    return (await response.json()) as RedisResult<T>;
  } catch {
    // A network failure used to come straight out of here and out of the page
    // that asked. The front page and the route planner both returned a 500
    // when this store had a blip — because of an advert. See readBundle.
    return UNREACHABLE;
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function defaultSettings(): SiteSettings {
  return {
    heroTitle: "Every Journey Begins with Purpose.",
    heroSubtitle: "A trusted guide for meaningful journeys: tefillos, kosher food, minyanim, mikvaos, local contacts, and every practical detail around your visit.",
    searchPlaceholder: "Search a city, tzaddik, or country...",
    publicNotice: "Travel and access information is checked before publication.",
    footerEmail: "whitegloveitineraries@gmail.com",
    bookingNotice: "Live travel tools remain linked to the owner dashboard and can be refined here.",
  };
}

function defaultLocations(): EditableLocation[] {
  const guideLocations = guidedDestinations().map((guide) => ({
    id: `guide-${guide.slug}`,
    route: `/${guide.slug}`,
    title: guide.city,
    yiddishTitle: guide.yiddishCity,
    category: "city-guide" as const,
    country: guide.country,
    address: guide.guide.graveAddress ?? guide.city,
    coordinates: guide.guide.graveCoordinates ?? "",
    shomerContact: guide.guide.accessContacts?.[0]?.phone ?? guide.guide.accessContact?.phone ?? "",
    source: guide.guide.sourceUrl,
    notes: guide.guide.overview,
    status: "needs-review" as const,
    lastVerified: "",
  }));
  // Not a sample. These lists are what the "missing address / missing shomer"
  // counts are computed from, so truncating them made the report quietly
  // describe the first twenty of each rather than the site: 156 batei hachaim
  // were on the page and 20 of them were being counted, which is why the
  // missing-shomer figure read far lower than the real one.
  const destinationLocations = unguidedDestinations().map((destination) => ({
    id: `destination-${destination.slug}`,
    route: heritageTownHref(destination.slug),
    title: destination.city,
    yiddishTitle: destination.yiddishCity,
    category: "destination" as const,
    country: destination.country,
    address: destination.summary ?? "",
    coordinates: "",
    shomerContact: "",
    source: `seed:${destination.slug}`,
    notes: destination.summary ?? "",
    status: "draft" as const,
    lastVerified: "",
  }));
  const cemeteryLocations = cemeteries.map((cemetery) => ({
    id: `cemetery-${cemetery.slug}`,
    route: `/cemeteries/${cemetery.slug}`,
    title: cemetery.name,
    yiddishTitle: cemetery.yiddishName,
    category: "cemetery" as const,
    country: cemetery.country,
    address: cemetery.address,
    coordinates: cemetery.coordinates ?? "",
    shomerContact: cemetery.accessContacts?.[0]?.phone ?? "",
    source: cemetery.sourceUrl,
    // All of them, joined. This took the first note and dropped the rest, so
    // the owner's own location list hid the same lines the public card did.
    notes: cemetery.arrivalNotes.join(" · "),
    status: cemetery.accessContacts?.length ? ("published" as const) : ("needs-review" as const),
    lastVerified: "",
  }));
  return [...guideLocations, ...destinationLocations, ...cemeteryLocations];
}

// No seeded default any more — the one that shipped here promoted personal
// trip planning, which is removed from the site rather than merely demoted.
// A promotion is now something the owner writes from a blank one, not a
// sample he has to notice and turn off.
function defaultPromotions(): Promotion[] {
  return [];
}

/**
 * A new advertisement, before anybody has typed anything into it.
 *
 * IT LIVES HERE RATHER THAN IN THE SCREEN THAT USES IT, and that is the whole
 * point. `enabled: false` is the commitment that nothing goes live the moment
 * it is created — Draft, Preview, Publish — and a rule that lives inside one
 * component is a rule the second creation path will not have. It is asserted
 * in tests/advertising-boundary.test.ts against this function, so any screen
 * that builds its own blank has to answer for the difference.
 *
 * The counters start at zero for the same reason a duplicate resets them: an
 * inherited impression count is a number nobody measured.
 */
export function blankPromotion(now = new Date().toISOString()): Promotion {
  return {
    id: "",
    title: "",
    description: "",
    buttonText: "Learn more",
    targetHref: "/",
    imageUrl: "",
    pdfUrl: "",
    videoUrl: "",
    advertiserName: "",
    advertiserPhone: "",
    advertiserEmail: "",
    placements: ["fixed-top-banner"],
    targetPaths: "",
    device: "all",
    startDate: "",
    endDate: "",
    priority: 0,
    maxViewsPerVisitor: 0,
    enabled: false,
    impressions: 0,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };
}

const defaultBundle = (): AdminContentBundle => ({
  settings: defaultSettings(),
  locations: defaultLocations(),
  accommodations: [],
  suggestions: [],
  promotions: defaultPromotions(),
  updatedAt: new Date().toISOString(),
});

function parseBundle(value?: string): AdminContentBundle {
  if (!value) return defaultBundle();
  try {
    const parsed = JSON.parse(value) as AdminContentBundle;
    return {
      settings: parsed.settings ?? defaultSettings(),
      locations: Array.isArray(parsed.locations) ? parsed.locations : defaultLocations(),
      accommodations: Array.isArray(parsed.accommodations) ? parsed.accommodations : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      promotions: Array.isArray(parsed.promotions) ? parsed.promotions : defaultPromotions(),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return defaultBundle();
  }
}

/**
 * The bundle, for anything that is going to SHOW it.
 *
 * An unreachable store reads as the built-in defaults, which for a visitor
 * means no advert and nothing promoted. That is the right way for this to
 * fail: an advert that does not appear is a great deal better than a front
 * page that does not appear.
 *
 * NEVER USE THIS FOR A SAVE. See bundleToModify.
 */
async function readBundle() {
  const response = await redis<string>(`get/${encodeURIComponent(contentKey)}`);
  return parseBundle(response === UNREACHABLE ? undefined : response?.result);
}

/**
 * The bundle, for anything that is going to WRITE IT BACK, or null.
 *
 * Null means the store could not be read — and a save must stop there. Every
 * save in this file is read-modify-write over one big value, so writing on top
 * of a bundle that was never actually read would replace the whole content
 * store with defaults. Losing an edit to a blip is a nuisance; losing three
 * hundred locations to one is not.
 */
async function bundleToModify(): Promise<AdminContentBundle | null> {
  const response = await redis<string>(`get/${encodeURIComponent(contentKey)}`);
  if (response === UNREACHABLE) return null;
  return parseBundle(response?.result);
}

async function writeBundle(bundle: AdminContentBundle) {
  const payload = JSON.stringify({ ...bundle, updatedAt: new Date().toISOString() });
  const response = await redis(`set/${encodeURIComponent(contentKey)}`, payload);
  return response !== undefined && response !== UNREACHABLE;
}

export function contentStorageIsConfigured() {
  return Boolean(redisConfig());
}

export async function getAdminContent() {
  const bundle = await readBundle();
  // When this list was read. "Waiting three weeks" is measured from here, so
  // the moment belongs with the data it describes rather than being taken
  // again while a screen renders, where it would be a different number every
  // time the screen happened to re-render.
  return { configured: contentStorageIsConfigured(), bundle, readAt: Date.now() };
}

export async function saveSiteSettings(settings: Partial<SiteSettings>) {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  return writeBundle({ ...bundle, settings: { ...bundle.settings, ...settings } });
}

export async function upsertLocation(location: EditableLocation) {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  const next = bundle.locations.filter((item) => item.id !== location.id).concat({ ...location });
  return writeBundle({ ...bundle, locations: next });
}

export async function upsertAccommodation(accommodation: EditableAccommodation) {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  const next = bundle.accommodations.filter((item) => item.id !== accommodation.id).concat({ ...accommodation });
  return writeBundle({ ...bundle, accommodations: next });
}

export async function upsertLocations(locations: EditableLocation[]) {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  const incoming = locations.filter((location) => location.id.trim() && location.title.trim());
  const map = new Map(bundle.locations.map((item) => [item.id, item]));
  for (const location of incoming) {
    map.set(location.id, { ...location });
  }
  return writeBundle({ ...bundle, locations: [...map.values()] });
}

function placementLabels() {
  return new Map<PromotionPlacement, string>([
    ["popup", "Popup"],
    ["fixed-top-banner", "Fixed top banner"],
    ["sticky-bottom-banner", "Sticky bottom banner"],
    ["homepage-promo", "Homepage promotion"],
    ["inline-content", "Inline content"],
    ["sidebar", "Sidebar"],
    ["destination-specific", "Destination page"],
    ["accommodation-page", "Accommodation page"],
    ["sponsored-listing", "Sponsored listing"],
    ["itinerary-footer", "Bottom of the itinerary"],
    ["full-page-takeover", "Full-page takeover"],
  ]);
}

function normalizePromotion(promotion: Promotion): Promotion {
  return {
    ...promotion,
    id: promotion.id.trim() || `promotion-${Date.now()}`,
    title: promotion.title.trim(),
    description: promotion.description.trim(),
    buttonText: promotion.buttonText.trim() || "Learn more",
    targetHref: promotion.targetHref.trim() || "/",
    imageUrl: promotion.imageUrl.trim(),
    pdfUrl: promotion.pdfUrl.trim(),
    videoUrl: (promotion.videoUrl ?? "").trim(),
    advertiserName: (promotion.advertiserName ?? "").trim(),
    advertiserPhone: (promotion.advertiserPhone ?? "").trim(),
    advertiserEmail: (promotion.advertiserEmail ?? "").trim(),
    placements: Array.isArray(promotion.placements) ? promotion.placements.filter((placement): placement is PromotionPlacement => placementLabels().has(placement)) : ["homepage-promo"],
    targetPaths: promotion.targetPaths.trim(),
    device: promotion.device === "mobile" || promotion.device === "desktop" ? promotion.device : "all",
    startDate: promotion.startDate.trim(),
    endDate: promotion.endDate.trim(),
    priority: Number.isFinite(Number(promotion.priority)) ? Number(promotion.priority) : 0,
    maxViewsPerVisitor: Math.max(0, Number(promotion.maxViewsPerVisitor) || 0),
    enabled: Boolean(promotion.enabled),
    impressions: Math.max(0, Number(promotion.impressions) || 0),
    clicks: Math.max(0, Number(promotion.clicks) || 0),
    createdAt: promotion.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastShownAt: promotion.lastShownAt,
    lastClickedAt: promotion.lastClickedAt,
  };
}

function parsePromotionTargets(targetPaths: string) {
  return targetPaths
    .split(/\r?\n|,/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function matchesPromotionPath(promotion: Promotion, pathname: string) {
  const targets = parsePromotionTargets(promotion.targetPaths);
  if (targets.length === 0 || targets.includes("*")) return true;
  return targets.some((target) => pathname === target || pathname.startsWith(target.endsWith("/") ? target : `${target}/`));
}

function matchesPromotionDevice(promotion: Promotion, device: PromotionDevice) {
  return promotion.device === "all" || promotion.device === device;
}

function isPromotionActive(promotion: Promotion) {
  const now = new Date();
  if (promotion.startDate) {
    const start = new Date(promotion.startDate);
    if (Number.isFinite(start.getTime()) && start > now) return false;
  }
  if (promotion.endDate) {
    const end = new Date(promotion.endDate);
    if (Number.isFinite(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (end < now) return false;
    }
  }
  return true;
}

export async function upsertPromotion(promotion: Promotion) {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  const nextPromotion = normalizePromotion(promotion);
  const promotions = bundle.promotions.filter((item) => item.id !== nextPromotion.id).concat(nextPromotion);
  return writeBundle({ ...bundle, promotions });
}

export async function recordPromotionEvent(id: string, kind: "impression" | "click") {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  const promotions = bundle.promotions.map((item) => {
    if (item.id !== id) return item;
    if (kind === "impression") {
      return { ...item, impressions: item.impressions + 1, lastShownAt: new Date().toISOString() };
    }
    return { ...item, clicks: item.clicks + 1, lastClickedAt: new Date().toISOString() };
  });
  return writeBundle({ ...bundle, promotions });
}

/** Remove an advertisement for good. */
export async function deletePromotion(id: string) {
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  if (!bundle) return null;
  // Kept for a month, the same as every other deletion. An advertisement is an
  // arrangement with somebody — its dates, its placements and its numbers should
  // not vanish because a row was tidied away.
  const gone = bundle.promotions.find((p) => p.id === id);
  if (gone) {
    await remember({
      kind: "advertisement",
      rowId: id,
      title: gone.title,
      detail: [gone.advertiserName, gone.startDate && gone.endDate ? `${gone.startDate} – ${gone.endDate}` : null]
        .filter(Boolean)
        .join(" · ") || undefined,
      payload: gone as unknown as Record<string, unknown>,
    });
  }
  return writeBundle({ ...bundle, promotions: bundle.promotions.filter((p) => p.id !== id) });
}

/**
 * Put a deleted advertisement back, exactly as it was.
 *
 * Refuses rather than duplicating: an advertisement restored while one with
 * the same id is already there would show as two on the page.
 */
export async function restorePromotion(promotion: Promotion): Promise<{ ok: boolean; message: string }> {
  const bundle = await bundleToModify();
  // The store could not be read. Writing on top of a bundle that was never
  // read would replace the whole content store with defaults.
  if (!bundle) return { ok: false, message: "The private store could not be reached, so it cannot go back yet. Nothing was changed." };
  if (bundle.promotions.some((p) => p.id === promotion.id)) {
    return { ok: false, message: `${promotion.title} is already there.` };
  }
  await writeBundle({ ...bundle, promotions: [...bundle.promotions, promotion] });
  return { ok: true, message: `${promotion.title} is back.` };
}

export async function getActivePromotions(placement: PromotionPlacement, pathname: string, device: PromotionDevice) {
  const bundle = await readBundle();
  return bundle.promotions
    .filter((promotion) => promotion.enabled)
    .filter((promotion) => promotion.placements.includes(placement))
    .filter((promotion) => matchesPromotionDevice(promotion, device))
    .filter((promotion) => matchesPromotionPath(promotion, pathname))
    .filter(isPromotionActive)
    .sort((left, right) => right.priority - left.priority || right.updatedAt.localeCompare(left.updatedAt));
}

export async function getPromotionsDashboard() {
  const bundle = await readBundle();
  const byPlacement = [...placementLabels().entries()].map(([placement, label]) => ({
    label,
    count: bundle.promotions.filter((item) => item.enabled && item.placements.includes(placement)).length,
  }));
  return {
    configured: contentStorageIsConfigured(),
    totalPromotions: bundle.promotions.length,
    enabledPromotions: bundle.promotions.filter((item) => item.enabled).length,
    totalImpressions: bundle.promotions.reduce((total, item) => total + item.impressions, 0),
    totalClicks: bundle.promotions.reduce((total, item) => total + item.clicks, 0),
    byPlacement,
  };
}

export async function addSuggestion(suggestion: Omit<EditSuggestion, "id" | "status" | "createdAt">) {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults.
  if (!bundle) return false;
  const next: EditSuggestion = {
    ...suggestion,
    id: `suggestion-${slugify(`${suggestion.targetType}-${suggestion.targetId}-${suggestion.name}-${Date.now()}`)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  return writeBundle({ ...bundle, suggestions: [next, ...bundle.suggestions] });
}

/**
 * Record a decision on a suggestion.
 *
 * Returns `false` when there is nothing to write to, and `"missing"` when the
 * suggestion is not there — a decision on a suggestion that has gone used to
 * report success, having changed nothing at all.
 */
export async function reviewSuggestion(id: string, input: ReviewInput): Promise<boolean | "missing"> {
  if (!contentStorageIsConfigured()) return false;
  const bundle = await bundleToModify();
  // The store could not be read. Writing now would replace it with defaults —
  // and "missing" would tell somebody their suggestion had been deleted, which
  // is not what happened.
  if (!bundle) return false;
  if (!bundle.suggestions.some((item) => item.id === id)) return "missing";
  const at = new Date().toISOString();
  const suggestions = bundle.suggestions.map((item) => (item.id === id ? applyReview(item, input, at) : item));
  return writeBundle({ ...bundle, suggestions });
}

export function getMissingContentReport(bundle: AdminContentBundle) {
  return {
    locationsMissingAddress: bundle.locations.filter((item) => !item.address.trim()).length,
    locationsMissingCoordinates: bundle.locations.filter((item) => !item.coordinates.trim()).length,
    locationsMissingShomer: bundle.locations.filter((item) => !item.shomerContact.trim()).length,
    accommodationsMissing: bundle.accommodations.filter((item) => !item.address.trim() || !item.name.trim()).length,
    pendingSuggestions: bundle.suggestions.filter((item) => item.status === "pending").length,
  };
}

export { slugify };
