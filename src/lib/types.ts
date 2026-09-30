export type AppRole = "parent" | "den_leader" | "committee" | "cubmaster" | "admin";
export type DenRank = "lion" | "tiger" | "wolf" | "bear" | "webelos" | "aol";

export interface Adult {
  id: string;
  family_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  role: AppRole;
  position_title: string | null;
  ypt_expires_on: string | null;
}

export interface Den {
  id: string;
  rank: DenRank;
  number: number;
  name: string;
}

export interface Scout {
  id: string;
  first_name: string;
  last_name: string;
  family_id: string;
  den: Den | null;
  photo_permission?: "yes" | "no" | null;
}

export interface PackEvent {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  address: string | null;
  details: string | null;
  signup_url: string | null;
  den_id: string | null;
  ranks?: DenRank[] | null;
  all_day?: boolean;
  leaders_only?: boolean;
  links?: EventLink[];
  sections?: EventSection[];
}

export interface EventLink {
  label: string;
  url: string;
  note?: string | null;
}

export interface EventSection {
  title: string;
  tone?: "warn" | "info" | null;
  body?: string | null;
  items?: string[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  created_at: string;
  author_id: string;
  author: { first_name: string; last_name: string; preferred_name: string | null; position_title: string | null } | null;
}

export interface Leader {
  adult_id: string;
  name: string;
  position_title: string | null;
  role: AppRole;
  email: string;
  phone: string | null;
  dens: string | null;
}

export interface PackingItem {
  id: string;
  category: string;
  label: string;
  detail: string | null;
  required: boolean;
  sort_order: number;
}

export interface ItineraryItem {
  id: string;
  starts_at: string;
  title: string;
  location: string | null;
  notes: string | null;
}

export const LEADER_ROLES: AppRole[] = ["den_leader", "committee", "cubmaster", "admin"];
