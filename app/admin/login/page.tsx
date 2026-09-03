import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccessForm from "@/components/AccessForm";
import Footer from "@/components/Footer";
import { currentAdmin } from "@/lib/admin-current";
import { publicAdminHref, safeAdminNext } from "@/lib/admin-host";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { identity } = await currentAdmin();
  const { next } = await searchParams;
  const host = (await headers()).get("host")?.toLowerCase().split(":")[0] ?? "";
  const configured = process.env.ADMIN_HOST?.trim().toLowerCase().split(":")[0] ?? "";
  const onAdminHost = Boolean(configured && host === configured);
  if (identity) redirect(publicAdminHref(safeAdminNext(next), onAdminHost));

  return (
    <main className="flex min-h-screen flex-col bg-[var(--cream)]">
      <div className="grid flex-1 place-items-center px-5 py-16">
        <section className="w-full max-w-md border border-[var(--gold-light)] bg-[#FAF8F3] p-8 shadow-[0_12px_30px_rgba(16, 47, 53,.08)] sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--gold-ink)]">White Glove Kosher Travel</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-[var(--navy)]">Owner&apos;s dashboard</h1>
          <p className="mt-5 leading-7 text-stone-600">Private access for website activity and launch controls.</p>
          <AccessForm scope="admin" next={next} />
        </section>
      </div>
      <Footer />
    </main>
  );
}
