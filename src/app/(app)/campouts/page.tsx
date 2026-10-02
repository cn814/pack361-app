import { redirect } from "next/navigation";

/** Campouts are a filter on the Calendar now. */
export default function CampoutsPage() {
  redirect("/events?show=campouts");
}
