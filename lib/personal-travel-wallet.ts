export type PersonalTravelDocument = { id: string; scope: string; name: string; kind: string; savedAt: string; blob: Blob };
const DATABASE = "wg-personal-travel-wallet";
const STORE = "documents";
export const MAX_PERSONAL_DOCUMENT_BYTES = 15 * 1024 * 1024;

export async function personalDocumentProblem(file: Blob): Promise<string | null> {
  if (file.size === 0) return "Choose a file that contains a document.";
  if (file.size > MAX_PERSONAL_DOCUMENT_BYTES) return "Choose a file smaller than 15 MB.";
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const signatures: Record<string, boolean> = {
    "application/pdf": [37, 80, 68, 70, 45].every((n, i) => bytes[i] === n),
    "image/jpeg": bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    "image/png": [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n),
    "image/webp": String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  };
  return signatures[file.type] ? null : "Choose a PDF, JPG, PNG or WebP image.";
}
async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("This device cannot save wallet files.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("scope", "scope");
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error("Could not open this device’s wallet."));
  });
}
export async function personalWalletScope(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
export async function listPersonalDocuments(scope: string): Promise<PersonalTravelDocument[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).index("scope").getAll(scope);
      request.onsuccess = () => resolve((request.result as PersonalTravelDocument[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      request.onerror = () => reject(new Error("Could not read this device’s wallet."));
    });
  } finally { db.close(); }
}
export async function savePersonalDocument(document: PersonalTravelDocument): Promise<void> {
  const problem = await personalDocumentProblem(document.blob);
  if (problem) throw new Error(problem);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(document);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error("The file was not saved. This device may be out of storage."));
    });
  } finally { db.close(); }
}
export async function removePersonalDocument(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error("The file could not be removed."));
    });
  } finally { db.close(); }
}
export async function forgetPersonalWallet(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }).catch(() => {});
}
