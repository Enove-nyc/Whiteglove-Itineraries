/**
 * Every place in this codebase that caches a public read (getPublicProviders,
 * getAttractionList, listAgencies, listPublishedMikvaos, …) and every write
 * path that has to bust one of those caches goes through these two helpers,
 * rather than importing `unstable_cache`/`updateTag` from `next/cache`
 * directly.
 *
 * WHY. `next/cache` is not resolvable outside an actual Next.js build —
 * dynamically importing it does not help, it genuinely does not exist as a
 * package in this repo's dependency tree the way `next/headers` does not.
 * Plenty of this codebase's own logic is exercised by plain-Node tests that
 * import these files directly (`npx tsx --test`), with no Next.js runtime
 * present at all. A static `import { updateTag } from "next/cache"` at the
 * top of a widely-imported file — content-admin.ts had exactly this —
 * breaks module loading for every test that imports it, whether or not the
 * test ever calls the function that needed the tag.
 *
 * Both helpers fail safe: outside a real Next.js runtime, a read simply runs
 * uncached (which is correct — a test wants the real, current answer, not a
 * cached one) and a write's invalidation is a silent no-op (there was
 * nothing cached to invalidate in that environment in the first place).
 */

/**
 * Every database-backed cache also carries this tag, and every write to the
 * database busts it (see lib/prisma.ts). That is what lets the timers below be
 * long: an edit shows up on the next visit because the write cleared the cache,
 * not because a timer happened to run out.
 *
 * WHY THE TIMERS ARE LONG. The database is Neon on the free plan: 100 compute
 * hours a month, and it only stops counting after five minutes with no query.
 * Search engines load a page roughly every fourteen seconds, day and night, so
 * any cache that expired hourly — and there were dozens, staggered — woke the
 * database every few minutes and it never slept. In October 2026 that used the
 * whole month's allowance and the database refused connections until the reset.
 * A day is a safety net for anything a write somehow failed to bust; it is not
 * how edits are meant to arrive.
 */
export const DB_CONTENT_TAG = "db-content";

/** How long a database read is kept when nothing has been edited: one day. */
export const DB_CACHE_SECONDS = 86_400;

/**
 * Read something through a tagged cache, or run it uncached if next/cache isn't available.
 *
 * If `fn` throws, nothing is cached and the error reaches the caller, so a read
 * that failed during an outage is tried again on the next visit instead of
 * being remembered for a day. Callers that want a fallback catch around this.
 */
export async function cachedRead<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  tags: string[],
  revalidateSeconds: number = DB_CACHE_SECONDS,
): Promise<T> {
  let unstable_cache: typeof import("next/cache").unstable_cache;
  try {
    ({ unstable_cache } = await import("next/cache"));
  } catch {
    return fn();
  }
  const allTags = tags.includes(DB_CONTENT_TAG) ? tags : [...tags, DB_CONTENT_TAG];
  try {
    return await unstable_cache(fn, keyParts, { tags: allTags, revalidate: revalidateSeconds })();
  } catch (error) {
    // Outside a request (a plain-Node test, a script) unstable_cache itself
    // refuses to run; the read is still wanted, so run it uncached. Anything
    // else is the read failing, which must reach the caller untouched.
    if (error instanceof Error && /incrementalCache|static generation store|outside a request/i.test(error.message)) {
      return fn();
    }
    throw error;
  }
}

/** Bust a tag written by cachedRead, or do nothing if next/cache isn't available. */
export async function bustTag(tag: string): Promise<void> {
  let mod: typeof import("next/cache");
  try {
    mod = await import("next/cache");
  } catch {
    return; // Nothing cached to invalidate outside a Next.js runtime.
  }
  try {
    // Server actions: the person who saved sees their change on the next render.
    mod.updateTag(tag);
    return;
  } catch {
    // updateTag only works inside a server action.
  }
  try {
    // Route handlers and everything else: expire it now.
    mod.revalidateTag(tag, { expire: 0 });
  } catch {
    // Not inside a request at all (a script, a build step): nothing to bust.
  }
}
