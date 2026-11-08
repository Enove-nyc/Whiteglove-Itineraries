import { NextRequest, NextResponse } from "next/server";
import { getPublicPromotionSlots } from "@/lib/public-promotions";

export const dynamic = "force-dynamic";

// Public endpoint the site-wide promotion renderer calls with the current path.
// Returns the top-priority active promotion for each globally-rendered
// placement (thin top banner, entry popup, sticky bottom banner). Fails safe:
// returns nulls when the content store isn't configured.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") || "/";
  const userAgent = request.headers.get("user-agent") || "";
  const device = /Mobi|Android/i.test(userAgent) ? "mobile" : "desktop";

  try {
    return NextResponse.json(await getPublicPromotionSlots(path, device));
  } catch {
    return NextResponse.json({ topBanner: null, popup: null, bottomBanner: null });
  }
}
