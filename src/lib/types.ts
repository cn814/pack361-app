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
  registration_expires_on?: string | null;
  /** Set while a leader is using "View as": their real role (role is the one being previewed). */
  real_role?: AppRole;
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
  registration_expires_on?: string | null;
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
  twh_uid?: string | null;
  twh_url?: string | null;
  archived_at?: string | null;
  rsvp_enabled?: boolean;
  rsvp_by?: string | null;
  /** Cost in cents; null = no charge of that kind. */
  fee_family_cents?: number | null;
  fee_scout_cents?: number | null;
  fee_adult_cents?: number | null;
  source?: string | null;
  archived_reason?: "removed_in_twh" | "hidden" | null;
  links?: EventLink[];
  sections?: EventSection[];
  /** Camping nights a leader set; null = worked out from the dates (see lib/attendance). */
  camping_nights?: number | null;
  public_on_join?: boolean;
  public_blurb?: string | null;
  /** Families sign a permission slip for each scout (see lib/permission-slips). */
  slip_required?: boolean;
  slip_text?: string | null;
  slip_document_id?: string | null;
  slip_due?: string | null;
  /** When a leader last saved who was there. */
  attendance_taken_at?: string | null;
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
  den_id?: string | null;
  den?: { name: string } | null;
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
