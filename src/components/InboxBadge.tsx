import { getInboxCount } from "@/lib/inbox";

/**
 * The bell's number, streamed in after the page (wrap it in <Suspense fallback={null}>), so
 * no page waits on the to-dos and counts behind it. Screen readers hear "N new" after the
 * link's "Notifications"; the red dot itself is hidden from them.
 */
export default async function InboxBadge({ variant }: { variant: "header" | "sidebar" }) {
  // A failed count just leaves the bell plain; it never breaks the page.
  const count = await getInboxCount().catch(() => 0);
  if (count <= 0) return null;
  const shown = count > 9 ? "9+" : count;
  return (
    <>
      <span className="sr-only">, {count} new</span>
      <span
        aria-hidden
        className={
          variant === "header"
            ? "absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-alarm px-1 text-[11px] font-extrabold leading-none text-white ring-2 ring-brand"
            : "ml-auto rounded-full bg-alarm px-2 py-0.5 text-[11px] font-extrabold text-white"
        }
      >
        {shown}
      </span>
    </>
  );
}
