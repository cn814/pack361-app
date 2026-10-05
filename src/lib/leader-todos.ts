/** To-dos that are a leader's job (the rest are their own family's): on the Leaders tab, not Home. */
export const LEADER_TODOS = new Set(["join-requests", "photos", "forms-waiting", "payments-reported", "notes", "training-import"]);

/** How the Leaders tab's "Waiting on you" names them next to the number. */
export const WAITING_LABEL: Record<string, string> = {
  "join-requests": "asking to join",
  photos: "photos to review",
  "forms-waiting": "medical forms turned in",
  "payments-reported": "payments to confirm",
  notes: "messages from families",
};
