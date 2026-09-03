"use client";

import { useMemo, useState } from "react";
import { inventoryStatusLabel, inventoryStatuses, type InventoryArea, type InventoryStatus } from "@/data/page-inventory";
import type { EditableInventoryItem } from "@/lib/admin-inventory";

type Filter = "all" | "open" | "complete" | InventoryStatus;
type SortKey = "priority" | "status" | "route" | "completion";

const areaOptions: Array<InventoryArea | "All"> = ["All", "Public page", "Admin page", "API route", "Cross-site issue"];
const priorityRank = { High: 0, Medium: 1, Low: 2 };

function statusClass(status: InventoryStatus) {
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "broken") return "border-red-200 bg-red-50 text-red-800";
  if (status === "mobile") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-[var(--gold-light)] bg-white text-[var(--navy)]";
}

export default function AdminInventoryManager({ initialItems, configured }: { initialItems: EditableInventoryItem[]; configured: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("open");
  const [area, setArea] = useState<InventoryArea | "All">("All");
  const [sort, setSort] = useState<SortKey>("priority");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState(configured ? "" : "Connect the private database before editing statuses or notes.");

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => area === "All" || item.area === area)
      .filter((item) => filter === "all" || (filter === "open" ? item.status !== "complete" : filter === "complete" ? item.status === "complete" : item.status === filter))
      .sort((a, b) => {
        if (sort === "completion") return Number(a.status === "complete") - Number(b.status === "complete") || priorityRank[a.priority] - priorityRank[b.priority] || a.route.localeCompare(b.route);
        if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority] || a.route.localeCompare(b.route);
        if (sort === "status") return inventoryStatusLabel(a.status).localeCompare(inventoryStatusLabel(b.status)) || a.route.localeCompare(b.route);
        return a.route.localeCompare(b.route);
      });
  }, [area, filter, items, sort]);

  const completed = items.filter((item) => item.status === "complete").length;
  const open = items.length - completed;

  async function updateItem(id: string, update: Partial<Pick<EditableInventoryItem, "status" | "ownerNotes">>) {
    if (!configured) {
      setMessage("Connect the private database before editing statuses or notes.");
      return;
    }
    setSavingId(id);
    setMessage("Saving...");
    const response = await fetch("/api/admin/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...update }),
    });
    const data = await response.json().catch(() => null) as { items?: EditableInventoryItem[]; error?: string } | null;
    if (!response.ok || !data?.items) {
      setMessage(data?.error || "The inventory item could not be saved.");
      setSavingId(null);
      return;
    }
    setItems(data.items);
    setMessage("Saved.");
    setSavingId(null);
  }

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Total items</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">{items.length}</p>
        </div>
        <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Not completed</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">{open}</p>
        </div>
        <div className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gold-ink)]">Completed</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">{completed}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 border border-[var(--gold-light)] bg-[#FAF8F3] p-4 lg:grid-cols-3">
        <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
          Show
          {/* Sized to their labels rather than to three equal thirds. Forced
              into a third, "Not completed" — uppercase, letter-spaced — was
              wider than its column and ran outside the border. */}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilter("open")} className={`whitespace-nowrap border px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] ${filter === "open" ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold-light)] text-[var(--navy)]"}`}>Not completed</button>
            <button type="button" onClick={() => setFilter("complete")} className={`whitespace-nowrap border px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] ${filter === "complete" ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold-light)] text-[var(--navy)]"}`}>Completed</button>
            <button type="button" onClick={() => setFilter("all")} className={`whitespace-nowrap border px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] ${filter === "all" ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--gold-light)] text-[var(--navy)]"}`}>All</button>
          </div>
        </div>
        <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Area
          <select value={area} onChange={(event) => setArea(event.target.value as InventoryArea | "All")} className="mt-2 w-full border border-[var(--gold-light)] bg-white px-3 py-3 text-sm font-normal normal-case tracking-normal text-stone-700">
            {areaOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="mt-2 w-full border border-[var(--gold-light)] bg-white px-3 py-3 text-sm font-normal normal-case tracking-normal text-stone-700">
            <option value="completion">Completion</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="route">Page / route</option>
          </select>
        </label>
      </div>

      {message && <p className="mt-4 text-sm leading-6 text-stone-600">{message}</p>}

      <div className="mt-6 space-y-4">
        {visibleItems.map((item) => (
          <article key={item.id} className="border border-[var(--gold-light)] bg-[#FAF8F3] p-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_14rem]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(item.status)}`}>{inventoryStatusLabel(item.status)}</span>
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">{item.priority} priority</span>
                  <span className="text-xs text-stone-500">{item.area}</span>
                </div>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{item.title}</h2>
                <p className="mt-1 font-mono text-sm text-stone-500">{item.route}</p>
                <p className="mt-4 text-sm leading-6 text-stone-700"><strong>Missing:</strong> {item.missing}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700"><strong>Next:</strong> {item.nextAction}</p>
              </div>
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Status
                  <select value={item.status} disabled={!configured || savingId === item.id} onChange={(event) => updateItem(item.id, { status: event.target.value as InventoryStatus })} className="mt-2 w-full border border-[var(--gold-light)] bg-white px-3 py-3 text-sm font-normal normal-case tracking-normal text-stone-700 disabled:opacity-60">
                    {inventoryStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">Owner notes / missing info you have
              <textarea defaultValue={item.ownerNotes ?? ""} disabled={!configured || savingId === item.id} onBlur={(event) => updateItem(item.id, { ownerNotes: event.currentTarget.value })} rows={3} className="mt-2 w-full resize-y border border-[var(--gold-light)] bg-white px-3 py-3 text-sm font-normal normal-case tracking-normal text-stone-700 outline-none focus:border-[var(--gold)] disabled:opacity-60" placeholder="Add what is missing, who to call, where the information came from, or what should be updated next." />
            </label>
            {item.updatedAt && <p className="mt-3 text-xs text-stone-500">Last edited {new Date(item.updatedAt).toLocaleString()}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
