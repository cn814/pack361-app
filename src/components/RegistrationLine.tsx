import { ExternalLink } from "lucide-react";
import { fmtRegDate, needsRenewal, regStatus, RENEW_URL, REG_STYLE } from "@/lib/registration";

/** "Scouting America registration: expires 10/31/26", with a renew link when it's due. */
export default function RegistrationLine({ expires }: { expires: string | null }) {
  const st = regStatus(expires);
  if (st.state === "unknown") return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>
        Scouting America registration {st.state === "expired" ? "expired" : "expires"} {fmtRegDate(expires!)}
      </span>
      {st.state !== "current" && <span className={`badge normal-case tracking-normal ${REG_STYLE[st.state]}`}>{st.label}</span>}
      {needsRenewal(st) && (
        <a href={RENEW_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-pine underline">
          Renew at my.scouting.org <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </span>
  );
}
