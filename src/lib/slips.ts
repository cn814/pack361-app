// Permission slips: shared rules. Pure, no Supabase calls.
import type { DenRank, PackEvent } from "./types";

export const DEFAULT_SLIP_TEXT =
  "I give permission for my scout to take part in this event with Cub Scout Pack 361. I understand what is planned and agree that my scout will follow the pack's rules and the leaders' directions. If my scout needs medical care and I can't be reached, I authorize the leaders to get emergency care.";

/** Is this scout one the event is for (its den or ranks; everyone for a pack-wide event)? */
export function eventIsFor(e: Pick<PackEvent, "den_id" | "ranks">, s: { den: { id: string; rank: DenRank } | null }): boolean {
  if (e.den_id) return s.den?.id === e.den_id;
  if (e.ranks?.length) return Boolean(s.den && e.ranks.includes(s.den.rank));
  return true;
}

/** Whether the event still takes signatures (until a day after it ends). */
export function slipOpen(e: Pick<PackEvent, "starts_at" | "ends_at">, now = Date.now()): boolean {
  return Date.parse(e.ends_at ?? e.starts_at) > now - 86400000;
}


type SlipEvent = Pick<PackEvent, "id" | "starts_at" | "ends_at" | "den_id" | "ranks" | "slip_required">;

/**
 * Events a family said Going to that still need permission slips: fewer slips than the scouts
 * they said are going (at least one), among their scouts the event is for. `signed` holds
 * "eventId|scoutId" for the family's slips.
 */
export function slipsToSign<E extends SlipEvent>(
  events: E[],
  goingScouts: Map<string, number>,
  scouts: { id: string; first_name: string; den: { id: string; rank: DenRank } | null }[],
  signed: Set<string>,
  now = Date.now(),
): { event: E; names: string[] }[] {
  const out: { event: E; names: string[] }[] = [];
  for (const e of events) {
    if (!e.slip_required || !goingScouts.has(e.id) || !slipOpen(e, now)) continue;
    const forThem = scouts.filter((s) => eventIsFor(e, s));
    const done = forThem.filter((s) => signed.has(`${e.id}|${s.id}`)).length;
    const need = Math.min(Math.max(goingScouts.get(e.id) ?? 1, 1), forThem.length);
    if (done < need) out.push({ event: e, names: forThem.filter((s) => !signed.has(`${e.id}|${s.id}`)).map((s) => s.first_name) });
  }
  return out;
}

export const namesList = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
