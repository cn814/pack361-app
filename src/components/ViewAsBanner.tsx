import { Eye } from "lucide-react";
import { setViewAs } from "@/app/(app)/view-as-actions";
import { VIEW_AS_LABEL } from "@/lib/view-as";
import type { Adult } from "@/lib/types";

/** Shown on every page while a leader is using "View as". */
export default function ViewAsBanner({ me }: { me: Adult }) {
  if (!me.real_role) return null;
  return (
    <div className="print:hidden sticky top-[calc(env(safe-area-inset-top)+4rem)] z-30 bg-gold text-on-gold shadow-sm lg:top-0">
      <form action={setViewAs} className="mx-auto flex max-w-md items-center gap-2 px-4 py-1 text-sm lg:max-w-3xl lg:px-8">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-semibold">
          Viewing as {VIEW_AS_LABEL[me.role] ?? me.role}. Your own permissions haven&apos;t changed.
        </span>
        <input type="hidden" name="back" value="leaders" />
        <button className="min-h-10 shrink-0 rounded-lg bg-deep px-3 py-1 text-xs font-bold text-white">Switch back</button>
      </form>
    </div>
  );
}
