import { NextRequest, NextResponse } from "next/server";
import { isCuratedKosherPlaceId } from "@/lib/curated-kosher";
import { hechsherimFor, listAgencies } from "@/lib/hechsher-store";

export const dynamic = "force-dynamic";

// What the owner has confirmed about these places' hechsherim.
//
// Only White Glove's curated listing ids are accepted. This endpoint never
// exposes statuses for third-party map or candidate data.
/** The same answer for either verb: only curated ids, at most 200 of them. */
async function answer(candidates: string[]) {
  const ids = candidates
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(isCuratedKosherPlaceId)
    .slice(0, 200);
  const [hechsherim, agencies] = await Promise.all([hechsherimFor(ids), listAgencies()]);
  return NextResponse.json({ hechsherim, agencies });
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  return answer(raw.split(","));
}

/**
 * The ids in the body, because a query string has a size limit and a busy
 * destination's list of kosher places went past it — the server returned 431
 * and every badge on the page stayed unverified. Nothing is written here, so
 * this needs no origin check; it is a read that happens to be too long for
 * a URL.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
  return answer(ids);
}
