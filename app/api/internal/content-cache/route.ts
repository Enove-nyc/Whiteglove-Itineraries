import { NextRequest, NextResponse } from "next/server";
import { authenticateContentCacheNotice } from "@/lib/content-cache-invalidation";
import { bustLocalTag, DB_CONTENT_TAG } from "@/lib/cache-tags";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-white-glove-cache-signature");
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return NextResponse.json({ error: "Invalid cache notice." }, { status: 401, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Use JSON." }, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Invalid cache notice." }, { status: 400, headers });
  let text = "", size = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024) { await reader.cancel(); return NextResponse.json({ error: "Invalid cache notice." }, { status: 413, headers }); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let body: unknown;
  try { body = JSON.parse(text); }
  catch { return NextResponse.json({ error: "Invalid cache notice." }, { status: 400, headers }); }
  try {
    const notice = await authenticateContentCacheNotice(body, signature);
    if (!notice) return NextResponse.json({ error: "Invalid cache notice." }, { status: 401, headers });
    // Repeated valid notices safely expire the same tag. This never republishes or edits records.
    if (!(await bustLocalTag(DB_CONTENT_TAG))) throw new Error("Cache runtime is unavailable.");
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Cache refresh is temporarily unavailable." }, { status: 503, headers });
  }
}
