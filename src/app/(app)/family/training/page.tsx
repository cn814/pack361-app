import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import TrainingEditor from "@/components/TrainingEditor";
import TrainingStatus from "@/components/TrainingStatus";
import ActionForm, { Field } from "@/components/ActionForm";
import { saveMyMemberId } from "@/app/(app)/leaders/training/actions";
import { requireMember } from "@/lib/data";
import { getMyPositions, getMyTraining } from "@/lib/training-data";
import { POSITION_BY_KEY, trainedStatus } from "@/lib/training";

export const metadata: Metadata = { title: "My training" };

export default async function MyTrainingPage() {
  const me = await requireMember();
  const [training, mine] = await Promise.all([getMyTraining(me.id), getMyPositions(me)]);
  const status = trainedStatus(mine.positions, training);
  const focus = [...new Set([...status.required, ...mine.positions.flatMap((p) => POSITION_BY_KEY[p].recommended)])];
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">My training</h1>
      <section id="training" className="card space-y-2">
        <TrainingStatus status={status} rows={training} />
        <TrainingEditor adultId={me.id} rows={training} focus={focus} />
      </section>
      <section className="card space-y-2">
        <h2 className="section-title">BSA member ID</h2>
        <p className="text-sm text-muted">
          Your Scouting America member ID links you to your my.scouting.org training records, so a leader can import your training
          dates. It&apos;s on your membership card and at my.scouting.org under My Profile.
        </p>
        <ActionForm action={saveMyMemberId} buttonClass="btn-ghost w-full py-2">
          <Field label="Member ID" hint="Digits only. Leave blank to remove it.">
            <input
              className="input"
              name="member_id"
              inputMode="numeric"
              pattern="[0-9]{1,12}"
              maxLength={12}
              autoComplete="off"
              defaultValue={mine.memberId ?? ""}
            />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
