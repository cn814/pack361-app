import GettingStartedCard from "@/components/GettingStartedCard";
import { getGettingStarted } from "@/lib/onboarding";

/**
 * Home card for families who joined in the last 90 days: registration, medical forms, dues,
 * phone alerts, the pack calendar, the welcome guide and meeting the den leader. Renders nothing
 * for everyone else, or once the family hides it.
 */
export default async function GettingStarted() {
  const g = await getGettingStarted();
  if (!g) return null;
  return <GettingStartedCard steps={g.steps} />;
}
