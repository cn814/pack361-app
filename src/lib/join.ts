// Ask to join: shared labels and rules. Pure, no Supabase calls.
import type { DenRank } from "./types";

export const GRADES = ["K", "1", "2", "3", "4", "5"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABEL: Record<Grade, string> = {
  K: "Kindergarten",
  "1": "1st grade",
  "2": "2nd grade",
  "3": "3rd grade",
  "4": "4th grade",
  "5": "5th grade",
};

/** The Cub Scout rank for each school grade. */
export const RANK_FOR_GRADE: Record<Grade, DenRank> = { K: "lion", "1": "tiger", "2": "wolf", "3": "bear", "4": "webelos", "5": "aol" };

export const MAX_JOIN_SCOUTS = 6;

export interface JoinScout {
  first_name: string;
  last_name: string;
  grade?: Grade | null;
}

export interface JoinRequest {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  relationship: string | null;
  scouts: JoinScout[];
  note: string | null;
  status: "pending" | "approved" | "declined";
  decline_reason: string | null;
  family_id: string | null;
  decided_at: string | null;
  created_at: string;
}

export const isGrade = (g: string): g is Grade => (GRADES as readonly string[]).includes(g);

/** The den a new scout most likely belongs in: the first active den of their grade's rank. */
export function denForGrade<T extends { id: string; rank: DenRank; is_active?: boolean }>(grade: Grade | null | undefined, dens: T[]): T | null {
  if (!grade) return null;
  return dens.find((d) => d.rank === RANK_FOR_GRADE[grade] && d.is_active !== false) ?? null;
}
