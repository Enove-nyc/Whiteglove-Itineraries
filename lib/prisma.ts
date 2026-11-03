import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { bustTag, DB_CONTENT_TAG } from "@/lib/cache-tags";

// Keep the existing Prisma/Neon adapter and DATABASE_URL on Railway.
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

const transactions = new AsyncLocalStorage<{ dirty: boolean }>();

async function changed(): Promise<void> {
  const transaction = transactions.getStore();
  if (transaction) transaction.dirty = true;
  else await bustTag(DB_CONTENT_TAG);
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
 * lib/cache-tags.ts). Public reads share bounded caches so the database can
 * sleep; this is what makes an edit appear on the next visit anyway, without
 * every save path having to remember which cache it touched.
 */
function withCacheBusting(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const result = await query(args);
          if (WRITES.has(operation)) await changed();
          return result;
        },
      },
      async $executeRaw({ args, query }) {
        const result = await query(args);
        await changed();
        return result;
      },
      async $executeRawUnsafe({ args, query }) {
        const result = await query(args);
        await changed();
        return result;
      },
    },
  }) as unknown as PrismaClient;
  return new Proxy(extended, {
    get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return (...args: unknown[]) => {
        const state = { dirty: false };
        return transactions.run(state, async () => {
          try { return await Reflect.apply(target.$transaction, target, args); }
          finally {
            // Flush after commit/rollback, never while a transaction can cache pre-commit rows.
            // Invalidating after rollback is harmless and also covers writes made through a
            // global client from inside a callback which subsequently failed.
            if (state.dirty) await bustTag(DB_CONTENT_TAG);
          }
        });
      };
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Share the pool across production route bundles as well as development reloads.
globalForPrisma.prisma = prisma;

