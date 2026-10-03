import type { Metadata } from "next";
import Link from "next/link";
import {
  Award,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  HandCoins,
  HandHeart,
  Images,
  Landmark,
  Megaphone,
  Phone,
  Popcorn,
  Receipt,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Stamp,
  Tent,
  UserPlus,
  Vote,
  type LucideIcon,
} from "lucide-react";
import ModeSwitch from "@/components/ModeSwitch";
import { isCommittee, requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { canLead, getMode } from "@/lib/mode";
import { getMyCharges, totalDue } from "@/lib/payments";
import { fmtMoney } from "@/lib/money";
import { countWaitingRequests } from "@/lib/finance-data";
import { countWaitingJoins } from "@/lib/roster-data";
import { getTodos } from "@/lib/inbox";

export const metadata: Metadata = { title: "Pack" };

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  note?: string;
  /** Gold note: something needs doing. */
  alert?: boolean;
}

/** One menu for everything that isn't Home, Calendar, Scouts or Me. */
export default async function PackPage() {
  const me = await requireMember();
  const mode = await getMode(me);
  const leader = mode === "leader";
  const committee = isCommittee(me);
  const admin = isAdmin(me);
  const [charges, waiting, joins, todos] = await Promise.all([
    getMyCharges(me),
    leader && committee ? countWaitingRequests() : Promise.resolve(null),
    leader && admin ? countWaitingJoins() : Promise.resolve(0),
    leader ? getTodos() : Promise.resolve([]),
  ]);
  const due = totalDue(charges);
  const todo = (key: string) => todos.find((t) => t.key === key);

  const money: Item[] = [
    { href: "/pay", label: "Pay the pack", icon: HandCoins, note: due > 0 ? `${fmtMoney(due)} due` : undefined, alert: due > 0 },
    { href: "/reimburse", label: "Get paid back", icon: Receipt, note: "For things you bought for the pack" },
  ];
  const store: Item[] = [
    { href: "/store/popcorn", label: "Popcorn fundraiser", icon: Popcorn, note: "Trail's End" },
    { href: "/store", label: "Pack apparel and fundraisers", icon: Shirt },
    { href: "/store", label: "Uniforms and badges", icon: ShoppingBag, note: "Scout Shop" },
  ];
  const info: Item[] = [
    { href: "/guide", label: "Pack guide", icon: BookOpen },
    { href: "/documents", label: "Documents", icon: FolderOpen },
    { href: "/gear", label: "Gear closet", icon: Tent, note: "Borrow tents and camp gear" },
    { href: "/photos", label: "Photos", icon: Images },
    { href: "/polls", label: "Polls", icon: Vote },
    { href: "/inbox", label: "News and messages", icon: Megaphone },
  ];
  const people: Item[] = [
    { href: "/leaders", label: "Leader contacts", icon: Phone },
    { href: "/recruit", label: "Invite a family", icon: UserPlus },
    { href: "/help-wanted", label: "Help wanted", icon: HandHeart, note: "Grown-up jobs the pack needs this year" },
  ];

  const toHandle = waiting ? waiting.toReview + waiting.toPay : 0;
  const payments = todo("payments-reported");
  const training = todo("training-import");
  const tools: Item[] = [
    ...(committee
      ? [
          { href: "/leaders/money", label: "Money", icon: HandCoins, note: payments?.title, alert: Boolean(payments) },
          {
            href: "/leaders/money/expenses",
            label: "Expenses and reports",
            icon: Receipt,
            note: toHandle ? `${toHandle} to handle` : undefined,
            alert: toHandle > 0,
          },
        ]
      : []),
    { href: "/scouts/review", label: "Approvals and Scoutbook", icon: Stamp },
    { href: "/scouts/awards", label: "Awards to hand out", icon: Award },
    { href: "/leaders/training", label: "Training", icon: ShieldCheck, note: training ? "Import due" : undefined, alert: Boolean(training) },
    { href: "/leaders/paperwork", label: "Medical forms", icon: FileText },
    { href: "/leaders/attendance", label: "Attendance", icon: ClipboardCheck },
    { href: "/gear/manage", label: "Gear requests", icon: Tent },
    { href: "/events/council", label: "Council events", icon: Landmark },
  ];

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack</h1>
      {canLead(me) && (
        <div className="lg:hidden">
          <ModeSwitch mode={mode} />
        </div>
      )}

      {leader && (
        <section className="space-y-2">
          <SectionTitle>Leader tools</SectionTitle>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {tools.map((t) => (
              <Link key={t.href} href={t.href} className="card flex min-h-[4.25rem] flex-col justify-center gap-0.5 py-3">
                <span className="flex items-center gap-2 text-[15px] font-extrabold text-pine-950">
                  <t.icon className="h-4 w-4 shrink-0 text-pine" aria-hidden /> {t.label}
                </span>
                {t.note && <span className={`text-xs ${t.alert ? "font-bold text-gold-800" : "text-muted"}`}>{t.note}</span>}
              </Link>
            ))}
          </div>
          {admin && (
            <Link href="/admin" className="flex min-h-12 items-center gap-3 rounded-2xl bg-deep px-4 py-3 text-white">
              <ShieldCheck className="h-5 w-5 text-gold" aria-hidden />
              <span className="flex-1 font-extrabold">Pack admin</span>
              {joins > 0 && (
                <span className="text-xs font-bold text-gold">
                  {joins} asking to join
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-mint-200" aria-hidden />
            </Link>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Group title="Money" items={money} />
        <Group title="Fundraisers and store" items={store} />
        <Group title="Pack info" items={info} />
        <Group title="People" items={people} />
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">{children}</h2>;
}

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      <ul className="card divide-y divide-line p-0">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
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
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
