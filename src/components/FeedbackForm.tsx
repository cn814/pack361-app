import { MessageSquareWarning } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { sendFeedback } from "@/app/(app)/actions";

/** "Report a problem or send a note" — goes to the pack admins as an alert and email. */
export default function FeedbackForm({ page }: { page: string }) {
  return (
    <details id="feedback" className="card scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
        <MessageSquareWarning className="h-5 w-5" aria-hidden /> Report a problem or send a note
      </summary>
      <div className="pt-3">
        <ActionForm action={sendFeedback} submit="Send to pack admins" busy="Sending…">
          <input type="hidden" name="page" value={page} />
          <select className="input" name="kind" defaultValue="problem" aria-label="What kind of note">
            <option value="problem">Something isn&apos;t working</option>
            <option value="question">A question</option>
            <option value="idea">An idea for the app</option>
            <option value="other">Something else</option>
          </select>
          <textarea className="input min-h-28" name="message" required maxLength={4000} placeholder="What happened, or what's on your mind?" />
          <p className="text-[11px] text-muted">
            Goes to the pack admins, who can reply by email. For a youth-protection concern, call the Scouts First Helpline at
            1-844-726-8871.
          </p>
        </ActionForm>
      </div>
    </details>
  );
}
