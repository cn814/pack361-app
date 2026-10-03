import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, Compass, Mail, MapPin, Tent, Users } from "lucide-react";
import { getJoinEvents, joinEventWhen } from "@/lib/recruiting";
import GuideBody from "@/components/GuideBody";
import { getPublicPage, getPublicPages } from "@/lib/guide";
import JoinShell from "./JoinShell";
import { BANNER, PHOTOS, STRIP } from "./photos";

// The public face of the pack (pack361.org). Everything else in the app needs a sign-in.
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Cub Scout Pack 361 · Ellicott City, MD" },
  description:
    "Pack 361 is a co-ed Cub Scout pack for grades K–5 serving Centennial Lane Elementary School and the Ellicott City area. Camping, Pinewood Derby, friends and adventure.",
  robots: { index: true, follow: true },
  manifest: null, // the public site isn't the installable members' app
  appleWebApp: null,
  alternates: { canonical: "https://pack361.org/" },
  openGraph: {
    title: "Cub Scout Pack 361 · Ellicott City, MD",
    description: "Adventure. Friendship. Leadership. A co-ed Cub Scout pack for grades K–5.",
    url: "https://pack361.org/",
    siteName: "Cub Scout Pack 361",
    type: "website",
    ...(BANNER ? { images: [BANNER.src] } : {}),
  },
};

const PILLARS = [
  {
    icon: Tent,
    title: "Outdoor adventure",
    text: "Family camping trips, rocket launches, the Pinewood Derby, hikes and plenty of hands-on activities.",
  },
  {
    icon: Users,
    title: "Lifelong friends",
    text: "Scouts build friendships in their den and across the pack, in a community that welcomes the whole family.",
  },
  {
    icon: Compass,
    title: "Character & leadership",
    text: "Along the Adventure Trail, scouts gain confidence, citizenship and life skills that last.",
  },
];

export default async function JoinPage() {
  const [page, others, events] = await Promise.all([getPublicPage("join"), getPublicPages(), getJoinEvents()]);
  const more = others.filter((p) => p.slug !== "join");
  return (
    <JoinShell>
      <section className="card overflow-hidden p-0">
        {BANNER ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={BANNER.src} alt={BANNER.alt} width={BANNER.width} height={BANNER.height} className="h-auto w-full" />
        ) : (
          <div className="h-1.5 bg-brand" />
        )}
        <div className="space-y-3 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Cub Scouts · Pack 361 · Ellicott City, MD</p>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-pine-950 sm:text-4xl">
            Adventure. Friendship. Leadership.
          </h1>
          <p className="max-w-2xl text-ink">
            Pack 361 is a co-ed Cub Scout pack for grades K–5, serving Centennial Lane Elementary School in Ellicott City
            and the surrounding area for over 35 years. We meet Monday evenings at the First Presbyterian Church of Howard
            County in Columbia.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href="#join" className="btn-primary py-2.5">
              How to join <ChevronRight className="h-4 w-4" aria-hidden />
            </a>
            <a href="mailto:info@pack361.org" className="btn-ghost py-2.5">
              <Mail className="h-4 w-4" aria-hidden /> Email us
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card space-y-1.5">
            <Icon className="h-6 w-6 text-pine" aria-hidden />
            <h2 className="font-extrabold text-pine-950">{title}</h2>
            <p className="text-sm text-ink">{text}</p>
          </div>
        ))}
      </section>

      {events.length > 0 && (
        <section className="card space-y-3 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Come see us</p>
          <h2 className="text-2xl font-extrabold tracking-tight text-pine-950">Big events coming up</h2>
          <p className="text-sm text-ink">
            Families thinking about joining are welcome at these. Email{" "}
            <a href="mailto:info@pack361.org" className="font-semibold text-pine underline">info@pack361.org</a> and we&apos;ll
            send you the details.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <li key={`${e.title}-${e.starts_at}`} className="rounded-2xl border border-line bg-surface-low p-4">
                <p className="font-extrabold text-pine-950">{e.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                  <CalendarDays className="h-4 w-4 shrink-0 text-pine" aria-hidden /> {joinEventWhen(e)}
                </p>
                {e.location_name && (
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    <MapPin className="h-4 w-4 shrink-0 text-pine" aria-hidden /> {e.location_name}
                  </p>
                )}
                {e.public_blurb && <p className="mt-2 text-sm text-muted">{e.public_blurb}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {STRIP && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={STRIP.src} alt={STRIP.alt} width={STRIP.width} height={STRIP.height} loading="lazy" className="h-auto w-full rounded-2xl" />
      )}

      {PHOTOS.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PHOTOS.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.src} src={p.src} alt={p.alt} width={p.width} height={p.height} loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
          ))}
        </section>
      )}

      <section id="join" className="card scroll-mt-4 space-y-3 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sage">Ready to join or new to the pack?</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-pine-950">{page?.title ?? "Joining Pack 361"}</h2>
        {page ? (
          <GuideBody body={page.body} />
        ) : (
          <p className="text-ink">
            Any child in kindergarten through 5th grade can join. Email{" "}
            <a href="mailto:info@pack361.org" className="font-semibold text-pine underline">info@pack361.org</a> and a
            pack leader will help you get started, or apply online at{" "}
            <a href="https://beascout.scouting.org/" className="font-semibold text-pine underline" target="_blank" rel="noopener noreferrer">
              BeAScout.org
            </a>
            .
          </p>
        )}
      </section>

      {more.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">More about the pack</h2>
          <ul className="divide-y divide-line">
            {more.map((p) => (
              <li key={p.slug}>
                <Link href={`/join/${p.slug}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="block font-bold text-pine-950">{p.title}</span>
                    {p.summary && <span className="block text-xs text-muted">{p.summary}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card flex flex-col gap-2 border-l-4 border-l-pine sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-extrabold text-pine-950">Already in the pack?</h2>
          <p className="text-sm text-muted">The calendar, campouts, RSVPs and pack news are in the members&apos; app.</p>
        </div>
        <Link href="/login" className="btn-primary py-2.5">
          Member sign in <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </JoinShell>
  );
}
