import type { SubmissionStatus } from "@/lib/advancement-data";

const STYLE: Record<SubmissionStatus, [string, string]> = {
  submitted: ["Waiting for den leader", "bg-gold-50 text-gold-800"],
  approved: ["Approved", "bg-mint text-pine"],
  returned: ["Sent back", "bg-danger-50 text-danger"],
  recorded: ["In Scoutbook", "bg-brand text-white"],
};

export default function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const [label, cls] = STYLE[status];
  return <span className={`badge normal-case tracking-normal ${cls}`}>{label}</span>;
}
