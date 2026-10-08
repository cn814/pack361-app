import type { Metadata } from "next";
import { Compass } from "lucide-react";
import BackLink from "@/components/BackLink";
import GeocachingOpen from "@/components/GeocachingOpen";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Geocaching" };

const TIPS = [
  "Go with a grown-up, and stay together.",
  "Trade fair: if you take something from a cache, leave something of equal or greater value.",
  "Trackables (travel bugs and coins) aren't for keeping: move them on to another cache, and log it.",
  "Sign the logbook, then put the cache back exactly how and where you found it.",
  "Leave No Trace: stay on trails, and don't dig or damage anything to find a cache.",
];

/**
 * Pack → Tools → Geocaching. The pack app doesn't show caches itself (Geocaching only shares its
 * data with approved partner apps); this sends families to the free official Geocaching app.
 */
export default async function GeocachingPage() {
  await requireMember();
  return (
    <>
      <BackLink href="/pack" label="Pack" />
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint text-pine">
          <Compass className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Geocaching</h1>
      </div>
      <p className="-mt-1 text-sm text-muted">
        A real-world treasure hunt: people hide small containers (&ldquo;caches&rdquo;) and post where they are. There are hundreds
        around Ellicott City and at most campgrounds. Great for den outings, hikes and campouts.
      </p>
      <section className="card space-y-3">
        <GeocachingOpen />
        <p className="text-xs text-muted">The official Geocaching app is free. A free basic account is all you need to find most caches.</p>
      </section>
      <section className="card space-y-2">
        <h2 className="section-title">Scout rules for the hunt</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink marker:text-sage">
          {TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
