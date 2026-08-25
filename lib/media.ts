// Small media store for admin-uploaded advertisement images, email pictures
// and profile photos, served back to visitors through /api/media.
//
// ON DISK FIRST, REDIS AS THE FALLBACK. These files lived base64-encoded
// inside Upstash Redis, which has a small storage tier and a per-request cap
// — a handful of photographs filled it, and that limit is what forced the
// hosting move. With a persistent disk attached (Railway volume at /data),
// files are written to MEDIA_DIR instead and Redis goes back to what it is
// good at: small fast values.
//
// NOTHING ALREADY UPLOADED IS LOST. A read that misses the disk falls back
// to Redis, and on a hit it moves the file to disk and deletes the Redis
// copy — so every image that is ever served migrates itself, and the Redis
// space frees up as it happens. sweepMediaToDisk() does the same for files
// nobody has asked for yet, in one pass, from the admin's own maintenance
// button.
//
// WITHOUT THE DISK (local dev, or any host with no volume), everything
// behaves exactly as it always did: Redis holds the files, the old cap
// applies, and no code path touches the filesystem.

import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

// The Redis cap: a single base64 value must stay within Upstash's request
// limit. The disk has no such constraint — see effectiveMediaLimit().
export const MAX_MEDIA_BYTES = 900 * 1024;

/** The disk cap — roomier, but still a cap: this store is for adverts and
 * portraits, not video. */
export const MAX_DISK_MEDIA_BYTES = 2 * 1024 * 1024;

/**
 * The cap for a chat video — a short clip, not a film. Deliberately its own
 * number rather than a multiple of MAX_DISK_MEDIA_BYTES: that constant is
 * "how big a picture may be", and conflating the two would mean a change meant
 * for portraits quietly resizing what a client's phone may upload.
 *
 * VIDEO REQUIRES THE DISK. It is stored the same way as everything else here —
 * base64 in a JSON file — and at this size that only belongs on a real
 * filesystem; Redis's own per-value ceiling (see MAX_MEDIA_BYTES) is far below
 * it. videoUploadsAvailable() is the gate a caller checks before accepting one.
 */
export const MAX_CHAT_VIDEO_BYTES = 15 * 1024 * 1024;

/**
 * The cap for a voice note — a few minutes of speech, not a podcast. Smaller
 * than a video because there is no picture in it, but still well past the
 * Redis ceiling, so it needs the same disk gate.
 */
export const MAX_CHAT_AUDIO_BYTES = 8 * 1024 * 1024;

/**
 * The cap for a PDF document shared in a chat — a booking confirmation, a
 * ticket, an itinerary a client actually needs to keep. A document is not a
 * picture: a multi-page ticket with a boarding pass on it runs well past the
 * old 2 MB portrait cap, which is why real documents were bouncing. Given its
 * own number, roomier than a portrait but below a video, and only honoured
 * where the disk is (see docUploadLimit()) — on a Redis-only host a document
 * stays within the small per-value ceiling like any other picture.
 */
export const MAX_CHAT_DOC_BYTES = 15 * 1024 * 1024;

/** What a chat PDF may weigh, wherever the store is today: the roomier disk
 *  cap when the volume is mounted, the small Redis cap when it is not. */
export function docUploadLimit(): number {
  return diskMediaActive() ? MAX_CHAT_DOC_BYTES : MAX_MEDIA_BYTES;
}

export function videoUploadsAvailable(): boolean {
  return diskMediaActive();
}

export function audioUploadsAvailable(): boolean {
  return diskMediaActive();
}

export function isAllowedMediaType(type: string) {
  return ALLOWED_TYPES.has(type);
}

/**
 * Ids are minted by putMedia as `m-<timestamp>-<random>`. Checked on every
 * read BEFORE the id goes anywhere near a filesystem path — an id is also a
 * URL parameter, and "../" must never become part of a path.
 */
const MEDIA_ID = /^m-[a-z0-9]+-[a-z0-9]+$/i;

