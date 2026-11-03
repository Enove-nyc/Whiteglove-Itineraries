import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";

if (process.env.AUDIT_ISOLATED !== "1" || new URL(process.env.DATABASE_URL || "https://invalid").hostname !== "127.0.0.1" || new URL(process.env.UPSTASH_REDIS_REST_URL || "https://invalid").hostname !== "127.0.0.1") throw new Error("Cost fixtures require disposable loopback stores.");
const slug = "cost-fixture-00";

async function main() {
  switch (process.argv[2]) {
    case "seed":
      await prisma.$transaction(async tx => {
        await tx.page.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ slug: `cost-fixture-${String(i).padStart(2, "0")}`, title: `Cost fixture ${i}`, body: "COST_ORIGINAL_PUBLIC_BODY", status: "PUBLISHED" as const })) });
        await tx.page.create({ data: { slug: "cost-private-draft", title: "DRAFT_MUST_NOT_ESCAPE", body: "DRAFT_MUST_NOT_ESCAPE", status: "DRAFT" } });
        await tx.page.create({ data: { slug: "terms", title: "Terms", status: "PUBLISHED", blocks: [{ id: "cost-terms", kind: "text", heading: "COST_TERMS_ORIGINAL", body: "Disposable fixture terms." }] } });
        await tx.placeReview.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ placeKind: "listing", placeRef: "cost-fixture-place", placeLabel: "Cost fixture", authorEmail: `review-${i}@cost-fixture.audit.local`, authorName: "Fixture Member", score: 3, text: `FIXTURE_REVIEW_${i}` })) });
        await tx.placeReview.create({ data: { placeKind: "listing", placeRef: "cost-other-place", placeLabel: "Other fixture", authorEmail: "other@cost-fixture.audit.local", authorName: "Other Member", score: 2, text: "OTHER_PLACE_ONLY" } });
      });
      break;
    case "edit":
      await prisma.page.update({ where: { slug }, data: { body: "COST_COMMITTED_EDIT" } });
      break;
    case "transaction":
      await prisma.$transaction(async tx => {
        await tx.page.update({ where: { slug }, data: { body: "COST_INTERACTIVE_TRANSACTION" } });
        await tx.page.update({ where: { slug: "terms" }, data: { blocks: [{ id: "cost-terms", kind: "text", heading: "COST_TERMS_COMMITTED", body: "Changed after commit." }] } });
      });
      break;
    case "batch":
      await prisma.$transaction([
        prisma.page.update({ where: { slug }, data: { body: "COST_BATCH_TRANSACTION" } }),
        prisma.page.update({ where: { slug: "cost-fixture-01" }, data: { body: "COST_BATCH_SECOND_PAGE" } }),
      ]);
      break;
    case "rollback":
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.page.update({ where: { slug }, data: { body: "COST_UNCOMMITTED_MUST_NOT_ESCAPE" } });
        throw new Error("deliberate disposable rollback");
      }), /deliberate disposable rollback/);
      break;
    case "draft":
      await prisma.page.update({ where: { slug }, data: { status: "DRAFT" } });
      break;
    case "hide-review-column":
      await prisma.$executeRawUnsafe('ALTER TABLE "PlaceReview" RENAME COLUMN "text" TO "cost_fixture_text"');
      break;
    case "restore-review-column":
      await prisma.$executeRawUnsafe('ALTER TABLE "PlaceReview" RENAME COLUMN "cost_fixture_text" TO "text"');
      break;
    default: throw new Error("Unknown cost fixture action.");
  }
  console.log(JSON.stringify({ ok: true, action: process.argv[2] }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
