// Owner's private expense/finance log, stored in Redis (Upstash REST). Amounts
// are kept as integer cents to avoid floating-point rounding.

export type Expense = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number;
  currency: string; // e.g. "USD"
  category: string;
  notes?: string;
  createdAt: string;
  receiptName?: string; // original filename when a PDF receipt is attached
};

const KEY = "white-glove:expenses";
const receiptKey = (id: string) => `white-glove:receipt:${id}`;

// Largest PDF we accept. Receipts are base64-encoded into a single Redis value,
// so this stays well under Upstash's per-request size limit.
export const MAX_RECEIPT_BYTES = 700 * 1024;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function expensesAvailable() {
  return Boolean(redisConfig());
}

async function redis<T>(command: string): Promise<{ result?: T } | undefined> {
  const config = redisConfig();
  if (!config) return undefined;
  try {
    const res = await fetch(`${config.url}/${command}`, { headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as { result?: T };
  } catch {
    return undefined;
  }
}

export async function listExpenses(): Promise<Expense[]> {
  const res = await redis<string>(`get/${encodeURIComponent(KEY)}`);
  if (!res?.result) return [];
  try {
    const parsed = JSON.parse(res.result) as Expense[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Up to 10,000 entries, the same reason receipts below are POSTed rather than
// put in the URL: a list that long can grow past what a URL is allowed to
// carry, and the failure is invisible from here — the caller just never finds
// out the newest expense was never saved.
async function writeExpenses(items: Expense[]) {
  const config = redisConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${config.url}/set/${encodeURIComponent(KEY)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(items.slice(0, 10000)),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function addExpense(input: Omit<Expense, "id" | "createdAt">): Promise<Expense | null> {
  if (!expensesAvailable()) return null;
  const items = await listExpenses();
  const expense: Expense = {
    ...input,
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const ok = await writeExpenses([expense, ...items]);
  return ok ? expense : null;
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (!expensesAvailable()) return false;
  const items = await listExpenses();
  const ok = await writeExpenses(items.filter((e) => e.id !== id));
  await deleteReceipt(id); // best-effort: drop the attached PDF too
  return ok;
}

// ---- PDF receipts ----------------------------------------------------------
// Each receipt is stored under its own key (not inside the expenses list) so
// the list stays small and fast to load. Values can be large, so we POST the
// body to Upstash rather than putting it in the URL path.

type StoredReceipt = { name: string; contentType: string; data: string };

async function redisSetBody(key: string, value: string): Promise<boolean> {
  const config = redisConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${config.url}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: value,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Store a PDF receipt (base64, no data: prefix) and tag the expense with it. */
export async function attachReceipt(id: string, name: string, base64: string): Promise<boolean> {
  if (!expensesAvailable()) return false;
  const items = await listExpenses();
  const expense = items.find((e) => e.id === id);
  if (!expense) return false;
  const stored: StoredReceipt = { name: name.slice(0, 160), contentType: "application/pdf", data: base64 };
  const ok = await redisSetBody(receiptKey(id), JSON.stringify(stored));
  if (!ok) return false;
  expense.receiptName = stored.name;
  return writeExpenses(items);
}

export async function getReceipt(id: string): Promise<StoredReceipt | null> {
  const res = await redis<string>(`get/${encodeURIComponent(receiptKey(id))}`);
  if (!res?.result) return null;
  try {
    const parsed = JSON.parse(res.result) as StoredReceipt;
    return parsed?.data ? parsed : null;
  } catch {
    return null;
  }
}

export async function deleteReceipt(id: string): Promise<boolean> {
  const res = await redis(`del/${encodeURIComponent(receiptKey(id))}`);
  return Boolean(res);
}

// Totals overall, by category, and by month — for the finances dashboard.
export function summarizeExpenses(items: Expense[]) {
  const byCurrency: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  for (const e of items) {
    byCurrency[e.currency] = (byCurrency[e.currency] ?? 0) + e.amountCents;
    byCategory[e.category || "Uncategorized"] = (byCategory[e.category || "Uncategorized"] ?? 0) + e.amountCents;
    const month = (e.date || "").slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] ?? 0) + e.amountCents;
  }
  return { byCurrency, byCategory, byMonth };
}
