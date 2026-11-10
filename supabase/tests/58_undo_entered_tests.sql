-- Undo "Entered in Scoutbook". Reuses 55's people: A = Ada Advance (Advancement Chair),
-- D = Dov Denleader (leads no den), and 01/02's scout Jo.
\set QUIET on
set client_min_messages = notice;

insert into public.advancement_submissions (id, scout_id, submitted_by, adventure, requirement, completed_on, status)
values ('58000000-0000-0000-0000-000000000001',
        (select id from public.scouts where first_name = 'Jo'),
        '30000000-0000-0000-0000-000000005503', 'Fellowship', '2', '2026-11-01', 'approved');
-- Approved earlier by Ada, then marked entered by mistake.
update public.advancement_submissions
   set reviewed_by = '30000000-0000-0000-0000-000000005501', reviewed_at = '2026-11-02 18:00+00'
 where id = '58000000-0000-0000-0000-000000000001';
update public.advancement_submissions set status = 'recorded' where id = '58000000-0000-0000-0000-000000000001';

\echo '== Undo "Entered in Scoutbook"'
begin; set local role authenticated; select test.as55('A');
select test.expect_rows($$update public.advancement_submissions set status = 'approved'
                            where id = '58000000-0000-0000-0000-000000000001' and status = 'recorded'$$, 1,
                        'a leader who can review the scout puts an entered item back to approved');
select test.check((select reviewed_by = '30000000-0000-0000-0000-000000005501' and reviewed_at = '2026-11-02 18:00+00'
                     from public.advancement_submissions where id = '58000000-0000-0000-0000-000000000001'),
                  'and the original approval (who and when) is kept');
select test.check((select recorded_by is null and recorded_at is null
                     from public.advancement_submissions where id = '58000000-0000-0000-0000-000000000001'),
                  'and the entered stamp is cleared');
rollback;

begin; set local role authenticated; select test.as55('D');
select test.expect_rows($$update public.advancement_submissions set status = 'approved'
                            where id = '58000000-0000-0000-0000-000000000001'$$, 0,
                        'a leader who cannot review the scout cannot undo it');
rollback;

begin; set local role authenticated; select test.as55('A');
update public.advancement_submissions set status = 'returned' where id = '58000000-0000-0000-0000-000000000001';
select test.check((select reviewed_by = '30000000-0000-0000-0000-000000005501' and reviewed_at > '2026-11-02 18:00+00'
                     from public.advancement_submissions where id = '58000000-0000-0000-0000-000000000001'),
                  'other decisions still stamp the leader who made them');
rollback;

delete from public.advancement_submissions where id = '58000000-0000-0000-0000-000000000001';
