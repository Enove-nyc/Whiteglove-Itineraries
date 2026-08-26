import type { Metadata } from "next";
import { headers } from "next/headers";
import AccessForm from "@/components/AccessForm";
import AdminShell from "@/components/AdminShell";
import IdleLogout from "@/components/IdleLogout";
import { currentAdmin } from "@/lib/admin-current";
import { adminLoginPath } from "@/lib/admin-host";

// The admin area is its own installable app: a separate "White Glove Admin"
// home-screen icon (scoped to /admin) that opens straight to the dashboard,
// distinct from the public app. This overrides the site-wide manifest here.
export const metadata: Metadata = {
  title: "White Glove Admin",
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "WG Admin" },
  icons: { icon: [{ url: "/icon-admin-192.png", sizes: "192x192", type: "image/png" }] },
  robots: { index: false, follow: false },
};

// Every admin screen sits inside the shell — five sections down the left, a
// search across listings, candidates and screens, no visitor navigation and
// no public footer. Auto sign-out after 20 minutes of inactivity, so /admin
// asks for the code again rather than staying open on a shared screen.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The middleware already blocks these paths. This checks again anyway,
  // because middleware is routing, not authorisation — anything that stops it
  // running (a matcher change, a basePath, a platform-level bypass) would
  // otherwise serve every visitor account's name, email and phone number
  // straight out of /admin/accounts. Next's own documentation in this repo says
  // not to rely on it as the only boundary.
  //
  // It renders the sign-in rather than redirecting: this layout also wraps
  // /admin/login, and redirecting there from here would loop forever.
  const { identity, areas } = await currentAdmin();
  const host = (await headers()).get("host")?.toLowerCase().split(":")[0] ?? "";
  const configured = process.env.ADMIN_HOST?.trim().toLowerCase().split(":")[0] ?? "";
  const onAdminHost = Boolean(configured && host === configured);
  const loginHref = adminLoginPath(onAdminHost);
  if (!identity) {
    return (
      <main className="flex min-h-screen flex-col bg-[var(--cream)]">
        <div className="grid flex-1 place-items-center px-5 py-16">
          <section className="w-full max-w-md border border-[var(--gold-light)] bg-[#fcfaf6] p-8 shadow-[0_12px_30px_rgba(23,45,82,.08)] sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove Kosher Travel</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Owner&apos;s dashboard</h1>
            <p className="mt-5 leading-7 text-stone-600">Private access for website activity and launch controls.</p>
            <AccessForm scope="admin" />
          </section>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* The navigation is drawn from what this person may open, so a
          restricted helper is never shown a door that refuses them. The
          refusing itself is done by the gate inside each area's folder — this
          only decides what to draw. */}
      <AdminShell areas={areas}>{children}</AdminShell>
      {/* TWO HOURS, up from twenty minutes.
          Twenty was the single biggest reason the owner was signing in "too
          many times a day": step away to answer the phone, come back, sign in
          again. It is still the control that protects a session left open on a
          machine he walked away from, which is the realistic risk here — that
          does not need to fire in twenty minutes to work. The session cookie
          caps it at twelve hours regardless (app/api/access/route.ts). */}
      <IdleLogout minutes={120} endpoint="/api/admin/logout" redirectTo={loginHref} />
    </>
  );
}
