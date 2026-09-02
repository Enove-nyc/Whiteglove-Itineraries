import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  IMPORT_ACCEPT,
  MAX_IMPORT_BYTES,
  base64Bytes,
  importFingerprint,
  isImportMediaType,
  readImportDataUrl,
} from "@/data/smart-import-files";

const b64 = (text: string) => Buffer.from(text).toString("base64");

describe("what a confirmation may arrive as", () => {
  it("takes the PDF, and now the screenshot and the photo too", () => {
    for (const type of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
      assert.equal(isImportMediaType(type), true, type);
      assert.ok(IMPORT_ACCEPT.includes(type), `${type} is not offered by the file picker`);
    }
  });

  it("refuses an SVG, which is a script that looks like a picture", () => {
    assert.equal(isImportMediaType("image/svg+xml"), false);
    const out = readImportDataUrl(`data:image/svg+xml;base64,${b64("<svg/>")}`);
    assert.ok("error" in out);
  });

  it("refuses anything that is not a data URL at all", () => {
    for (const bad of ["", "https://example.com/x.pdf", "data:application/pdf,notbase64"]) {
      assert.ok("error" in readImportDataUrl(bad), bad);
    }
  });

  it("reads a good one into bytes the extractor can send", () => {
    const out = readImportDataUrl(`data:image/png;base64,${b64("hello")}`);
    assert.ok("file" in out);
    assert.equal(out.file.mediaType, "image/png");
    assert.equal(Buffer.from(out.file.base64, "base64").toString(), "hello");
  });

  it("measures the size from the payload, never from what the browser claimed", () => {
    assert.equal(base64Bytes(b64("hello")), 5);
    assert.equal(base64Bytes(b64("hi")), 2);
    const huge = "A".repeat(Math.ceil(((MAX_IMPORT_BYTES + 1024) * 4) / 3));
    const out = readImportDataUrl(`data:application/pdf;base64,${huge}`);
    assert.ok("error" in out);
    assert.match(out.error, /too large/);
  });
});

describe("importing the same thing twice", () => {
  it("fingerprints text and files alike", () => {
    assert.equal(importFingerprint({ text: "BA117 on 3 June" }), importFingerprint({ text: "BA117 on 3 June" }));
    assert.notEqual(importFingerprint({ text: "BA117" }), importFingerprint({ text: "BA118" }));
    assert.notEqual(importFingerprint({ base64: "aaaa" }), importFingerprint({ base64: "bbbb" }));
  });

  it("is empty for nothing, so an empty box never counts as a duplicate", () => {
    assert.equal(importFingerprint({}), "");
    assert.equal(importFingerprint({ text: "   " }), "");
  });

  it("is a warning in the panel, not a block", () => {
    // A planner may legitimately want the same voucher on two trips, and the
    // site should not decide that for them.
    const panel = readFileSync("components/SmartImportPanel.tsx", "utf8");
    assert.match(panel, /You already added this one/);
    assert.match(panel, /Read it again if you meant to/);
  });
});

describe("the importer says what it is", () => {
  it("labels the reading as AI-assisted, before anything is read", () => {
    const panel = readFileSync("components/SmartImportPanel.tsx", "utf8");
    assert.match(panel, /ANSWER_LABEL/, "the AI disclosure is missing");
    // Reuses the assistant's wording rather than inventing a second one.
    assert.match(panel, /from "@\/lib\/assistant-disclosure"/);
  });

  it("still never writes to the trip before the planner confirms", () => {
    const route = readFileSync("app/api/account/smart-import/route.ts", "utf8");
    assert.doesNotMatch(route, /writeTrips|saveItinerary|addImportedItemsToItinerary/);
    const panel = readFileSync("components/SmartImportPanel.tsx", "utf8");
    assert.match(panel, /function addSelected/);
    assert.match(panel, /onImport\(chosen\)/);
  });

  it("keeps what was typed when a file fails to read", () => {
    // The text box is not cleared by a bad attachment — retyping a pasted
    // confirmation because a photo failed is the worst version of this.
    const panel = readFileSync("components/SmartImportPanel.tsx", "utf8");
    const handler = panel.slice(panel.indexOf("function onFile"), panel.indexOf("async function extract"));
    assert.match(handler, /reader\.onerror/);
    assert.ok(!/setText\(""\)/.test(handler), "a failed file cleared what was typed");
  });
});

describe("each provider is given the file in the shape it accepts", () => {
  const lib = readFileSync("lib/smart-import.ts", "utf8");

  it("a PDF is a document block and an image is an image block", () => {
    // Sending the wrong envelope is rejected by the API, and the failure looks
    // like "could not read that" rather than like a bug.
    assert.match(lib, /mediaType === "application\/pdf" \? "document" : "image"/);
  });

  it("an image may go to OpenAI; a PDF may not", () => {
    assert.match(lib, /if \(!raw && !isPdf && openaiKey/);
    assert.match(lib, /image_url/);
  });

  it("no OCR engine or PDF parser was added for this", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      assert.ok(!/tesseract|pdf-parse|pdfjs|ocr/i.test(dep), `a document library crept in: ${dep}`);
    }
  });
});
