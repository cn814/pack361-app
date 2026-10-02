import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import FeedbackForm from "@/components/FeedbackForm";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Report a problem" };

export default async function HelpPage() {
  await requireMember();
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Report a problem or send a note</h1>
      <div id="feedback">
        <FeedbackForm page="Me" />
      </div>
      <p className="text-xs text-muted">
        Questions about the pack itself? See the{" "}
        <Link href="/guide" className="font-bold text-pine underline">
          Pack guide
        </Link>{" "}
        or email{" "}
        <a className="font-bold text-pine underline" href="mailto:info@pack361.org">
          info@pack361.org
        </a>
        .
      </p>
    </>
  );
}
