/**
 * On-device storage for the trip companion app, so a trip opened once with a
 * connection stays fully readable with no signal afterwards — the itinerary and
 * the wallet, boarding passes and documents included.
 *
 * IndexedDB, not localStorage, for two reasons: the wallet holds document files
 * whose bytes are far past localStorage's ~5 MB ceiling, and IndexedDB stores
 * Blobs natively (no base64 inflation). One database, two stores — the trip JSON
 * keyed by the client's share token, and the document blobs keyed by a stable
 * file id.
 *
 * Everything here is browser-only and FAILS SOFT: if IndexedDB is missing or
 * throws — a private window, storage pressure, an old WebView — every call
 * resolves to null/false instead of throwing. The offline cache is a safety net;
 * it must never be able to break the online path by failing.
 */

const DB_NAME = "wg-offline";
const DB_VERSION = 2;
const TRIP_STORE = "trips";
const DOC_STORE = "documents";
const MSG_STORE = "messages";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TRIP_STORE)) db.createObjectStore(TRIP_STORE);
      if (!db.objectStoreNames.contains(DOC_STORE)) db.createObjectStore(DOC_STORE);
      if (!db.objectStoreNames.contains(MSG_STORE)) db.createObjectStore(MSG_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function idbSet(store: string, key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  } finally {
    try {
      db.close();
    } catch {
      /* already closing */
    }
  }
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<T | null>((resolve) => {
      const req = db.transaction(store, "readonly").objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      /* already closing */
    }
  }
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* fail soft */
  } finally {
    try {
      db.close();
    } catch {
      /* already closing */
    }
  }
}

// --- The trip itself -------------------------------------------------------

/** What a saved trip carries: the data, and when it was last refreshed online —
 *  so the app can tell the traveler "saved for offline · updated 2h ago". */
export type StoredTrip<T> = { savedAt: number; data: T };

/**
 * Keep this trip on the device. Called after every successful online load, so
 * the offline copy is always the freshest one the traveler has seen. `key` is
 * the client's share token (or the trip id for the owner's own view) — stable
 * per trip, unguessable, and never the raw internal id for a client.
 */
export async function saveTripOffline<T>(key: string, data: T): Promise<void> {
  if (!key) return;
  await idbSet(TRIP_STORE, key, { savedAt: Date.now(), data } satisfies StoredTrip<T>);
}

/** Read the saved trip, or null if this device has never opened it online. */
export async function readTripOffline<T>(key: string): Promise<StoredTrip<T> | null> {
  if (!key) return null;
  return idbGet<StoredTrip<T>>(TRIP_STORE, key);
}

/** Drop a saved trip (e.g. a client whose access was revoked). */
export async function forgetTripOffline(key: string): Promise<void> {
  if (!key) return;
  await idbDelete(TRIP_STORE, key);
}

/**
 * Empty everything this device kept for offline use — every saved trip, every
 * wallet document, every cached thread — by dropping the whole database.
 *
 * This is the sign-out sweep for the on-device store. The document store holds
 * boarding-pass bytes carrying a full name and a booking reference, and the
 * trip store holds a rendered itinerary with flight numbers, a hotel and the
 * client's name; none of it may outlive the session on a shared or borrowed
 * device. Deleting the database outright clears all three stores at once and
 * needs no list of keys the session happened to know. Best effort, like
 * everything here: signing out must never throw, and a blocked delete (another
 * tab still holding the database open) resolves rather than hangs.
 */
export async function forgetAllOffline(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await new Promise<void>((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.deleteDatabase(DB_NAME);
      } catch {
        resolve();
        return;
      }
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  } catch {
    /* signing out must never throw */
  }
}

// --- Wallet documents (boarding passes, confirmations) ---------------------

/**
 * Keep a wallet document's bytes on the device, keyed by its file id, so it
 * opens at the gate with no signal — no download step, it is simply already in
 * the wallet. Saved automatically in the background when the trip loads online.
 */
export async function saveDocumentOffline(fileId: string, blob: Blob): Promise<void> {
  if (!fileId) return;
  await idbSet(DOC_STORE, fileId, blob);
}

/** The saved bytes for a document, or null if not on this device yet. */
export async function readDocumentOffline(fileId: string): Promise<Blob | null> {
  if (!fileId) return null;
  return idbGet<Blob>(DOC_STORE, fileId);
}

// --- Chat messages ---------------------------------------------------------

/**
 * Keep the thread's messages on the device, keyed by its share token, so the
 * chat still READS with no signal — you can't send until you're back online,
 * but the conversation is there rather than a blank panel. Saved after every
 * successful online load; the newest load wins.
 */
export async function saveMessagesOffline<T>(shareId: string, messages: T[]): Promise<void> {
  if (!shareId) return;
  await idbSet(MSG_STORE, shareId, messages);
}

/** The saved messages for a thread, or null if never loaded online here. */
export async function readMessagesOffline<T>(shareId: string): Promise<T[] | null> {
  if (!shareId) return null;
  return idbGet<T[]>(MSG_STORE, shareId);
}
