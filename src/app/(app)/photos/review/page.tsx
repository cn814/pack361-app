import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CameraOff, Check, Flag, Trash2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { isLeader, requireMember } from "@/lib/data";
import { getPendingPhotos } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { fmtDay } from "@/lib/format";
import { reviewPhotos } from "../actions";

export const metadata: Metadata = { title: "Photo review" };

export default async function PhotoReviewPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/photos");
  const supabase = await createClient();
  const [pending, { data: scoutRows }] = await Promise.all([
    getPendingPhotos(),
    supabase
      .from("scouts")
      .select("first_name, last_name, photo_permission, den:dens(name, rank, number)")
      .eq("is_active", true)
      .or("photo_permission.is.null,photo_permission.eq.no")
      .order("last_name"),
  ]);
  const noPhotos = (scoutRows ?? []) as unknown as {
    first_name: string;
    last_name: string;
    photo_permission: "no" | null;
    den: { name: string } | null;
  }[];
  const byDen = new Map<string, typeof noPhotos>();
  for (const s of noPhotos) byDen.set(s.den?.name ?? "No den", [...(byDen.get(s.den?.name ?? "No den") ?? []), s]);

  return (
    <>
      <BackLink href="/photos" label="Pack photos" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Photo review</h1>

      <details className="card border-l-4 border-l-danger" open={pending.length > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-danger">
          <CameraOff className="h-4 w-4" aria-hidden /> Don&apos;t approve photos showing these scouts ({noPhotos.length})
        </summary>
        <p className="pt-2 text-xs text-muted">
          Families said no, or haven&apos;t answered yet (treated as no). Leaders only; don&apos;t share this list.
        </p>
        <div className="space-y-2 pt-2">
          {[...byDen.entries()].map(([den, list]) => (
            <div key={den}>
              <p className="text-xs font-bold text-navy">{den}</p>
              <p className="text-sm text-ink">
                {list.map((s, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {s.first_name} {s.last_name[0]}.{s.photo_permission === null && <span className="text-muted">*</span>}
                  </span>
                ))}
              </p>
            </div>
          ))}
          <p className="text-[11px] text-muted">* hasn&apos;t answered yet</p>
        </div>
      </details>

      {pending.length === 0 && <p className="card text-sm text-muted">Nothing waiting. Nice.</p>}
      <ul className="space-y-3">
        {pending.map((p) => {
          const open = p.flags.filter((f) => !f.resolved_at);
          return (
            <li key={p.id} className={`card space-y-2 ${open.length ? "border-l-4 border-l-danger" : ""}`}>
              {p.full_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.full_url} alt={p.caption ?? ""} className="w-full rounded-xl bg-surface" loading="lazy" />
              )}
              {p.caption && <p className="text-sm font-semibold text-ink">{p.caption}</p>}
              <p className="text-xs text-muted">
                {p.event?.title ?? "No event"} · uploaded {fmtDay(p.created_at)}
              </p>
              {open.map((f, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-lg bg-danger-50 p-2 text-sm text-danger">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Removal requested {fmtDay(f.created_at)}
                    {f.reason ? `: “${f.reason}”` : ""}
                  </span>
                </p>
              ))}
              <form action={reviewPhotos} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton name="decision" value="delete" className="btn-ghost border-danger py-2 text-danger">
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </SubmitButton>
                <SubmitButton name="decision" value="approve" className="btn-primary py-2">
                  <Check className="h-4 w-4" aria-hidden /> {open.length ? "Keep it up" : "Approve"}
                </SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
