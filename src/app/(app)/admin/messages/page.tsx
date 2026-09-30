import type { Metadata } from "next";
import { Check, Mail, RotateCcw } from "lucide-react";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { requireAdmin } from "@/lib/roster-data";
import { createClient } from "@/lib/supabase/server";
import { fmtDay, fmtTime } from "@/lib/format";
import { resolveFeedback } from "../actions";

export const metadata: Metadata = { title: "Messages" };

const KIND: Record<string, { label: string; style: string }> = {
  problem: { label: "Problem", style: "bg-danger-50 text-danger" },
  question: { label: "Question", style: "bg-gold-50 text-gold-800" },
  idea: { label: "Idea", style: "bg-mint text-pine" },
  other: { label: "Note", style: "bg-surface text-navy" },
};

interface Row {
  id: string;
  kind: string;
  message: string;
  page: string | null;
  created_at: string;
  resolved_at: string | null;
  adult: { first_name: string; last_name: string; preferred_name: string | null; email: string } | null;
}

export default async function MessagesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback")
    .select("id, kind, message, page, created_at, resolved_at, adult:adults!feedback_adult_id_fkey(first_name, last_name, preferred_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const open = rows.filter((r) => !r.resolved_at);
  const done = rows.filter((r) => r.resolved_at);

  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Messages</h1>
        <p className="text-sm text-muted">Problems and notes families send from the app. Admins get a phone alert and an email for each.</p>
      </div>
      {open.length === 0 && <p className="card text-sm text-muted">Nothing open.</p>}
      <ul className="space-y-2">
        {open.map((r) => (
          <Item key={r.id} r={r} />
        ))}
      </ul>
      {done.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer list-none text-sm font-bold text-muted">Handled ({done.length})</summary>
          <ul className="space-y-2 pt-3">
            {done.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Item({ r }: { r: Row }) {
  const k = KIND[r.kind] ?? KIND.other;
  const who = r.adult ? `${r.adult.preferred_name || r.adult.first_name} ${r.adult.last_name}` : "Someone who has left the roster";
  return (
    <li className={`card space-y-2 ${r.resolved_at ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`badge ${k.style}`}>{k.label}</span>
        <span className="text-muted">
          {fmtDay(r.created_at)} {fmtTime(r.created_at)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-ink">{r.message}</p>
      <p className="text-xs text-muted">
        {who}
        {r.page ? ` · from ${r.page}` : ""}
      </p>
      <div className="flex gap-2">
        {r.adult && (
          <a href={`mailto:${r.adult.email}?subject=${encodeURIComponent("Your note about the Pack 361 app")}`} className="btn-ghost flex-1 py-2">
            <Mail className="h-4 w-4" aria-hidden /> Reply
          </a>
        )}
        <form action={resolveFeedback} className="flex-1">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="reopen" value={r.resolved_at ? "1" : ""} />
          <SubmitButton className={`${r.resolved_at ? "btn-ghost" : "btn-primary"} w-full py-2`}>
            {r.resolved_at ? (
              <>
                <RotateCcw className="h-4 w-4" aria-hidden /> Reopen
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden /> Handled
              </>
            )}
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
