import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, getCurrentAccountData } from "@/lib/account-store";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/secure-access";
import { extractSmartImport } from "@/lib/smart-import";
import { IMPORT_TYPES, readImportDataUrl } from "@/data/smart-import-files";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// What may be attached, and how big, lives in data/smart-import-files.ts so
// the rule can be tested without a request and so the panel and the route
// cannot drift apart about what the file picker offers.

/**
 * Smart Import: paste a confirmation, or attach one — the airline's PDF, a
 * screenshot of a booking app, a photo of a printed voucher — and get back the
 * flights/hotel/stop rows it describes. A PREVIEW only, never written to a
 * trip by this route. The planner reviews it in
 * components/SmartImportPanel.tsx and the itinerary builder adds only what
 * they keep, the same way any other row is added.
 *
 * Open to any signed-in account, same as /api/account/itinerary itself —
 * Smart Import speeds up building AN itinerary, which is not a Business-only
 * feature. Rate-limited rather than plan-gated, since what it actually costs
 * is a paid AI call.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }
  const cookieStore = await cookies();
  const account = await getCurrentAccountData(cookieStore.get(accountCookieName())?.value);
  if (!account) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const flood = await rateLimit(`smart-import:${account.email}`, { limit: 20, windowSeconds: 3600 });
  if (!flood.ok) {
    return NextResponse.json(
      { error: "Too many imports for now — try again in a bit." },
      { status: 429, headers: { "retry-after": String(Math.max(1, flood.retryAfter)) } },
    );
  }

  // `fileDataUrl` is the field; `pdfDataUrl` is still read so a page left open
  // across the deploy that added images keeps working.
  const body = (await request.json().catch(() => null)) as
    | { text?: string; fileDataUrl?: string; pdfDataUrl?: string }
    | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const fileDataUrl =
    typeof body?.fileDataUrl === "string" ? body.fileDataUrl : typeof body?.pdfDataUrl === "string" ? body.pdfDataUrl : "";

  if (!text && !fileDataUrl) {
    return NextResponse.json(
      { error: `Paste a confirmation, or attach one — ${Object.values(IMPORT_TYPES).join(", ")}.` },
      { status: 400 },
    );
  }

  let file;
  if (fileDataUrl) {
    const read = readImportDataUrl(fileDataUrl);
    if ("error" in read) {
      // Too large is its own status so the panel can keep what was typed and
      // say something specific rather than "that failed".
      return NextResponse.json({ error: read.error }, { status: read.error.includes("too large") ? 413 : 400 });
    }
    file = read.file;
  }

  const result = await extractSmartImport({ text: text || undefined, file });
  if (result.items.length === 0 && result.warnings.length === 0) {
    return NextResponse.json({
      items: [],
      warnings: [],
      error: "Could not read a booking out of that. Try pasting the confirmation text directly, or a clearer photo.",
    });
  }
  return NextResponse.json(result);
}
