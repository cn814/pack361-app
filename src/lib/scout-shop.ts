// Finding the Scout Shop item for an award: the adventure loop or pin, or the rank patch.
// Pure, no Supabase calls. Data: scout-shop-data.ts; thumbnails: public/awards/<sku>.jpg.
import { SHOP_ITEMS, SHOP_RANK_PATCHES, type ShopItem } from "./scout-shop-data";
import type { RecordKind } from "./advancement";
import type { DenRank } from "./types";

export type { ShopItem };

const key = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
const BY_KEY = new Map(Object.entries(SHOP_ITEMS).map(([k, v]) => {
  const [rank, name] = k.split("|");
  return [`${rank}|${key(name)}`, v];
}));

/** The Scout Shop item for an award, or null (other awards, or one the catalog doesn't have). */
export function shopItem(r: { kind: RecordKind; rank: DenRank | null; adventure: string | null; item: string }): ShopItem | null {
  if (!r.rank) return null;
  if (r.kind === "rank") return SHOP_RANK_PATCHES[r.rank] ?? null;
  if (r.kind !== "adventure") return null;
  return BY_KEY.get(`${r.rank}|${key(r.adventure ?? r.item)}`) ?? null;
}

export const shopImage = (sku: string) => `/awards/${sku}.jpg`;

/** Lions to Bears earn belt loops; Webelos and Arrow of Light earn pins. */
export const piece = (rank: DenRank | null) => (rank === "webelos" || rank === "aol" ? "pin" : "loop");
