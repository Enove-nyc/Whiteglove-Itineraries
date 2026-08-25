"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AvatarCircle from "@/components/AvatarCircle";

const inputClass =
  "mt-1.5 w-full rounded-md border border-[var(--gold-light)] bg-white px-3 py-2.5 text-sm text-[var(--navy)] transition focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-light)]";
const captionClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500";

export default function AccountSettings({
  initial,
}: {
  initial: { name?: string; email: string; phone?: string; avatarMediaId?: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [avatarId, setAvatarId] = useState(initial.avatarMediaId ?? "");
  const [avatarMessage, setAvatarMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Chosen, uploaded, done — same file twice must still fire onChange.
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setAvatarMessage(null);
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      setAvatarBusy(false);
      setAvatarMessage({ ok: false, text: "Could not read that file." });
      return;
    }
    const response = await fetch("/api/account/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const data = await response.json().catch(() => null);
    setAvatarBusy(false);
    if (!response.ok || !data?.avatarMediaId) {
      setAvatarMessage({ ok: false, text: data?.error || "Could not save the picture." });
      return;
    }
    setAvatarId(data.avatarMediaId);
    setAvatarMessage({ ok: true, text: "Saved" });
    router.refresh();
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarMessage(null);
    const response = await fetch("/api/account/avatar", { method: "DELETE" });
    setAvatarBusy(false);
    if (!response.ok) {
      setAvatarMessage({ ok: false, text: "Could not remove the picture." });
      return;
    }
    setAvatarId("");
    setAvatarMessage({ ok: true, text: "Removed" });
    router.refresh();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    // A network failure used to leave the button stuck on "Saving…" with no
    // message. try/catch/finally reports it and always frees the button.
    try {
      const response = await fetch("/api/account/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ ok: false, text: data?.error || "Could not save your changes." });
        return;
      }
      setMessage({ ok: true, text: "Saved" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Could not reach the server. Please check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount() {
    if (!window.confirm("Delete your account permanently? Everything saved to it will be erased. This can't be undone.")) return;
    setDeleting(true);
    setMessage(null);
    const response = await fetch("/api/account/delete", { method: "POST" });
    if (response.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setDeleting(false);
    setMessage({ ok: false, text: "Could not delete the account. Please try again." });
  }

  return (
    <div className="wg-card border border-[var(--gold-light)] bg-[#fcfaf6] p-6 sm:p-8">
      <div className="flex flex-wrap items-start gap-5">
        <AvatarCircle name={name || undefined} imageUrl={avatarId ? `/api/media?id=${encodeURIComponent(avatarId)}` : undefined} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-stone-600">Your picture appears beside reviews you publish. Nowhere else.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* The input itself stays hidden; the button is the control, so it
                can meet the touch-target size a bare file input never does. */}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="min-h-11 rounded-md border border-[var(--gold)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white disabled:opacity-50"
            >
              {avatarBusy ? "Uploading…" : avatarId ? "Change picture" : "Add picture"}
            </button>
            {avatarId && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarBusy}
                className="min-h-11 rounded-md border border-[var(--gold-light)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-600 transition hover:border-[var(--gold)] hover:text-[var(--navy)] disabled:opacity-50"
              >
                Remove
              </button>
            )}
            {avatarMessage && (
              <span className={`text-sm font-semibold ${avatarMessage.ok ? "text-emerald-700" : "text-red-700"}`}>{avatarMessage.text}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 rounded-md border border-[var(--gold)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--navy)] transition hover:bg-[var(--navy)] hover:text-white"
        >
          {open ? "Close" : "Edit details"}
        </button>
      </div>

      {open && (
      <>
      <form onSubmit={save} className="mt-6 grid gap-4 border-t border-[var(--gold-light)] pt-6 sm:grid-cols-2">
        <label className="block">
          <span className={captionClass}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Your name" className={inputClass} />
        </label>
        <label className="block">
          <span className={captionClass}>Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+1 ..." className={inputClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className={captionClass}>What you sign in with</span>
          {/* Not type="email": an account can be named by a phone number, and
              the browser would refuse to submit a perfectly good one. */}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="text" autoComplete="username" required className={inputClass} />
          <span className="mt-1 block text-xs text-stone-400">
            An email address or a phone number. Changing it changes what you sign in with.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-md bg-[var(--navy)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[var(--gold)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {message && (
            <span className={`text-sm font-semibold ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span>
          )}
        </div>
      </form>

      <div className="mt-8 border-t border-[var(--gold-light)] pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">Delete account</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          Permanently remove your account and everything saved to it. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={removeAccount}
          disabled={deleting}
          className="mt-4 min-h-11 rounded-md border border-red-300 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-red-700 transition hover:bg-red-700 hover:text-white disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}
