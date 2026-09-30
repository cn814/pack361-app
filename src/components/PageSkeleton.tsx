/** Placeholder shown the moment a page is tapped, while its data loads. */
export default function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="card space-y-3 border-t-4 border-t-pine/40">
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-3 w-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-3">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
