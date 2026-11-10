-- Undo "Entered in Scoutbook": a leader who marked items entered by mistake puts them back to
-- "approved" from Approvals and Scoutbook. The den leader's approval (who and when) stays as it
-- was; only the "entered" stamp is cleared (private.stamp_recorded already does that).
begin;

create or replace function private.stamp_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.status is distinct from old.status then
        if new.status::text in ('submitted', 'pending_review') then
            new.reviewed_by := null;
            new.reviewed_at := null;
        elsif old.status::text = 'recorded' and new.status::text = 'approved' then
            -- Undo of "Entered": still approved by whoever approved it.
            new.reviewed_by := old.reviewed_by;
            new.reviewed_at := old.reviewed_at;
        elsif new.status::text <> 'recorded' then
            new.reviewed_by := private.current_adult_id();
            new.reviewed_at := now();
        end if;
    end if;
    return new;
end;
$$;
revoke execute on function private.stamp_review() from public, anon, authenticated;

commit;
