import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Sharing a place from outside the app — Google Maps' own share sheet — into
 * White Glove: the manifest registers the app as a Web Share Target, the page
 * turns what arrives into a plain line of text, and the advisor picks which
 * client's thread it lands in, the same way any other message does.
 */

const MANIFEST = readFileSync("app/manifest.ts", "utf8");
const APP_PAGE = readFileSync("app/app/page.tsx", "utf8");
const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");

describe("the app registers itself as a share target", () => {
  it("shares into /app by GET, carrying title, text and url", () => {
    assert.match(MANIFEST, /share_target:\s*\{/);
    assert.match(MANIFEST, /action:\s*"\/app"/);
    assert.match(MANIFEST, /method:\s*"GET"/);
    assert.match(MANIFEST, /params:\s*\{\s*title:\s*"share_title",\s*text:\s*"share_text",\s*url:\s*"share_url"\s*\}/);
  });
});

describe("app/app/page.tsx turns a shared place into a draft, not a crash", () => {
  it("joins whatever arrived — title, text, url — trimming empties", () => {
    assert.match(APP_PAGE, /firstParam\(params\.share_title\)/);
    assert.match(APP_PAGE, /firstParam\(params\.share_text\)/);
    assert.match(APP_PAGE, /firstParam\(params\.share_url\)/);
    assert.match(APP_PAGE, /\.filter\(Boolean\)\s*\n\s*\.join\("\\n"\)/);
  });

  it("hands it to CompanionApp as sharedDraft, empty string turned into undefined", () => {
    assert.match(APP_PAGE, /sharedDraft=\{sharedDraft \|\| undefined\}/);
  });
});

describe("a shared place waits for the advisor to pick a client, then lands in that thread's composer", () => {
  it("a shared draft that arrives on the advisor's inbox opens straight to Messages", () => {
    assert.match(APP, /screen: sharedDraft && advisorInbox \? "messages" : "home"/);
  });

  it("AdvisorInbox is told about the pending share and how to clear it", () => {
    /**
     * READ FROM THE ELEMENT, NOT THE WHOLE LINE. This matched the element
     * verbatim, so it went red the day AdvisorInbox gained an unrelated prop
     * (onComposerFocus) and stayed red — a test that fails for a reason it was
     * never about teaches nobody anything and gets ignored. What it is
     * actually protecting is the pair: the inbox is handed the pending share,
     * and handed a way to say it has used it.
     */
    // The element now spans several lines (it gained openShareId / subject /
    // places when "Ask about this" learned to open the viewed trip), so match
    // from the tag name without a trailing space and read to its close.
    const element = APP.slice(APP.indexOf("<AdvisorInbox")).split("/>")[0];
    assert.match(element, /pendingShare=\{pendingShare\}/);
    assert.match(element, /onPendingShareUsed=\{\(\) => setPendingShare\(null\)\}/);
  });

  it("opening a client's thread carries the pending share into its composer", () => {
    const openBlock = APP.slice(APP.indexOf("if (open) {"), APP.indexOf("return (\n    <div style={{ padding: \"16px 16px 28px\""));
    assert.match(openBlock, /initialDraft=\{pendingShare\}/);
    assert.match(openBlock, /onInitialDraftUsed=\{onPendingShareUsed\}/);
  });

  it("LiveChat puts a shared draft straight into the composer, then hands the callback back", () => {
    // Widened, because staging the draft and handing the callback back are now
    // two things: the first happens during render (so the composer is never
    // painted empty for a frame after a share arrives), the second stays an
    // effect because telling the parent is a side effect. Both still have to
    // be here — a draft that stages without handing back restages itself every
    // time the traveller navigates away and returns.
    const effect = APP.slice(APP.indexOf("A place shared in from outside, put straight"), APP.indexOf("A place shared in from outside, put straight") + 700);
    assert.match(effect, /setDraft\(initialDraft\)/);
    assert.match(effect, /onInitialDraftUsed\?\.\(\)/);
  });
});
