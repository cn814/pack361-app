import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import ContactForm from "@/components/ContactForm";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "My contact info" };

export default async function ContactPage() {
  const me = await requireMember();
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">My contact info</h1>
      <section className="card space-y-3">
        <ContactForm phone={me.phone} preferred={me.preferred_name} />
      </section>
      <p className="text-xs text-muted">
        To change your email (it&apos;s how you sign in), email{" "}
        <a className="font-bold text-pine underline" href="mailto:app@pack361.org">
          app@pack361.org
        </a>
        .
      </p>
    </>
  );
}
