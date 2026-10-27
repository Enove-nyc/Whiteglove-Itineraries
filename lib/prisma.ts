import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { bustTag, DB_CONTENT_TAG } from "@/lib/cache-tags";

// Prisma 7 connects through a driver adapter. We use Neon's serverless
// driver so it works well on Vercel's serverless/edge runtime. The
// connection string comes from DATABASE_URL (set in Vercel env vars and
// in a local .env for migrations/seeding).
//
// Cache the client on globalThis so hot-reload in dev and warm serverless
// invocations reuse one instance instead of opening a new pool each time.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to the environment.",
    );
  }
  const adapter = new PrismaNeon({ connectionString });
  return withCacheBusting(new PrismaClient({ adapter }));
}

/** Every Prisma operation that changes a row. */
const WRITES = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * Any write clears every database-backed cache (see DB_CONTENT_TAG in
 * lib/cache-tags.ts). Public reads are cached for a day so the database can
 * sleep; this is what makes an edit appear on the next visit anyway, without
 * every save path having to remember which cache it touched.
 */
function withCacheBusting(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const result = await query(args);
          if (WRITES.has(operation)) await bustTag(DB_CONTENT_TAG);
          return result;
        },
      },
      async $executeRaw({ args, query }) {
        const result = await query(args);
        await bustTag(DB_CONTENT_TAG);
        return result;
      },
      async $executeRawUnsafe({ args, query }) {
        const result = await query(args);
        await bustTag(DB_CONTENT_TAG);
        return result;
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
