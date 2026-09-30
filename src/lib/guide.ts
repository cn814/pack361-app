import "server-only";
import { createClient } from "./supabase/server";

export interface GuidePage {
  id: string;
  slug: string;
  section: string;
  title: string;
  summary: string | null;
  body: string;
  sort_order: number;
  is_published: boolean;
  is_public: boolean;
  updated_at: string;
}

/** Sections in the order the guide shows them; any other section name goes at the end. */
export const GUIDE_SECTIONS = [
  "Getting started",
  "Ranks and advancement",
  "Uniforms",
  "Camping and outings",
  "Safety",
  "Money",
  "Getting involved",
  "Using the app",
];

const COLS = "id, slug, section, title, summary, body, sort_order, is_published, is_public, updated_at";

/** Every page the signed-in person may see (drafts only for leaders; RLS decides). */
export async function getGuidePages(): Promise<GuidePage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("guide_pages").select(COLS).order("sort_order").order("title");
  const pages = (data ?? []) as GuidePage[];
  const rank = (s: string) => (GUIDE_SECTIONS.indexOf(s) + 1 || 99);
  return pages.sort((a, b) => rank(a.section) - rank(b.section) || a.sort_order - b.sort_order);
}

export async function getGuidePage(slug: string): Promise<GuidePage | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("guide_pages").select(COLS).eq("slug", slug).maybeSingle();
  return (data as GuidePage | null) ?? null;
}

/** Body text without formatting marks, for searching. */
export function plainText(body: string): string {
  return body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Public pages (no sign-in), for pack361.org. Uses a client without the visitor's session. */
export async function getPublicPage(slug: string): Promise<GuidePage | null> {
  const { createClient: plain } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const db = plain(url, key, { auth: { persistSession: false } });
  const { data } = await db.from("guide_pages").select(COLS).eq("slug", slug).eq("is_public", true).eq("is_published", true).maybeSingle();
  return (data as GuidePage | null) ?? null;
}

export async function getPublicPages(): Promise<Pick<GuidePage, "slug" | "title" | "summary">[]> {
  const { createClient: plain } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const db = plain(url, key, { auth: { persistSession: false } });
  const { data } = await db.from("guide_pages").select("slug, title, summary").eq("is_public", true).eq("is_published", true).order("sort_order");
  return (data ?? []) as Pick<GuidePage, "slug" | "title" | "summary">[];
}
