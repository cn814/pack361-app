// Loading screen while the app opens: the pack's wolf bobbing along a trail of paw prints, with a
// few camp-themed lines in turn. Plain HTML and CSS (globals.css, "Loading screen"), so it shows
// and moves before any of the app's JavaScript arrives. When it shows and hides: src/lib/boot.ts.

const LINES = ["Rounding up the pack…", "Checking the trail map…", "Packing the s’mores…", "Lighting the campfire…"];
const PAWS = 6;

export default function BootLoader() {
  return (
    <div id="boot" role="status" aria-label="Loading Pack 361" className="print:hidden">
      <div className="boot-wolf">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.png" alt="" width={120} height={120} fetchPriority="high" />
      </div>
      <div className="boot-shadow" aria-hidden />
      <svg className="boot-trail" viewBox={`0 0 ${PAWS * 40} 48`} aria-hidden>
        <defs>
          <g id="boot-paw">
            <ellipse cx="0" cy="4" rx="6" ry="5" />
            <ellipse cx="-7" cy="-4" rx="2.4" ry="3" />
            <ellipse cx="-2.6" cy="-8" rx="2.4" ry="3" />
            <ellipse cx="2.6" cy="-8" rx="2.4" ry="3" />
            <ellipse cx="7" cy="-4" rx="2.4" ry="3" />
          </g>
        </defs>
        {Array.from({ length: PAWS }, (_, i) => (
          <use
            key={i}
            href="#boot-paw"
            className="boot-paw"
            style={{ animationDelay: `${i * 0.25}s` }}
            transform={`translate(${20 + i * 40} ${i % 2 ? 32 : 16}) rotate(90) scale(1.2)`}
          />
        ))}
      </svg>
      <p className="boot-name">Pack 361</p>
      <p className="boot-lines">
        {LINES.map((line, i) => (
          <span key={line} style={{ animationDelay: `${i * 2}s` }}>
            {line}
          </span>
        ))}
      </p>
    </div>
  );
}
