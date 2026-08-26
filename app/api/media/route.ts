import { NextRequest, NextResponse } from "next/server";
import { getMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

// Public, no session check: serves any stored media by id — an uploaded
// advertisement image or PDF, or a companion-chat photo, video or voice
// note. Deliberately unauthenticated (a client on a share link has no
// account to check), so the id is the only gate: putMedia() mints it from
// the platform CSPRNG, unguessable by construction, not merely unlisted.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const media = await getMedia(id);
  if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const buffer = Buffer.from(media.data, "base64");
  const contentType = media.contentType || "application/octet-stream";
  // Media is immutable per id, so it can be cached hard.
  const cacheControl = "public, max-age=31536000, immutable";

  // Byte-range support. iOS Safari will not play a <video>/<audio> element
  // unless the server answers a Range request with 206 and a Content-Range;
  // seeking anywhere needs it too. Advertising Accept-Ranges lets the browser
  // ask. A picture or a PDF never sends a Range, so it just gets the 200 below.
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && (match[1] !== "" || match[2] !== "")) {
    const total = buffer.length;
    // "bytes=start-" (open end) and "bytes=-suffix" (last N bytes) are both valid.
    const start = match[1] === "" ? total - Number(match[2]) : Number(match[1]);
    let end = match[1] === "" ? total - 1 : match[2] === "" ? total - 1 : Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0 || start >= total) {
      // Unsatisfiable — tell the client the real size so it can retry.
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${total}`, "accept-ranges": "bytes" },
      });
    }
    if (end >= total) end = total - 1;
    const slice = buffer.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: {
        "content-type": contentType,
        "content-range": `bytes ${start}-${end}/${total}`,
        "content-length": String(slice.length),
        "accept-ranges": "bytes",
        "cache-control": cacheControl,
        // Serve exactly the stored type, never a browser's guess — so a file
        // whose type ever slipped past upload cannot be sniffed into HTML and
        // run on this origin. Shown inline (chat photos, PDFs), not downloaded.
        "x-content-type-options": "nosniff",
        "content-disposition": "inline",
      },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": contentType,
      "content-length": String(buffer.length),
      "accept-ranges": "bytes",
      "cache-control": cacheControl,
      // See above: pin the stored type and refuse content sniffing.
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
