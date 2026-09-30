import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Photo rules" };

export default async function PhotoRulesPage() {
  await requireMember();
  const settings = await getSettings();
  const rules = [
    "Only signed-in Pack 361 families and leaders can see the album. Photos are never public, and search engines can't reach them.",
    "Each family decides whether their scout may appear in pack photos (My family → Pack photo album). Until a family answers, the answer is no.",
    "A leader checks every photo from a parent before it appears, and turns down any photo showing a scout without permission.",
    "No names on photos: captions use first names only, and we don't post photos where a full name, school or home address can be read.",
    "Photos are resized and their location (GPS) and camera data are removed before they're stored.",
    "Anyone can request that a photo be removed (Request removal on the photo). It's hidden right away, and a leader removes it. Only leaders delete photos, so nothing disappears by accident.",
    `Photos are deleted automatically after ${settings.photo_keep_months} months.`,
    "Please keep pack photos within the pack: don't repost them on public social media.",
  ];
  return (
    <>
      <BackLink href="/photos" label="Pack photos" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Photo rules</h1>
      <p className="-mt-2 text-sm text-muted">
        Based on Scouting America&apos;s Youth Protection and social media guidance for units.
      </p>
      <ol className="card list-decimal space-y-2 pl-9 text-sm text-ink marker:font-bold marker:text-pine">
        {rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      <p className="text-center text-xs text-muted">
        Questions or a concern about a photo? Email{" "}
        <a className="font-semibold text-pine underline" href="mailto:info@pack361.org">
          info@pack361.org
        </a>
        .
      </p>
    </>
  );
}
