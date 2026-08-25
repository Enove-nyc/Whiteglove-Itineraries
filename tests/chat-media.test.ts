import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChatDataUrl } from "@/lib/chat-media";

test("a Chromium voice note (codec parameter) parses to its base type", () => {
  const parsed = parseChatDataUrl("data:audio/webm;codecs=opus;base64,AAAA");
  assert.deepEqual(parsed, { contentType: "audio/webm", base64: "AAAA" });
});

test("a plain audio/webm still parses", () => {
  assert.deepEqual(parseChatDataUrl("data:audio/webm;base64,AAAA"), { contentType: "audio/webm", base64: "AAAA" });
});

test("a PDF parses (no parameters)", () => {
  assert.deepEqual(parseChatDataUrl("data:application/pdf;base64,JVBER"), {
    contentType: "application/pdf",
    base64: "JVBER",
  });
});

test("a codec-tagged video parses to its base type", () => {
  const parsed = parseChatDataUrl('data:video/mp4;codecs="avc1.4d002a";base64,AAAA');
  assert.equal(parsed?.contentType, "video/mp4");
});

test("the content type is lower-cased", () => {
  assert.equal(parseChatDataUrl("data:IMAGE/JPEG;base64,AAAA")?.contentType, "image/jpeg");
});

test("non-data URLs and non-base64 URLs are rejected", () => {
  assert.equal(parseChatDataUrl("https://example.com/x.png"), null);
  assert.equal(parseChatDataUrl("data:image/png,notbase64"), null);
  assert.equal(parseChatDataUrl("data:;base64,AAAA"), null);
  assert.equal(parseChatDataUrl(""), null);
});
