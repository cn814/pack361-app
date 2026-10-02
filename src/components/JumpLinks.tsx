/** A row of chips that jump to the sections of a long page (event and campout pages). */
export default function JumpLinks({ links }: { links: { href: string; label: string }[] }) {
  if (links.length < 2) return null;
  return (
    <nav aria-label="On this page" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 print:hidden lg:mx-0 lg:flex-wrap lg:px-0">
      {links.map((l) => (
        <a key={l.href} href={l.href} className="flex h-9 shrink-0 items-center rounded-full border border-line bg-white px-4 text-sm font-bold text-pine">
          {l.label}
        </a>
      ))}
    </nav>
  );
}
