import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/promotions/route";
import { getActivePromotions, type Promotion, type PublicPromotion } from "../lib/admin-content";

test("public banner selection uses one fresh store read and only public fields", async t => {
  const make = (id: string, extra: Partial<Promotion> = {}): Promotion => ({
    id, title: id, description: "Public creative", buttonText: "View", targetHref: "/destinations",
    imageUrl: "", pdfUrl: "", videoUrl: "", advertiserName: "Private owner record",
    advertiserPhone: "PRIVATE_PHONE_MUST_NOT_ESCAPE", advertiserEmail: "private-contact@fixture.invalid",
    placements: ["fixed-top-banner", "popup", "sticky-bottom-banner"], targetPaths: "*", device: "all",
    startDate: "", endDate: "", priority: 2, maxViewsPerVisitor: 3, enabled: true,
    impressions: 123, clicks: 45, createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra,
  });
  const promotions = [
    make("all"),
    make("mobile", { placements: ["fixed-top-banner"], device: "mobile", targetPaths: "/rome", priority: 20 }),
    make("desktop", { placements: ["fixed-top-banner"], device: "desktop", targetPaths: "/rome", priority: 30 }),
    make("popup-old", { placements: ["popup"], priority: 50 }),
    make("popup-new", { placements: ["popup"], priority: 50, updatedAt: "2026-02-01" }),
    make("disabled", { enabled: false, priority: 999 }),
    make("expired", { endDate: "2001-01-01", priority: 999 }),
    make("future", { startDate: "2099-01-01", priority: 999 }),
  ];
  let stored: string | null = JSON.stringify({ settings: {}, locations: [], accommodations: [], suggestions: [], promotions });
  let upstreamStatus = 200;
  let reads = 0;
  let stalled = false;
  const server = createServer((request, response) => {
    assert.equal(request.method, "GET", "Public selection must never modify content.");
    assert.equal(request.headers.authorization, "Bearer fixture-only");
    reads++;
    if (stalled) return;
    response.writeHead(upstreamStatus, { "content-type": "application/json" });
    response.end(JSON.stringify({ result: stored }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture-only";
  t.after(async () => {
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  });
  type Slots = { topBanner: PublicPromotion | null; popup: PublicPromotion | null; bottomBanner: PublicPromotion | null };
  const requestSlots = async (path: string, mobile: boolean): Promise<Slots> => {
    const response = await GET(new NextRequest(`http://fixture.invalid/api/promotions?path=${encodeURIComponent(path)}`, { headers: { "user-agent": mobile ? "Mobile fixture" : "Desktop fixture" } }));
    assert.equal(response.status, 200);
    return await response.json() as Slots;
  };
  await t.test("all three slots share exactly one HTTP store read", async () => {
    const before = reads;
    const slots = await requestSlots("/rome/guide", true);
    assert.equal(reads - before, 1);
    assert.equal(slots.topBanner?.id, "mobile");
    assert.equal(slots.popup?.id, "popup-new");
    assert.equal(slots.bottomBanner?.id, "all");
  });
  await t.test("private advertiser records and internal counters never reach the public API", async () => {
    const slots = await requestSlots("/rome", true);
    assert(slots.topBanner);
    assert.deepEqual(Object.keys(slots.topBanner).sort(), ["id", "title", "description", "buttonText", "targetHref", "imageUrl", "pdfUrl", "videoUrl", "maxViewsPerVisitor", "placements"].sort());
    assert.doesNotMatch(JSON.stringify(slots), /advertiser|PRIVATE_PHONE|private-contact|impressions|clicks/);
  });
  await t.test("device, whole path, priority, schedule and update ordering are preserved", async () => {
    assert.equal((await requestSlots("/rome", false)).topBanner?.id, "desktop");
    assert.equal((await requestSlots("/rome-not-a-child", true)).topBanner?.id, "all");
    for (const [path, device] of [["/rome", "mobile"], ["/rome", "desktop"], ["/elsewhere", "mobile"]] as const) {
      const slots = await requestSlots(path, device === "mobile");
      assert.equal(slots.topBanner?.id, (await getActivePromotions("fixed-top-banner", path, device))[0]?.id);
      assert.equal(slots.popup?.id, (await getActivePromotions("popup", path, device))[0]?.id);
      assert.equal(slots.bottomBanner?.id, (await getActivePromotions("sticky-bottom-banner", path, device))[0]?.id);
    }
  });
  await t.test("a new request sees an edit immediately without a stale process cache", async () => {
    promotions[0].title = "Updated creative";
    stored = JSON.stringify({ settings: {}, locations: [], accommodations: [], suggestions: [], promotions });
    const before = reads;
    assert.equal((await requestSlots("/elsewhere", true)).bottomBanner?.title, "Updated creative");
    assert.equal(reads - before, 1);
  });
  await t.test("an empty store keeps the public page available", async () => {
    stored = null;
    const before = reads;
    assert.deepEqual(await requestSlots("/", true), { topBanner: null, popup: null, bottomBanner: null });
    assert.equal(reads - before, 1);
  });
  await t.test("an unavailable store does not turn a banner into a page failure", async () => {
    upstreamStatus = 503;
    const before = reads;
    assert.deepEqual(await requestSlots("/", true), { topBanner: null, popup: null, bottomBanner: null });
    assert.equal(reads - before, 1);
  });
  await t.test("a stalled optional store has a bounded deadline", { timeout: 20000 }, async () => {
    upstreamStatus = 200;
    stalled = true;
    const started = Date.now();
    assert.deepEqual(await requestSlots("/", true), { topBanner: null, popup: null, bottomBanner: null });
    assert(Date.now() - started < 15000, "The public request must not wait indefinitely for optional content.");
  });
});
