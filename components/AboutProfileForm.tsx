"use client";

import { useActionState, useState } from "react";
import { EMPTY_ABOUT_PROFILE, type AboutProfile } from "@/data/about-profile";
import { aboutProfileProblem } from "@/lib/about-profile";
import { saveAboutProfileAction } from "@/app/admin/settings/about/actions";

const input =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";

/**
 * Fill in the personal half of About without a deploy.
 * Leave a field blank and it stays off the public page.
 */
export default function AboutProfileForm({
  current,
  storeReady,
}: {
  current: AboutProfile;
  storeReady: boolean;
}) {
  const [state, save, saving] = useActionState(saveAboutProfileAction, null);
  const [values, setValues] = useState<AboutProfile>({ ...EMPTY_ABOUT_PROFILE, ...current });
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");

  const problem = aboutProfileProblem(values);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setUploadNote("");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      setUploading(false);
      setUploadNote("Could not read that file.");
      return;
    }
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setUploadNote(data.error || "That upload did not work. Try a smaller JPEG or PNG.");
        return;
      }
      setValues((v) => ({ ...v, photoUrl: data.url! }));
      setUploadNote("Picture uploaded. Add a short alt description below, then save.");
    } catch {
      setUploadNote("That upload did not work. Check the connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  if (!storeReady) {
    return (
      <p className="mt-8 border border-[var(--gold-light)] bg-[#FAF8F3] px-4 py-3 text-sm leading-6 text-stone-600">
        The private store is not connected, so nothing can be saved yet. The About page will keep the general
        introduction until this is connected.
      </p>
    );
  }

  return (
    <form action={save} className="mt-8 space-y-6 border border-[var(--gold-light)] bg-white p-6">
      <p className="max-w-2xl text-sm leading-6 text-stone-600">
        Leave any field blank and it will not appear on the public About page. Do not invent years, client counts, or
        credentials. A photograph needs accessible alt text before it can be saved.
      </p>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Name</span>
        <input name="name" className={input} value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
      </label>

      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Photograph</span>
        <input type="hidden" name="photoUrl" value={values.photoUrl} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer border border-[var(--gold)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)]">
            {uploading ? "Uploading…" : "Choose a picture"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
          </label>
          {values.photoUrl && (
            <button
              type="button"
              className="text-xs font-semibold text-stone-600 underline"
              onClick={() => setValues((v) => ({ ...v, photoUrl: "", photoAlt: "" }))}
            >
              Remove picture
            </button>
          )}
        </div>
        {values.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={values.photoUrl}
            alt={values.photoAlt || "Preview — add alt text below"}
            className="mt-3 aspect-[4/5] w-40 object-cover"
          />
        )}
        {uploadNote && <p className="mt-2 text-sm text-[var(--navy)]">{uploadNote}</p>}
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Photo description (alt text)</span>
        <input
          name="photoAlt"
          className={input}
          value={values.photoAlt}
          onChange={(e) => setValues((v) => ({ ...v, photoAlt: e.target.value }))}
          placeholder="e.g. Portrait of [name], travel planner"
        />
        <span className="mt-1 block text-xs text-stone-500">Required when a photograph is set. Shown to screen readers and if the image fails to load.</span>
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Location / service area</span>
        <input name="location" className={input} value={values.location} onChange={(e) => setValues((v) => ({ ...v, location: e.target.value }))} />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Travel &amp; kosher-planning experience</span>
        <textarea name="experience" rows={4} className={input} value={values.experience} onChange={(e) => setValues((v) => ({ ...v, experience: e.target.value }))} />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Languages</span>
        <input name="languages" className={input} value={values.languages} onChange={(e) => setValues((v) => ({ ...v, languages: e.target.value }))} />
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Why White Glove was created</span>
        <textarea name="whyCreated" rows={4} className={input} value={values.whyCreated} onChange={(e) => setValues((v) => ({ ...v, whyCreated: e.target.value }))} />
      </label>

      {problem && <p className="border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{problem}</p>}

      <button type="submit" disabled={saving || Boolean(problem)} className="border border-[var(--navy)] bg-[var(--navy)] px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save About details"}
      </button>
      {state && <span className={`ml-3 text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
    </form>
  );
}