function mediaDir(): string | null {
  const dir = process.env.MEDIA_DIR?.trim() || "/data/media";
  // The default only activates where the volume actually exists — on a host
  // without /data (Vercel, local dev) this quietly stays on Redis.
  const parent = join(dir, "..");
  if (!existsSync(parent)) return null;
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

export function diskMediaActive(): boolean {
  return mediaDir() !== null;
}

/** What the upload routes should enforce, wherever the store is today. */
export function effectiveMediaLimit(): number {
  return diskMediaActive() ? MAX_DISK_MEDIA_BYTES : MAX_MEDIA_BYTES;
}

const mediaKey = (id: string) => `white-glove:media:${id}`;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function mediaStoreAvailable() {
  return diskMediaActive() || Boolean(redisConfig());
}

type StoredMedia = { contentType: string; data: string };

async function redisCommand(path: string, body?: string): Promise<Response | null> {
  const config = redisConfig();
  if (!config) return null;
  try {
    return await fetch(`${config.url}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

async function redisGet(key: string): Promise<string | undefined> {
  const res = await redisCommand(`get/${encodeURIComponent(key)}`);
  if (!res?.ok) return undefined;
  return ((await res.json()) as { result?: string }).result;
}

/* ---- disk ---------------------------------------------------------------- */

function fileFor(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

async function diskRead(id: string): Promise<StoredMedia | null> {
  const dir = mediaDir();
  if (!dir) return null;
  try {
    const parsed = JSON.parse(await readFile(fileFor(dir, id), "utf8")) as StoredMedia;
    return parsed?.data ? parsed : null;
  } catch {
    return null;
  }
}

async function diskWrite(id: string, media: StoredMedia): Promise<boolean> {
  const dir = mediaDir();
  if (!dir) return false;
  try {
    // Write-then-rename, so a crash mid-write can never leave a half file
    // where a whole one is expected.
    const tmp = fileFor(dir, id) + ".tmp";
    await writeFile(tmp, JSON.stringify(media), "utf8");
    await rename(tmp, fileFor(dir, id));
    return true;
  } catch {
    return false;
  }
}

/* ---- the store ----------------------------------------------------------- */

/** Store a file and return its id, or null on failure. Unguessable by
 * construction (128 bits from the platform CSPRNG) rather than merely
 * unlisted — this store now also holds private advisor↔client chat photos,
 * videos and voice notes served back with no session check (see
 * app/api/media/route.ts), so the id itself is the only thing standing
 * between a guess and someone else's picture. */
export async function putMedia(contentType: string, base64: string): Promise<string | null> {
  const id = `m-${Date.now()}-${randomBytes(16).toString("hex")}`;
  if (await diskWrite(id, { contentType, data: base64 })) return id;
  const res = await redisCommand(`set/${encodeURIComponent(mediaKey(id))}`, JSON.stringify({ contentType, data: base64 } satisfies StoredMedia));
  return res?.ok ? id : null;
}

export async function getMedia(id: string): Promise<StoredMedia | null> {
  if (!MEDIA_ID.test(id)) return null;

  const onDisk = await diskRead(id);
  if (onDisk) return onDisk;

  const raw = await redisGet(mediaKey(id));
  if (!raw) return null;
  let parsed: StoredMedia;
  try {
    parsed = JSON.parse(raw) as StoredMedia;
  } catch {
    return null;
  }
  if (!parsed?.data) return null;

  // Found only in Redis: move it home, then free the Redis space. The delete
  // only happens after the disk write succeeded, so the file always exists in
  // at least one place.
  if (await diskWrite(id, parsed)) {
    await redisCommand(`del/${encodeURIComponent(mediaKey(id))}`);
  }
  return parsed;
}

/**
 * Move every file still in Redis onto the disk, in one pass — the lazy
 * migration above only reaches images somebody asks for; this reaches the
 * rest. Safe to run any number of times; does nothing without the disk.
 * Returns how many files moved, or null when there was nothing to do it with.
 */
export async function sweepMediaToDisk(): Promise<number | null> {
  if (!diskMediaActive() || !redisConfig()) return null;
  let moved = 0;
  let cursor = "0";
  do {
    const res = await redisCommand(`scan/${cursor}/match/${encodeURIComponent("white-glove:media:*")}/count/50`);
    if (!res?.ok) break;
    const data = (await res.json()) as { result?: [string, string[]] };
    const [next, keys] = data.result ?? ["0", []];
    cursor = next;
    for (const key of keys) {
      const id = key.replace("white-glove:media:", "");
      if (!MEDIA_ID.test(id)) continue;
      const raw = await redisGet(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as StoredMedia;
        if (parsed?.data && (await diskWrite(id, parsed))) {
          await redisCommand(`del/${encodeURIComponent(key)}`);
          moved += 1;
        }
      } catch {
        // An unreadable value is left where it is rather than deleted.
      }
    }
  } while (cursor !== "0");
  return moved;
}

/** Test hook: delete one file from the disk store. */
export async function deleteMediaFromDisk(id: string): Promise<void> {
  const dir = mediaDir();
  if (!dir || !MEDIA_ID.test(id)) return;
  await unlink(fileFor(dir, id)).catch(() => undefined);
}
