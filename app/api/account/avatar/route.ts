import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { accountCookieName, readSessionEmail, setAccountAvatar } from "@/lib/account-store";
import { effectiveMediaLimit, mediaStoreAvailable, putMedia } from "@/lib/media";
import { sameOrigin } from "@/lib/secure-access";

export const dynamic = "force-dynamic";

// Pictures only — the media store also takes PDFs and GIFs for
// advertisements, and neither is a face.
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// The ceiling the brief allows. The media store's own cap (a single Upstash
// value must fit one REST request) is lower today, and the smaller number is
// the real one — checked below so an oversized picture is refused here with
// the true limit in the message, not accepted and then lost to a blank
// "could not save" when the store refuses the write.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function whoAsked() {
  const cookieStore = await cookies();
  return readSessionEmail(cookieStore.get(accountCookieName())?.value);
}

// Upload the account's profile picture. Body: { dataUrl } — a
// "data:<type>;base64,..." string from the browser's FileReader, the same
// shape the admin media upload takes. The image goes into the media store and
// only its unguessable id lands on the account record; /api/media serves it.
export async function POST(request: NextRequest) {
  const email = await whoAsked();
  if (!email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  if (!mediaStoreAvailable()) return NextResponse.json({ error: "Connect the private store before uploading." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { dataUrl?: string } | null;
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(body?.dataUrl || "");
  if (!match) return NextResponse.json({ error: "Upload a JPG, PNG or WEBP picture." }, { status: 400 });
  const contentType = match[1];
  const base64 = match[2];
  if (!AVATAR_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WEBP picture." }, { status: 400 });
  }
  const bytes = Math.floor((base64.length * 3) / 4);
  const limit = Math.min(MAX_AVATAR_BYTES, effectiveMediaLimit());
  if (bytes > limit) {
    return NextResponse.json({ error: `That picture is too large (max ${Math.round(limit / 1024)} KB). Use a smaller one.` }, { status: 413 });
  }

  const id = await putMedia(contentType, base64);
  if (!id) return NextResponse.json({ error: "Could not save the picture." }, { status: 503 });
  const saved = await setAccountAvatar(email, id);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 503 });
  return NextResponse.json({ ok: true, avatarMediaId: id, url: `/api/media?id=${encodeURIComponent(id)}` });
}

// Take the picture down. The account goes back to initials.
export async function DELETE(request: NextRequest) {
  const email = await whoAsked();
  if (!email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  const saved = await setAccountAvatar(email, null);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
