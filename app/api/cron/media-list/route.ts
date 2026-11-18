import { NextRequest, NextResponse } from "next/server";
import { listDiskMediaIds } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * The file names on this host's disk, for the one-off move to Netlify
 * (AGENTS.md, 18 November 2026): the new host lists them here, then fetches
 * each through /api/media. Names only, a page at a time. Behind CRON_SECRET,
 * the same fail-closed rule as the other cron routes: not configured means
 * refused.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const after = request.nextUrl.searchParams.get("after") ?? "";
  const ids = await listDiskMediaIds(after, 200);
  return NextResponse.json({ ids, next: ids.length ? ids[ids.length - 1] : null });
}
