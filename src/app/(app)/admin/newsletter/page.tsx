import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { requireAdmin } from "@/lib/roster-data";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { buildNewsletter } from "@/lib/newsletter";

export const metadata: Metadata = { title: "Weekly newsletter" };

/** This week's newsletter as the signed-in admin's family would get it. */
export default async function NewsletterPreviewPage() {
  const me = await requireAdmin();
  const n = adminConfigured() ? await buildNewsletter(createAdminClient(), me.id) : null;
  return (
    <>
      <BackLink href="/admin#newsletter" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">This week&apos;s newsletter</h1>
      {n ? (
        <>
          <p className="-mt-1 text-sm text-muted">
            As your family would get it. Subject: <b className="text-ink">{n.subject}</b>
          </p>
          <iframe title="Newsletter preview" srcDoc={n.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-[75vh] w-full rounded-2xl border border-line bg-white" />
        </>
      ) : (
        <p className="card text-sm text-muted">The server&apos;s secret key isn&apos;t set, so the newsletter can&apos;t be built here.</p>
      )}
    </>
  );
}
