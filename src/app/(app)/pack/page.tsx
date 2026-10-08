import type { Metadata } from "next";
import Link from "next/link";
import { Bird, BookOpen, ChevronRight, Compass, FolderOpen, HandCoins, HandHeart, Images, Megaphone, Phone, Popcorn, Receipt, Shirt, ShoppingBag, Tent, type LucideIcon, UserPlus, Vote } from "lucide-react";
import EventTabs from "@/components/EventTabs";
import { requireMember } from "@/lib/data";
import { getMyCharges, totalDue } from "@/lib/payments";
import { fmtMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Pack" };

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  note?: string;
  /** Gold note: something needs doing. */
  alert?: boolean;
  /** A file (the app guide PDF): opens in a new window, outside the app's page changes. */
  file?: boolean;
}

/**
 * Everything that isn't Home, Calendar, Scouts or Leaders, in sections one tap apart: Money,
 * Fundraisers, Tools, Info and People. (Leader tools are on the Leaders tab.)
 */
export default async function PackPage() {
  const me = await requireMember();
  const due = totalDue(await getMyCharges(me));

  const money: Item[] = [
    { href: "/pay", label: "Pay the pack", icon: HandCoins, note: due > 0 ? `${fmtMoney(due)} due` : undefined, alert: due > 0 },
    { href: "/reimburse", label: "Get paid back", icon: Receipt, note: "For things you bought for the pack" },
  ];
  const store: Item[] = [
    { href: "/store/popcorn", label: "Popcorn fundraiser", icon: Popcorn, note: "Trail's End" },
    { href: "/store", label: "Pack apparel and fundraisers", icon: Shirt },
    { href: "/store", label: "Uniforms and badges", icon: ShoppingBag, note: "Scout Shop" },
  ];
  const tools: Item[] = [
    { href: "/nature", label: "Nature ID", icon: Bird, note: "Name a bird by its song, or a plant from a photo" },
    { href: "/geocaching", label: "Geocaching", icon: Compass, note: "Treasure hunting with the official Geocaching app" },
    { href: "/gear", label: "Gear closet", icon: Tent, note: "Borrow tents and camp gear" },
    { href: "/polls", label: "Polls", icon: Vote },
    { href: "/inbox", label: "News and messages", icon: Megaphone },
  ];
  const info: Item[] = [
    { href: "/guide", label: "Pack guide", icon: BookOpen },
    { href: "/app-guide", label: "How to use this app", icon: BookOpen, note: "The app guide (PDF), always the latest", file: true },
    { href: "/documents", label: "Documents", icon: FolderOpen },
  ];
  const people: Item[] = [
    { href: "/leaders", label: "Leader contacts", icon: Phone },
    { href: "/recruit", label: "Invite a family", icon: UserPlus },
    { href: "/help-wanted", label: "Help wanted", icon: HandHeart, note: "Grown-up jobs the pack needs this year" },
  ];

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack</h1>
      <EventTabs
        label="Pack sections"
        backLabel="Pack"
        tabs={[
          { id: "money", label: "Money", hint: due > 0 ? `${fmtMoney(due)} due` : "Pay the pack, get paid back", icon: <HandCoins aria-hidden />, content: <Group items={money} /> },
          { id: "fundraisers", label: "Fundraisers", hint: "Popcorn, apparel, uniforms", icon: <Popcorn aria-hidden />, content: <Group items={store} /> },
          { id: "tools", label: "Tools", hint: "Nature ID, geocaching, gear, polls, news", icon: <Bird aria-hidden />, content: <Group items={tools} /> },
          { id: "photos", label: "Photos", hint: "See and add pack photos", icon: <Images aria-hidden />, href: "/photos" },
          { id: "info", label: "Info", hint: "Pack guide, app guide, documents", icon: <BookOpen aria-hidden />, content: <Group items={info} /> },
          { id: "people", label: "People", hint: "Leader contacts, invite a family, help wanted", icon: <Phone aria-hidden />, content: <Group items={people} /> },
        ]}
      />
    </>
  );
}

function Group({ items }: { items: Item[] }) {
  return (
    <section>
      <ul className="card divide-y divide-line p-0">
        {items.map((i) => (
          <li key={i.label}>
            <MaybeFile href={i.href} file={i.file} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i.alert ? "bg-gold-50" : "bg-mint"}`}>
                <i.icon className={`h-[18px] w-[18px] ${i.alert ? "text-gold-800" : "text-pine"}`} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{i.label}</span>
                {i.note && !i.alert && <span className="block truncate text-xs text-muted">{i.note}</span>}
              </span>
              {i.note && i.alert ? (
                <span className="shrink-0 rounded-full bg-gold-50 px-2 py-0.5 text-xs font-extrabold text-gold-800">{i.note}</span>
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              )}
            </MaybeFile>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A page link, or for a file a plain link that opens in a new window. */
function MaybeFile({ href, file, className, children }: { href: string; file?: boolean; className: string; children: React.ReactNode }) {
  return file ? (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
