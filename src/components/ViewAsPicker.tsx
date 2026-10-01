import { Eye } from "lucide-react";
import { setViewAs } from "@/app/(app)/view-as-actions";
import { VIEW_AS_LABEL, viewableRoles } from "@/lib/view-as";
import type { Adult } from "@/lib/types";

/** On the Leaders page: see the app the way someone with a lower role sees it. */
export default function ViewAsPicker({ me }: { me: Adult }) {
  const real = me.real_role ?? me.role;
  const roles = viewableRoles(real);
  if (!roles.length) return null;
  return (
    <section className="card space-y-2">
      <h2 className="flex items-center gap-2 font-bold text-pine-950">
        <Eye className="h-4 w-4 text-pine" aria-hidden /> See the app as…
      </h2>
      <p className="text-xs text-muted">
        Check what other people see. Pages show what that role would see, using your own family. Your permissions don&apos;t
        change, and a gold bar at the top lets you switch back.
      </p>
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => (
          <form key={r} action={setViewAs}>
            <input type="hidden" name="role" value={r} />
            <button className={`btn-ghost px-3 py-1.5 text-sm ${me.role === r ? "ring-2 ring-pine" : ""}`} disabled={me.role === r}>
              {(VIEW_AS_LABEL[r] ?? r).replace(/^a /, "").replace(/^./, (c) => c.toUpperCase())}
            </button>
          </form>
        ))}
        {me.real_role && (
          <form action={setViewAs}>
            <input type="hidden" name="back" value="leaders" />
            <button className="btn-primary px-3 py-1.5 text-sm">Back to my view</button>
          </form>
        )}
      </div>
    </section>
  );
}
