import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { COMPANION_DEMO_TRIP } from "@/data/companion-demo";

/**
 * The one public demonstration of the client app, and what it is allowed to
 * show.
 *
 * /app/preview is sold as "this is what your client opens when you send them
 * the app". That sentence is the whole contract, and the page was breaking it
 * in two directions at once — showing controls no client will ever have, and
 * not showing the thing the app is mostly for.
 */

const PREVIEW = readFileSync("app/app/preview/page.tsx", "utf8");
const APP = readFileSync("components/companion/CompanionApp.tsx", "utf8");

describe("the preview shows a client's app, not the showcase's", () => {
  /**
   * `concierge` turns on a "Concierge" tab, a Concierge/Guide switch and a
   * Traveler/Advisor role switch. It is true for this one scripted trip and
   * nothing else — a demonstration of a tier that is not built. On the page
   * promising a client's own app, a buyer met all three beside the Advisor tab
   * with nothing to tell them apart. The owner asked what the difference was;
   * the answer was that to a client there is none, because one of them is not
   * a product.
   */
  it("asks for the client shape", () => {
    assert.match(PREVIEW, /previewAsClient: true/);
  });

  it("hides all three showcase controls behind one flag", () => {
    assert.match(APP, /const showcaseSwitches = hasConcierge && !trip\.previewAsClient/);
    // Every switch site reads the flag, not hasConcierge. If one is missed it
    // is the one that reappears on a public page.
    const sites = APP.match(/\{showcaseSwitches && \(/g) ?? [];
    assert.equal(sites.length, 3, "a showcase control is still gated on hasConcierge alone");
    assert.doesNotMatch(APP, /\{hasConcierge && \(\s*\n\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: 9 \}\}>/);
  });

  it("keeps the advisor thread, under the name a client sees", () => {
    // The scripted conversation is the best thing in the sample. Removing the
    // switches must not remove it — it just moves to where a client's own
    // thread is, with the chat icon rather than the showcase's sparkle.
    assert.match(APP, /\[conciergeTabScreen, "Advisor", "chat"\]/);
    assert.ok((COMPANION_DEMO_TRIP.messages?.length ?? 0) > 0);
  });
});

describe("the travel wallet actually holds documents", () => {
  /**
   * The wallet's promise is a boarding pass on a phone with no signal, and the
   * sample had no document in it at all — a real attachment is bytes behind an
   * owner-checked route, and a made-up trip has no owner. So the one public
   * demonstration of the product showed the feature as a list of greyed-out
   * reference numbers with nothing behind them.
   */
  const rows = COMPANION_DEMO_TRIP.walletGroups.flatMap((g) => g.rows);
  const docs = rows.flatMap((r) => r.attachments ?? []);

  it("opens a flight, a stay and a ticket", () => {
    assert.ok(docs.length >= 3, "the sample wallet has nothing to open");
    for (const kind of ["boarding-pass", "hotel-confirmation", "colosseum-ticket"]) {
      assert.ok(
        docs.some((d) => d.sampleUrl === `/samples/${kind}.svg`),
        `no sample ${kind} in the wallet`,
      );
    }
  });

  it("every one of them says so on its face", () => {
    // A page that shows a boarding pass has to be unmistakably a picture of
    // one. Both the banner and the watermark, because either alone can be
    // cropped out of a screenshot.
    for (const doc of docs) {
      const svg = readFileSync(`public${doc.sampleUrl}`, "utf8");
      assert.match(svg, /SAMPLE DOCUMENT — NOT/, `${doc.sampleUrl} has no banner`);
      assert.match(svg, /fill-opacity="0\.07">SAMPLE/, `${doc.sampleUrl} has no watermark`);
      assert.match(svg, /<title>Sample/, `${doc.sampleUrl} is not named as a sample`);
    }
  });

  it("invents the airline rather than borrowing one", () => {
    const bp = readFileSync("public/samples/boarding-pass.svg", "utf8");
    assert.match(bp, /Meridian Atlantic is not a real airline/);
  });

  it("links straight at the file, with no account behind it", () => {
    // A sample has no owner to check and no share token to check against, so
    // both of the real doors would 401. And it must never offer the adviser's
    // share toggle, which writes to a trip that does not exist.
    assert.match(APP, /att\.sampleUrl\s*\n?\s*\?\s*att\.sampleUrl/);
    assert.match(APP, /\{!att\.sampleUrl && !isClientViewer && trip\.tripId/);
    assert.match(APP, /offlineCapable=\{isClientViewer && !att\.sampleUrl\}/);
  });
});

describe("the sample chat is the chat that shipped", () => {
  /**
   * The real thread was redesigned into one rounded bar — paperclip, growing
   * field, camera, round send button — and the scripted thread was not, so the
   * app a buyer was shown had a plain box and a square arrow the product no
   * longer has. Two designs of the same screen, and the wrong one on the sales
   * page.
   */
  it("uses the rounded composer, not the old box and square arrow", () => {
    const scripted = APP.slice(APP.indexOf("const conciergeChat = ("), APP.indexOf("const guideChat = ("));
    assert.match(scripted, /borderRadius: 23/, "the composer is not the rounded bar");
    assert.match(scripted, /name="paperclip"/);
    assert.match(scripted, /name="camera"/);
    assert.doesNotMatch(scripted, /borderRadius: 14, fontSize: 17/, "the square send button is back");
  });

  it("sizes bubbles the way the real thread does", () => {
    const scripted = APP.slice(APP.indexOf("const conciergeChat = ("), APP.indexOf("const guideChat = ("));
    assert.match(scripted, /maxWidth: "82%"/);
    assert.match(scripted, /width: "fit-content"/);
    assert.doesNotMatch(scripted, /maxWidth: "80%"/, "the flat 80% bubble is back — short messages break to one word a line");
  });
});
