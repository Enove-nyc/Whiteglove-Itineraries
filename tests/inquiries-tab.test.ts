import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * THE ENQUIRIES TAB: on the pipeline, behind the advisor door, and the
 * route it talks to cannot be used to write over somebody else's record.
 *
 * Source tests, the way this repository's other wiring tests are written:
 * the rules themselves are pure and tested in tests/inquiries.test.ts; this
 * file holds the places they are plugged in.
 */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("enquiries are a view on the pipeline, not a fifth screen", () => {
  const dash = code("components/PipelineDashboard.tsx");

  it("is one of the pipeline's views", () => {
    assert.match(dash, /\{ id: "inquiries", label: "Enquiries" \}/);
    assert.match(dash, /view === "inquiries" \? \(\s*<InquiriesPanel \/>/);
  });

  it("does not open on it — the dashboard still opens on what needs the advisor", () => {
    assert.match(dash, /useState<View>\("needs_attention"\)/);
  });

  it("puts no trip count on the tab, because enquiries are not trips", () => {
    // rowsFor("inquiries") must be empty, or the tab label would read a
    // number about the wrong thing.
    const fn = dash.slice(dash.indexOf("function rowsFor"), dash.indexOf("function rowsFor") + 800);
    assert.match(fn, /case "inquiries":\s*return \[\];/);
  });
});

describe("the route sits behind the same door as the pipeline", () => {
  const route = code("app/api/account/inquiries/route.ts");

  it("needs a signed-in advisor on Starter or up, for reading and for writing", () => {
    assert.equal((route.match(/mayServeCompanionClients\(await getPlan\(email\)\)/g) ?? []).length, 2);
    assert.equal((route.match(/status: 401/g) ?? []).length, 2);
  });

  it("refuses a write that did not come from this site", () => {
    const post = route.slice(route.indexOf("export async function POST"));
    assert.match(post, /if \(!sameOrigin\(request\)\)/);
  });

  it("reads and writes only this account's own list", () => {
    // Every branch goes through readInquiries(email) / writeInquiries(email):
    // an id in the body selects within that list and can never reach another
    // account's record.
    assert.match(route, /const existing = await readInquiries\(email\);/);
    assert.doesNotMatch(route, /readInquiries\([^e]/);
    assert.doesNotMatch(route, /writeInquiries\([^e]/);
  });

  it("keeps what a trip already decided out of an edit's reach", () => {
    const save = route.slice(route.indexOf('case "save"'), route.indexOf('case "delete"'));
    assert.match(save, /if \(current\?\.tripId\) cleaned\.tripId = current\.tripId;/);
    assert.match(save, /if \(current\?\.status === "converted"\) cleaned\.status = "converted";/);
  });

  it("starts a trip once, and hands back the same one afterwards", () => {
    const start = route.slice(route.indexOf('case "start_trip"'));
    assert.match(start, /if \(inquiry\.tripId\) return NextResponse\.json\(\{ ok: true, tripId: inquiry\.tripId/);
    assert.match(start, /createTrip\(email, name\)/);
    assert.match(start, /setTripClient\(email, created\.activeId, seed\.client\)/);
    assert.match(start, /status: "converted", tripId: created\.activeId/);
  });

  it("copies the enquiry's notes onto nothing a client could later see", () => {
    // The trip gets a name and a client. The notes stay on the enquiry.
    const start = route.slice(route.indexOf('case "start_trip"'));
    assert.doesNotMatch(start, /seed\.notes/);
    assert.doesNotMatch(start, /advisorNote|welcome/);
  });
});

describe("the panel is built for a phone between calls", () => {
  const panel = code("components/InquiriesPanel.tsx");

  it("asks for a contact and nothing else as a must", () => {
    const required = [...panel.matchAll(/<(input|select|textarea)[^>]*\brequired\b/g)];
    assert.equal(required.length, 1);
    assert.match(required[0][0], /draft\.contact/);
  });

  it("leaves lead source optional, with a blank first choice", () => {
    assert.match(panel, /<option value="">—<\/option>/);
    assert.match(panel, /How they found you, if you know/);
  });

  it("does not offer 'converted' as something to pick by hand", () => {
    // Only starting a trip converts an enquiry.
    assert.match(panel, /\["new", "working", "quoted", "lost"\] as InquiryStatus\[\]/);
  });

  it("uses at least 44px controls throughout", () => {
    assert.match(panel, /min-h-11/);
    assert.doesNotMatch(panel, /className="[^"]*\bh-8\b/);
  });

  it("leads with the working list and keeps finished ones one press away", () => {
    assert.match(panel, /openInquiries\(rows, today\)/);
    assert.match(panel, /closedInquiries\(rows\)/);
    assert.match(panel, /`Finished \(\$\{finished\.length\}\)`/);
  });

  it("shows no words while loading", () => {
    const loading = panel.slice(panel.indexOf("loading ? ("), panel.indexOf("loading ? (") + 300);
    assert.match(loading, /aria-hidden="true"/);
    assert.doesNotMatch(loading, />\s*Loading/);
  });
});
