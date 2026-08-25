import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
// mediaDir() reads MEDIA_DIR lazily (per call), so setting it before any test
// body runs is enough — static imports are fine.
import { putMedia, docUploadLimit, MAX_CHAT_DOC_BYTES, MAX_MEDIA_BYTES } from "@/lib/media";
import { GET } from "@/app/api/media/route";

// A real disk store, so putMedia lands a file getMedia can read back.
const dir = mkdtempSync(join(tmpdir(), "wg-media-range-"));
process.env.MEDIA_DIR = join(dir, "media");

const req = (id: string, range?: string) =>
  new NextRequest(`http://localhost/api/media?id=${id}`, range ? { headers: { range } } : undefined);

test("the document cap is the roomy disk cap when the volume is mounted", () => {
  assert.equal(docUploadLimit(), MAX_CHAT_DOC_BYTES);
  assert.ok(MAX_CHAT_DOC_BYTES > MAX_MEDIA_BYTES);
});

test("a Range request is answered with 206 and the exact slice", async () => {
  const id = (await putMedia("application/pdf", Buffer.from("0123456789").toString("base64")))!;
  assert.ok(id);

  const res = await GET(req(id, "bytes=2-5"));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "2345");
});

test("an open-ended and a suffix range both resolve", async () => {
  const id = (await putMedia("application/pdf", Buffer.from("0123456789").toString("base64")))!;
  assert.equal(Buffer.from(await (await GET(req(id, "bytes=7-"))).arrayBuffer()).toString(), "789");
  assert.equal(Buffer.from(await (await GET(req(id, "bytes=-3"))).arrayBuffer()).toString(), "789");
});

test("a full request advertises range support", async () => {
  const id = (await putMedia("application/pdf", Buffer.from("0123456789").toString("base64")))!;
  const res = await GET(req(id));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "0123456789");
});

test("an unsatisfiable range gets 416 with the real size", async () => {
  const id = (await putMedia("application/pdf", Buffer.from("0123456789").toString("base64")))!;
  const res = await GET(req(id, "bytes=50-60"));
  assert.equal(res.status, 416);
  assert.equal(res.headers.get("content-range"), "bytes */10");
});
