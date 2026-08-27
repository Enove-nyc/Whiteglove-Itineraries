"use client";

import { useActionState, useEffect, useState } from "react";
import { useOnActionSuccess } from "@/components/useOnActionSuccess";
import { resetPageAction, savePageAction, type ActionResult } from "@/app/admin/pages/actions";
import PageBlocks from "@/components/PageBlocks";
import {
  BLOCK_LABELS,
  blockSummary,
  emptyBlock,
  type BlockKind,
  type PageBlock,
} from "@/data/page-blocks";

// Editing a page as a stack of sections.
//
// Each section is one card: open it to change the words, or use the buttons to
// move it, copy it, hide it or take it away. Nothing here asks for Markdown, a
// slug, or a field name — the labels say what the thing is on the page.

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-[#fcfaf6] px-3 py-2.5 text-sm text-[var(--navy)] shadow-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";
const smallButton =
  "min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--navy)] transition hover:border-[var(--gold)] hover:bg-[var(--cream-deep)] disabled:opacity-30";
const primaryClass =
  "min-h-[44px] border border-[var(--navy)] bg-[var(--navy)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:border-[var(--gold)] hover:bg-[var(--gold)] disabled:opacity-60";
const secondaryClass =
  "min-h-[44px] border border-[var(--gold)] px-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--cream-deep)] disabled:opacity-60";

type Page = {
  slug: string;
  href: string;
  label: string;
  seoTitle: string;
  seoDescription: string;
  blocks: PageBlock[];
  edited: boolean;
  status: "PUBLISHED" | "DRAFT" | "NEEDS_REVIEW";
};

function Fields({ block, onChange }: { block: PageBlock; onChange: (b: PageBlock) => void }) {
  const patch = (p: Partial<PageBlock>) => onChange({ ...block, ...p } as PageBlock);

  switch (block.kind) {
    case "hero":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>Small line above the heading</span>
            <input value={block.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className={captionClass}>Heading</span>
            <input value={block.heading} onChange={(e) => patch({ heading: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className={captionClass}>Paragraph underneath</span>
            <textarea value={block.intro} onChange={(e) => patch({ intro: e.target.value })} rows={3} className={inputClass} />
          </label>
        </div>
      );

    case "text":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>Heading (leave empty for none)</span>
            <input value={block.heading ?? ""} onChange={(e) => patch({ heading: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className={captionClass}>Words</span>
            <textarea value={block.body} onChange={(e) => patch({ body: e.target.value })} rows={6} className={inputClass} />
            <span className="mt-1 block text-xs text-stone-500">
              An empty line starts a new paragraph. Start a line with &ldquo;- &rdquo; for a bullet point.
            </span>
          </label>
        </div>
      );

    case "cards":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>Heading above the cards</span>
            <input value={block.heading ?? ""} onChange={(e) => patch({ heading: e.target.value })} className={inputClass} />
          </label>
          {block.items.map((item, i) => (
            <div key={i} className="border border-[var(--gold-light)] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={captionClass}>Card {i + 1}</span>
                <button
                  type="button"
                  onClick={() => patch({ items: block.items.filter((_, j) => j !== i) })}
                  className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
              <input
                value={item.title}
                onChange={(e) => patch({ items: block.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                className={inputClass}
                placeholder="Title"
              />
              <textarea
                value={item.body}
                onChange={(e) => patch({ items: block.items.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })}
                rows={2}
                className={inputClass}
                placeholder="A line about it"
              />
            </div>
          ))}
          <button type="button" onClick={() => patch({ items: [...block.items, { title: "", body: "" }] })} className={smallButton}>
            Add a card
          </button>
        </div>
      );

    case "list":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>Heading above the list</span>
            <input value={block.heading ?? ""} onChange={(e) => patch({ heading: e.target.value })} className={inputClass} />
          </label>
          {block.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={item}
                onChange={(e) => patch({ items: block.items.map((x, j) => (j === i ? e.target.value : x)) })}
                className={`${inputClass} mt-0`}
              />
              <button type="button" onClick={() => patch({ items: block.items.filter((_, j) => j !== i) })} className={smallButton}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => patch({ items: [...block.items, ""] })} className={smallButton}>
            Add a point
          </button>
        </div>
      );

    case "image":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>Picture address</span>
            <input value={block.url} onChange={(e) => patch({ url: e.target.value })} className={inputClass} placeholder="https://…" />
          </label>
          <label className="block">
            <span className={captionClass}>Describe the picture</span>
            <input value={block.alt} onChange={(e) => patch({ alt: e.target.value })} className={inputClass} placeholder="For people who cannot see it" />
          </label>
          <label className="block">
            <span className={captionClass}>Caption</span>
            <input value={block.caption ?? ""} onChange={(e) => patch({ caption: e.target.value })} className={inputClass} />
          </label>
        </div>
      );

    case "buttons":
      return (
        <div className="grid gap-4">
          {block.items.map((item, i) => (
            <div key={i} className="grid gap-2 border border-[var(--gold-light)] bg-white p-4 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={item.label}
                onChange={(e) => patch({ items: block.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                className={inputClass}
                placeholder="What it says"
              />
              <input
                value={item.href}
                onChange={(e) => patch({ items: block.items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)) })}
                className={inputClass}
                placeholder="Where it goes"
              />
              <button type="button" onClick={() => patch({ items: block.items.filter((_, j) => j !== i) })} className={`${smallButton} mt-1.5`}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={() => patch({ items: [...block.items, { label: "", href: "", style: "solid" as const }] })} className={smallButton}>
            Add a button
          </button>
        </div>
      );

    case "quote":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>The line</span>
            <textarea value={block.text} onChange={(e) => patch({ text: e.target.value })} rows={2} className={inputClass} />
          </label>
          <label className="block">
            <span className={captionClass}>Who said it</span>
            <input value={block.attribution ?? ""} onChange={(e) => patch({ attribution: e.target.value })} className={inputClass} />
          </label>
        </div>
      );

    case "note":
      return (
        <div className="grid gap-4">
          <label className="block">
            <span className={captionClass}>The note</span>
            <textarea value={block.body} onChange={(e) => patch({ body: e.target.value })} rows={3} className={inputClass} />
          </label>
          <label className="block">
            <span className={captionClass}>How it looks</span>
            <select value={block.tone ?? "plain"} onChange={(e) => patch({ tone: e.target.value as "plain" | "warn" })} className={inputClass}>
              <option value="plain">Ordinary</option>
              <option value="warn">Something to be careful about</option>
            </select>
          </label>
        </div>
      );
  }
}

export default function BlockEditor({ page }: { page: Page }) {
  const [blocks, setBlocks] = useState<PageBlock[]>(page.blocks);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle);
  const [seoDescription, setSeoDescription] = useState(page.seoDescription);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<"off" | "desktop" | "mobile">("off");
  const [confirmReset, setConfirmReset] = useState(false);

  const [saveState, saveAction, savePending] = useActionState<ActionResult | null, FormData>(savePageAction, null);
  const [resetState, resetAction] = useActionState<ActionResult | null, FormData>(resetPageAction, null);

  // Nothing is saved until you press a button, so leaving with changes would
  // lose them silently.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // During render, not after the commit: as an effect the editor painted once
  // still marked dirty after a save had already succeeded, and the unload
  // warning below fired on a page with nothing left to lose.
  useOnActionSuccess([saveState], () => setDirty(false));

  const change = (next: PageBlock[]) => {
    setBlocks(next);
    setDirty(true);
  };
  const update = (id: string, b: PageBlock) => change(blocks.map((x) => (x.id === id ? b : x)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...blocks];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--navy)]">{page.label}</h2>
          <p className="mt-1 text-sm text-stone-600">
            <a href={page.href} target="_blank" rel="noreferrer" className="underline decoration-[var(--gold)] underline-offset-2">
              {page.href}
            </a>
            {page.edited ? " · you have edited this page" : " · showing the version it came with"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPreview(preview === "desktop" ? "off" : "desktop")} className={smallButton}>
            {preview === "desktop" ? "Hide preview" : "Preview"}
          </button>
          <button type="button" onClick={() => setPreview(preview === "mobile" ? "off" : "mobile")} className={smallButton}>
            {preview === "mobile" ? "Hide phone" : "On a phone"}
          </button>
        </div>
      </div>

      {preview !== "off" && (
        <div className="mt-5 border border-[var(--gold-light)] bg-white p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
            {preview === "mobile" ? "How it looks on a phone" : "How it looks on a computer"}
          </p>
          <div className={`${preview === "mobile" ? "mx-auto w-[390px]" : "w-full"} overflow-x-auto bg-[var(--cream)]`}>
            <div className={preview === "mobile" ? "origin-top scale-[0.85]" : ""}>
              <PageBlocks blocks={blocks} />
            </div>
          </div>
        </div>
      )}

      <ol className="mt-6 space-y-3">
        {blocks.map((block, i) => {
          const open = openId === block.id;
          return (
            <li key={block.id} className={`border bg-[#fcfaf6] ${block.hidden ? "border-dashed border-stone-300" : "border-[var(--gold-light)]"}`}>
              <div className="flex flex-wrap items-center gap-2 p-4">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : block.id)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gold-ink)]">
                    {BLOCK_LABELS[block.kind].label}
                    {block.hidden ? " · hidden" : ""}
                  </span>
                  <span className="mt-0.5 block truncate font-semibold text-[var(--navy)]">{blockSummary(block)}</span>
                </button>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className={smallButton}>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down" className={smallButton}>↓</button>
                <button
                  type="button"
                  onClick={() => change([...blocks.slice(0, i + 1), { ...block, id: `${block.kind}-${Math.random().toString(36).slice(2, 9)}` }, ...blocks.slice(i + 1)])}
                  className={smallButton}
                >
                  Copy
                </button>
                <button type="button" onClick={() => update(block.id, { ...block, hidden: !block.hidden })} className={smallButton}>
                  {block.hidden ? "Show" : "Hide"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm("Take this section off the page?")) return;
                    change(blocks.filter((x) => x.id !== block.id));
                  }}
                  className="min-h-[36px] border border-[var(--gold-light)] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 transition hover:border-red-400 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
              {open && <div className="border-t border-[var(--gold-light)] p-4">{<Fields block={block} onChange={(b) => update(block.id, b)} />}</div>}
            </li>
          );
        })}
      </ol>

      <div className="mt-4">
        {adding ? (
          <div className="border border-[var(--gold)] bg-[#fcfaf6] p-4">
            <p className={captionClass}>What kind of section?</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(BLOCK_LABELS) as BlockKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    const b = emptyBlock(kind);
                    change([...blocks, b]);
                    setOpenId(b.id);
                    setAdding(false);
                  }}
                  className="border border-[var(--gold-light)] bg-white p-3 text-left transition hover:border-[var(--gold)]"
                >
                  <span className="block font-semibold text-[var(--navy)]">{BLOCK_LABELS[kind].label}</span>
                  <span className="mt-1 block text-xs text-stone-500">{BLOCK_LABELS[kind].detail}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAdding(false)} className={`${smallButton} mt-3`}>
              Never mind
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={secondaryClass}>
            Add a section
          </button>
        )}
      </div>

      <details className="mt-8 border border-[var(--gold-light)] bg-[#fcfaf6] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--navy)]">
          What this page looks like in a search result
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className={captionClass}>Title in search results</span>
            <input value={seoTitle} onChange={(e) => { setSeoTitle(e.target.value); setDirty(true); }} className={inputClass} />
          </label>
          <label className="block">
            <span className={captionClass}>The line underneath</span>
            <textarea value={seoDescription} onChange={(e) => { setSeoDescription(e.target.value); setDirty(true); }} rows={2} className={inputClass} />
          </label>
        </div>
      </details>

      <form action={saveAction} onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name === "publish" && submitter.value === "1") {
          if (!window.confirm(`Publish “${page.label}”? Visitors will see this version.`)) event.preventDefault();
        }
      }} className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--gold-light)] pt-5">
        <input type="hidden" name="slug" value={page.slug} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <input type="hidden" name="seoTitle" value={seoTitle} />
        <input type="hidden" name="seoDescription" value={seoDescription} />
        <button type="submit" name="publish" value="1" disabled={savePending} className={primaryClass}>
          {savePending ? "Saving…" : "Publish"}
        </button>
        <button type="submit" name="publish" value="0" disabled={savePending} className={secondaryClass}>
          Save as a draft
        </button>
        {dirty && <span className="text-sm text-amber-800">You have unsaved changes.</span>}
        {page.status !== "PUBLISHED" && (
          <span className="text-sm text-stone-600">
            This page is a {page.status === "DRAFT" ? "draft" : "draft awaiting review"} — visitors see the previous version.
          </span>
        )}
      </form>

      {saveState && (
        <p role="status" className={`mt-3 text-sm font-semibold ${saveState.ok ? "text-emerald-700" : "text-red-700"}`}>
          {saveState.message}
        </p>
      )}

      {page.edited && (
        <div className="mt-6 border-t border-[var(--gold-light)] pt-5">
          {confirmReset ? (
            <form action={resetAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="slug" value={page.slug} />
              <span className="text-sm text-stone-700">Put this page back to how it started? Your edits will be gone.</span>
              <button type="submit" className="min-h-[36px] border border-red-400 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-red-700 transition hover:bg-red-50">
                Yes, undo everything
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className={smallButton}>
                Keep my edits
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500 underline underline-offset-4 hover:text-red-700">
              Put this page back to how it started
            </button>
          )}
          {resetState && (
            <p role="status" className={`mt-3 text-sm font-semibold ${resetState.ok ? "text-emerald-700" : "text-red-700"}`}>
              {resetState.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
