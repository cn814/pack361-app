import type { PhotoOptOut } from "@/lib/photos";

/** Scouts whose families said no to pack photos, grouped by den (leaders only; first name + initial). */
export default function PhotoOptOutList({ scouts }: { scouts: PhotoOptOut[] }) {
  const byDen = new Map<string, PhotoOptOut[]>();
  for (const s of scouts) {
    const den = s.is_active ? (s.den?.name ?? "No den") : "No longer in the pack";
    byDen.set(den, [...(byDen.get(den) ?? []), s]);
  }
  return (
    <div className="space-y-2">
      {[...byDen.entries()].map(([den, list]) => (
        <div key={den}>
          <p className="text-xs font-bold text-navy">{den}</p>
          <p className="text-sm text-ink">
            {list.map((s, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {s.first_name} {s.last_name[0]}.
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  );
}
