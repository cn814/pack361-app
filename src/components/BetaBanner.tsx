import { FlaskConical } from "lucide-react";
import { APP_VERSION, isBeta, LIVE_URL } from "@/lib/version";

/** A stripe on every page of the beta site, so testers never mistake it for the live app. */
export default function BetaBanner() {
  if (!isBeta()) return null;
  return (
    <div className="print:hidden bg-deep-navy text-white">
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-1.5 text-xs lg:max-w-3xl lg:px-8">
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
        <span className="min-w-0 flex-1">
          <b className="text-gold">Beta {APP_VERSION}</b> · test site with the pack&apos;s real information. Emails and alerts go to
          testers only.
        </span>
        <a href={LIVE_URL} className="shrink-0 font-bold underline">
          Live app
        </a>
      </div>
    </div>
  );
}
