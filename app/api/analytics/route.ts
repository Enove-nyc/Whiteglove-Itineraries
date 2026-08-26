import { NextRequest, NextResponse } from "next/server";
import { rateLimit, requesterKey } from "@/lib/rate-limit";
import { trackDestinationOpen, trackPageView, trackSearch, trackSearchSelection } from "@/lib/site-analytics";
import { recordPromotionEvent } from "@/lib/admin-content";

// Longest string this endpoint will record. A real page path, search term,
// slug or promotion id is well within this; anything longer is junk or abuse,
// so it is cut rather than stored whole.
const MAX_FIELD = 200;
const clip = (value?: string) => (typeof value === "string" ? value.slice(0, MAX_FIELD) : value);

export async function POST(request: NextRequest) {
  // Unauthenticated writes that feed the Featured ranking, so cap them per
  // caller — generously, since ordinary browsing sends many page views, but
  // not unbounded. A quiet 204 rather than a 429: analytics must never look
  // like an error to the page that fired it.
  const gate = await rateLimit(`analytics:${requesterKey(request.headers)}`, { limit: 600, windowSeconds: 60 * 60 });
  if (!gate.ok) return new NextResponse(null, { status: 204 });

  const raw = await request.json().catch(() => null) as {
    type?: string;
    value?: string;
    id?: string;
    found?: number;
    kind?: string;
    slug?: string;
  } | null;
  if (!raw) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const body = { ...raw, value: clip(raw.value), id: clip(raw.id), kind: clip(raw.kind), slug: clip(raw.slug) };
  if (body.type === "page_view" || body.type === "search") {
    if (typeof body.value !== "string") return NextResponse.json({ ok: false }, { status: 400 });
    if (body.type === "page_view") await trackPageView(body.value);
    // `found` is how many results the person was actually shown. A search that
    // showed none is recorded separately — it is somebody asking for something
    // this site has never heard of.
    else await trackSearch(body.value, typeof body.found === "number" ? body.found : undefined);
  }
  else if (body.type === "search_select") {
    // Kind only — never the query — so selected-result analytics carry no PII.
    if (typeof body.kind !== "string") return NextResponse.json({ ok: false }, { status: 400 });
    await trackSearchSelection(body.kind);
    // A destination selection also feeds the front page's Featured row.
    // `slug` is newer than this event: older clients send kind alone and are
    // still counted above — the day buckets simply learn nothing from them.
    // A slug is a published address, not a query, so recording it keeps the
    // no-PII rule this event was built on.
    if (body.kind === "Vacation destination" && typeof body.slug === "string") {
      await trackDestinationOpen(body.slug);
    }
  }
  else if (body.type === "destination_open") {
    // For opens that are not search selections — a Featured card, a hub card —
    // so the trailing-week row can learn from every front door, not only the
    // search bar.
    if (typeof body.slug !== "string") return NextResponse.json({ ok: false }, { status: 400 });
    await trackDestinationOpen(body.slug);
  }
  else if (body.type === "promotion_view" || body.type === "promotion_click") {
    if (!body.id) return NextResponse.json({ ok: false }, { status: 400 });
    await recordPromotionEvent(body.id, body.type === "promotion_view" ? "impression" : "click");
  }
  else return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true });
}
