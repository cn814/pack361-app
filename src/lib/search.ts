import "server-only";
import { createClient } from "./supabase/server";
import { getLeaders, getUpcomingEvents, isCommittee, isLeader } from "./data";
import { getReviewableScouts, isAdmin } from "./advancement-data";
import type { Adult } from "./types";

// "Search the pack": the app's own pages (by what people call things), upcoming events, guide
// pages, documents, leader contacts, and (for leaders) scouts. Everything is read as the person
// searching, so the database only returns what they're allowed to see.

export interface Hit {
  href: string;
  title: string;
  detail?: string;
}
export interface SearchResults {
  pages: Hit[];
  events: Hit[];
  guide: Hit[];
  documents: Hit[];
  people: Hit[];
  scouts: Hit[];
}

type Who = "all" | "leader" | "committee" | "admin";
/** The app's places, with the words people might type for them. */
const PLACES: { href: string; title: string; words: string; who?: Who }[] = [
  { href: "/pay", title: "Pay the pack", words: "pay dues fees money payment owe givebutter paypal" },
  { href: "/reimburse", title: "Get paid back", words: "reimburse reimbursement receipt bought refund expense" },
  { href: "/store/popcorn", title: "Popcorn fundraiser", words: "popcorn trails end trail's end fundraiser unit code sell" },
  { href: "/store", title: "Pack store", words: "store apparel shirt hoodie uniform badge patch scout shop handbook" },
  { href: "/guide", title: "Pack guide", words: "guide help how faq information rules" },
  { href: "/documents", title: "Documents", words: "documents forms files pdf" },
  { href: "/photos", title: "Photos", words: "photos pictures album upload" },
  { href: "/polls", title: "Polls", words: "polls vote survey" },
  { href: "/inbox", title: "News and messages", words: "news announcements messages notifications inbox" },
  { href: "/nature", title: "Nature ID", words: "bird birds song sound plant plants leaf flower tree identify nature hike merlin seek" },
  { href: "/geocaching", title: "Geocaching", words: "geocache geocaching cache caches treasure hunt gps trackable travel bug" },
  { href: "/leaders", title: "Leader contacts", words: "leaders contacts phone email cubmaster den leader committee chair" },
  { href: "/recruit", title: "Invite a family", words: "invite recruit join friend new family flyer qr" },
  { href: "/events", title: "Calendar", words: "calendar events schedule meetings pack meeting" },
  { href: "/events?show=campouts", title: "Campouts", words: "campout camping overnight tent" },
  { href: "/events/archive", title: "Past events", words: "past events archive history" },
  { href: "/scouts", title: "Scouts and advancement", words: "scouts advancement rank adventure requirements progress" },
  { href: "/family/household", title: "Family and registration", words: "family registration renew scouting america my.scouting photo permission adults" },
  { href: "/family/forms", title: "Medical forms", words: "medical health form part a b paperwork" },
  { href: "/family/files", title: "Saved on this phone", words: "saved files insurance card offline phone" },
  { href: "/family/training", title: "My training", words: "training ypt safeguarding youth protection hazardous weather member id" },
  { href: "/family/alerts", title: "Phone alerts", words: "alerts notifications push install app home screen" },
  { href: "/family/contact", title: "My contact info", words: "contact phone name preferred" },
  { href: "/family/help", title: "Report a problem", words: "help problem bug feedback note question" },
  { href: "/lead", title: "Leaders", words: "leaders leader tools today meeting attendance notes dens waiting", who: "leader" },
  { href: "/lead#dens", title: "Your dens", words: "dens den roster my den scouts", who: "leader" },
  { href: "/gear", title: "Gear closet", words: "gear closet borrow tent equipment quartermaster" },
  { href: "/help-wanted", title: "Help wanted", words: "help wanted volunteer jobs roles grown-up" },
  { href: "/announce", title: "Announce to the pack", words: "announce announcement post message den email", who: "leader" },
  { href: "/events/new", title: "Add an event", words: "add event new create", who: "leader" },
  { href: "/scouts/review", title: "Approvals and Scoutbook", words: "approve approvals scoutbook enter requirements", who: "leader" },
  { href: "/scouts/awards", title: "Awards to hand out", words: "awards shopping list scout shop loops pins labels", who: "leader" },
  { href: "/leaders/training", title: "Leader training", words: "training leaders ypt import trained", who: "leader" },
  { href: "/leaders/paperwork", title: "Medical form tracker", words: "medical forms paperwork tracker missing", who: "leader" },
  { href: "/leaders/attendance", title: "Attendance report", words: "attendance report camping nights", who: "leader" },
  { href: "/events/council", title: "Council events", words: "council district events", who: "leader" },
  { href: "/leaders/money", title: "Money", words: "money dues charges payments registration fees", who: "committee" },
  { href: "/leaders/money/expenses", title: "Expenses and reports", words: "expenses budget reports income treasurer", who: "committee" },
  { href: "/admin", title: "Pack admin", words: "admin settings roster", who: "admin" },
  { href: "/admin/roster", title: "Families and scouts", words: "roster families scouts adults add family", who: "admin" },
  { href: "/admin/dens", title: "Dens and den leaders", words: "dens den leaders", who: "admin" },
  { href: "/admin/join", title: "Join requests", words: "join requests new family asking", who: "admin" },
];

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function searchPack(me: Adult, raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 60);
  const empty: SearchResults = { pages: [], events: [], guide: [], documents: [], people: [], scouts: [] };
  if (q.length < 2) return empty;
  const lower = q.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const allowed = (who: Who | undefined) =>
    !who || who === "all" || (who === "leader" && isLeader(me)) || (who === "committee" && isCommittee(me)) || (who === "admin" && isAdmin(me));

  const pages = PLACES.filter((p) => allowed(p.who))
    .filter((p) => words.every((w) => `${p.title} ${p.words}`.toLowerCase().includes(w)))
    .map((p) => ({ href: p.href, title: p.title }));

  const supabase = await createClient();
  const [events, guide, docs, leaders, scouts] = await Promise.all([
    getUpcomingEvents(150),
    supabase.from("guide_pages").select("slug, title").ilike("title", like(q)).limit(8),
    supabase.from("documents").select("id, title, folder").is("archived_at", null).ilike("title", like(q)).limit(8),
    getLeaders(),
    isLeader(me) ? getReviewableScouts() : Promise.resolve([]),
  ]);

  return {
    pages,
    events: events
      .filter((e) => words.every((w) => `${e.title} ${e.location_name ?? ""} ${e.den_name ?? ""}`.toLowerCase().includes(w)))
      .slice(0, 8)
      .map((e) => ({
        href: e.href,
        title: e.title,
        detail: new Date(e.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }),
      })),
    guide: ((guide.data ?? []) as { slug: string; title: string }[]).map((g) => ({ href: `/guide/${g.slug}`, title: g.title })),
    documents: ((docs.data ?? []) as { id: string; title: string; folder: string }[]).map((d) => ({
      href: `/documents/${d.id}`,
      title: d.title,
      detail: d.folder,
    })),
    people: leaders
      .filter((l) => words.every((w) => `${l.name} ${l.position_title ?? ""} ${l.dens ?? ""}`.toLowerCase().includes(w)))
      .slice(0, 8)
      .map((l) => ({ href: "/leaders", title: l.name, detail: l.position_title ?? undefined })),
    scouts: scouts
      .filter((s) => words.every((w) => `${s.first_name} ${s.last_name} ${s.den?.name ?? ""}`.toLowerCase().includes(w)))
      .slice(0, 8)
      .map((s) => ({ href: `/scouts/${s.id}`, title: `${s.first_name} ${s.last_name}`, detail: s.den?.name })),
  };
}
