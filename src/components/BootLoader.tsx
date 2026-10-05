// The pack's wolf bobbing along a trail of paw prints, with a few camp-themed lines in turn. Plain
// HTML and CSS (globals.css, "Loading screen"), so it moves before any of the app's JavaScript
// arrives. Two uses:
//  * BootLoader: the full-screen loading screen while the app opens (when: src/lib/boot.ts). The
//    service worker shows a copy of it on a cold start (public/sw.js, bootShell), so keep the two
//    alike.
//  * WolfWait: inside the page skeleton, fading in only when a page takes more than a moment.

const LINES = ["Rounding up the pack…", "Checking the trail map…", "Packing the s’mores…", "Lighting the campfire…"];
const PAWS = 6;

function Wolf({ pawId }: { pawId: string }) {
  return (
    <>
      <div className="boot-wolf">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.png" alt="" width={120} height={120} />
      </div>
      <div className="boot-shadow" aria-hidden />
      <svg className="boot-trail" viewBox={`0 0 ${PAWS * 40} 48`} aria-hidden>
        <defs>
          <g id={pawId}>
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
            href={`#${pawId}`}
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
    </>
  );
}

export default function BootLoader() {
  return (
    <div id="boot" role="status" aria-label="Loading Pack 361" className="print:hidden">
      <Wolf pawId="boot-paw" />
    </div>
  );
}

/** Covers a page skeleton with the wolf, fading in after a moment (globals.css, .wolf-wait). */
export function WolfWait() {
  return (
    <div className="wolf-wait print:hidden" aria-hidden>
      <Wolf pawId="wait-paw" />
    </div>
  );
}
