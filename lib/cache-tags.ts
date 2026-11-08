/** Public content caches; account and trip records never pass through this helper. */
export const DB_CONTENT_TAG = "db-content";
// A bounded safety net if a peer cannot acknowledge an edit; normal writes invalidate immediately.
export const DB_CACHE_SECONDS = 6 * 60 * 60;

function noCacheRuntime(error: unknown): boolean {
  return error instanceof Error && /incrementalCache|static generation store|outside a request|work store|request scope/i.test(error.message);
}

/** Framework import failures in plain Node tests/scripts are distinct from a failed database read. */
async function cacheModule(): Promise<typeof import("next/cache") | null> {
  try { return await import("next/cache"); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if ((code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") && error instanceof Error && /next[\\/]cache/.test(error.message)) return null;
    throw error;
  }
}

export async function cachedRead<T>(fn: () => Promise<T>, keyParts: string[], tags: string[], revalidateSeconds = 3600): Promise<T> {
  const mod = await cacheModule();
  if (!mod) return fn();
  const allTags = tags.includes(DB_CONTENT_TAG) ? tags : [...tags, DB_CONTENT_TAG];
  let readStarted = false;
  try {
    return await mod.unstable_cache(() => { readStarted = true; return fn(); }, keyParts, { tags: allTags, revalidate: revalidateSeconds })();
  } catch (error) {
    // Never retry a loader which ran, even if its error resembles a framework error.
    if (!readStarted && noCacheRuntime(error)) return fn();
    throw error;
  }
}

/** Local-only: the authenticated peer endpoint must not publish another notice. */
export async function bustLocalTag(tag: string): Promise<boolean> {
  const mod = await cacheModule();
  if (!mod) return false;
  try { mod.updateTag(tag); return true; }
  catch { /* updateTag is restricted to Server Actions. Route handlers use revalidateTag. */ }
  try { mod.revalidateTag(tag, { expire: 0 }); return true; }
  catch (error) {
    if (noCacheRuntime(error)) return false;
    throw error;
  }
}

/** Existing write paths, including Redis directory edits, refresh both companies' public caches. */
export async function bustTag(tag: string): Promise<void> {
  try {
    await bustLocalTag(tag);
    if (tag !== DB_CONTENT_TAG) await bustLocalTag(DB_CONTENT_TAG);
  } catch {
    console.error("[content-cache] Local cache refresh failed after a saved edit; check the Next.js cache runtime.");
  }
  const { notifyContentCaches } = await import("@/lib/content-cache-invalidation");
  await notifyContentCaches();
}
