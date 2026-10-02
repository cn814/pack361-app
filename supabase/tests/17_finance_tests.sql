-- Pack finances: expenses, reimbursement requests, other income, budget and receipts.
-- A = Alex Smith (parent), B = Blair Jones (parent), C = Lee Leader (den leader),
-- D = Morgan Admin (leadership), T = Taylor (committee, added here),
-- E = signed in but not on the roster.
\set QUIET on
set client_min_messages = notice;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'taylor.treasurer@example.com');
insert into public.adults (id, first_name, last_name, email, role, position_title)
values ('30000000-0000-0000-0000-0000000000a7', 'Taylor', 'Treasurer', 'taylor.treasurer@example.com', 'committee', 'Treasurer');

create function test.cat(p_name text) returns uuid language sql as $$
    select id from public.finance_categories where name = p_name
$$;
grant execute on function test.cat(text) to authenticated, anon;

-- Receipts already uploaded by Alex and by Morgan.
insert into storage.objects (bucket_id, name, metadata) values
 ('receipts', 'r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000001.jpg', '{"size": 5000, "mimetype": "image/jpeg"}'),
 ('receipts', 'r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000002.pdf', '{"size": 6000, "mimetype": "application/pdf"}'),
 ('receipts', 'r/30000000-0000-0000-0000-00000000000d/e0000000-0000-0000-0000-000000000003.png', '{"size": 7000, "mimetype": "image/png"}');

\echo '== Finance: setup'
select test.check((select count(*) from public.finance_categories where source is not null) = 5, 'five income categories the app counts itself');
select test.check((select count(*) from public.finance_categories where kind = 'expense') >= 10, 'expense categories are ready to use');
select test.check((select not public and file_size_limit = 10485760 from storage.buckets where id = 'receipts'), 'receipts bucket is private, 10 MB');
select test.check((select not (allowed_mime_types && array['text/html', 'image/svg+xml']) from storage.buckets where id = 'receipts'),
                  'receipts bucket refuses web pages and SVGs');

\echo '== Finance: anonymous visitor and stranger'
begin;
set local role anon;
select test.expect_error('select * from public.expenses', '42501', 'anon cannot read expenses');
select test.expect_error('select * from public.finance_income', '42501', 'anon cannot read income');
select test.expect_error('select * from public.finance_categories', '42501', 'anon cannot read categories');
select test.expect_error($$select * from storage.objects where bucket_id = 'receipts'$$, '42501', 'anon cannot read receipts');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal2"}', true);
select test.check(test.count('select * from public.finance_categories') = 0, 'stranger sees no categories');
select test.check(test.count('select * from public.expenses') = 0, 'stranger sees no expenses');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id) values (current_date, 100, 'x', null)$$,
                         '42501', 'stranger cannot ask to be paid back');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('receipts', 'r/00000000-0000-0000-0000-00000000000e/x.jpg')$$,
                         '42501', 'stranger cannot upload a receipt');
rollback;

\echo '== Finance: parent asks to be paid back'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count('select * from public.finance_categories') > 0, 'members see the categories');
insert into public.expenses (id, spent_on, amount_cents, description, vendor, adult_id, category_id, pay_me_by,
                             receipt_path, receipt_name, receipt_mime, receipt_bytes)
values ('e1000000-0000-0000-0000-000000000001', current_date - 3, 4599, 'Snacks for the den meeting', 'Giant',
        '30000000-0000-0000-0000-00000000000a', test.cat('Den meetings'), 'check',
        'r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000001.jpg', 'receipt.jpg', 'image/jpeg', 5000);
select test.check(test.count('select * from public.expenses') = 1, 'parent sees their own request');
select test.check((select created_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000a',
                  'request records who made it');
update public.expenses set amount_cents = 4699, note = 'Juice boxes too' where id = 'e1000000-0000-0000-0000-000000000001';
select test.check((select amount_cents from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = 4699,
                  'parent can fix their request before leadership acts');
select test.expect_error($$update public.expenses set status = 'approved' where id = 'e1000000-0000-0000-0000-000000000001'$$,
                         '42501', 'parent cannot approve their own request');
select test.expect_error($$update public.expenses set status = 'paid', paid_on = current_date where id = 'e1000000-0000-0000-0000-000000000001'$$,
                         '42501', 'parent cannot mark their own request paid');
select test.expect_error($$update public.expenses set review_note = 'ok' where id = 'e1000000-0000-0000-0000-000000000001'$$,
                         '42501', 'parent cannot write the leadership note');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id) values (current_date, 100, 'x', '30000000-0000-0000-0000-00000000000b')$$,
                         '42501', 'parent cannot file a request for someone else');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id, status, category_id, paid_on)
                          values (current_date, 100, 'x', '30000000-0000-0000-0000-00000000000a', 'paid', test.cat('Den meetings'), current_date)$$,
                         '42501', 'parent cannot record a request as already paid');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, paid_by, status, category_id, paid_on)
                          values (current_date, 100, 'x', 'pack', 'paid', test.cat('Den meetings'), current_date)$$,
                         '42501', 'parent cannot record pack spending');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id, receipt_path, receipt_mime)
                          values (current_date, 100, 'x', '30000000-0000-0000-0000-00000000000a',
                                  'r/30000000-0000-0000-0000-00000000000d/e0000000-0000-0000-0000-000000000003.png', 'image/png')$$,
                         '42501', 'parent cannot attach someone else''s receipt');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id, category_id)
                          values (current_date, 100, 'x', '30000000-0000-0000-0000-00000000000a', test.cat('Pack dues'))$$,
                         '22023', 'an expense needs an expense category');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id) values (current_date, 0, 'x', '30000000-0000-0000-0000-00000000000a')$$,
                         '23514', 'an expense needs an amount');
-- Receipts: own folder only.
select test.check(test.count($$select * from storage.objects where bucket_id = 'receipts'$$) = 2, 'parent sees only their own receipts');
insert into storage.objects (bucket_id, name) values ('receipts', 'r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000009.jpg');
select test.expect_error($$insert into storage.objects (bucket_id, name) values ('receipts', 'r/30000000-0000-0000-0000-00000000000b/x.jpg')$$,
                         '42501', 'parent cannot upload into someone else''s folder');
select test.check(test.count($$select * from public.receipt_upload_info('r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000001.jpg')$$) = 1,
                  'parent can check their own upload');
select test.check(test.count($$select * from public.receipt_upload_info('r/30000000-0000-0000-0000-00000000000d/e0000000-0000-0000-0000-000000000003.png')$$) = 0,
                  'parent cannot check someone else''s upload');
-- Not for them.
select test.check(test.count('select * from public.finance_income') = 0, 'parent sees no pack income');
select test.check(test.count('select * from public.finance_budget') = 0, 'parent sees no budget');
select test.expect_error($$insert into public.finance_budget (season, category_id, amount_cents) values ('2026-27', test.cat('Den meetings'), 100)$$,
                         '42501', 'parent cannot set the budget');
select test.expect_error($$insert into public.finance_categories (kind, name) values ('expense', 'Mine')$$, '42501', 'parent cannot add categories');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', true);
select test.check(test.count('select * from public.expenses') = 0, 'another parent cannot see Alex''s request');
select test.check(test.count($$select * from storage.objects where bucket_id = 'receipts'$$) = 0, 'another parent cannot see Alex''s receipts');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select test.check(test.count('select * from public.expenses') = 0, 'a den leader sees only their own requests');
select test.check(test.count('select * from public.finance_income') = 0, 'a den leader sees no pack income');
rollback;

\echo '== Finance: leadership'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.check(test.count('select * from public.expenses') = 1, 'leadership sees every request');
select test.check(test.count($$select * from storage.objects where bucket_id = 'receipts'$$) >= 3, 'leadership sees every receipt');
update public.expenses set status = 'approved' where id = 'e1000000-0000-0000-0000-000000000001';
select test.check((select approved_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000d',
                  'approving records who approved');
update public.expenses set status = 'paid', paid_via = 'check', paid_on = current_date, paid_ref = '1043'
 where id = 'e1000000-0000-0000-0000-000000000001';
select test.check((select settled_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000d'
                  and (select approved_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = '30000000-0000-0000-0000-00000000000d',
                  'paying records who paid and keeps who approved');
-- Pack spending, recorded as paid straight away.
insert into public.expenses (id, spent_on, amount_cents, description, vendor, paid_by, status, category_id, paid_via, paid_on,
                             receipt_path, receipt_name, receipt_mime, receipt_bytes)
values ('e1000000-0000-0000-0000-000000000002', current_date - 1, 32000, 'Pinewood Derby track parts', 'Amazon', 'pack', 'paid',
        test.cat('Pinewood Derby'), 'card', current_date - 1,
        'r/30000000-0000-0000-0000-00000000000d/e0000000-0000-0000-0000-000000000003.png', 'track.png', 'image/png', 7000);
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, paid_by, status) values (current_date, 100, 'x', 'pack', 'submitted')$$,
                         '23514', 'pack spending is recorded as paid');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, paid_by, status, category_id) values (current_date, 100, 'x', 'pack', 'paid', test.cat('Den meetings'))$$,
                         '23514', 'paid needs the date it was paid');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id, status) values (current_date, 100, 'x', '30000000-0000-0000-0000-00000000000a', 'approved')$$,
                         '23514', 'approving needs a category');
-- Morgan's own request: Morgan cannot approve or pay it.
insert into public.expenses (id, spent_on, amount_cents, description, adult_id, category_id)
values ('e1000000-0000-0000-0000-000000000003', current_date, 2500, 'Ribbons for Blue and Gold', '30000000-0000-0000-0000-00000000000d', test.cat('Blue and Gold'));
select test.expect_error($$update public.expenses set status = 'approved' where id = 'e1000000-0000-0000-0000-000000000003'$$,
                         '42501', 'leadership cannot approve their own request');
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, adult_id, status, category_id, paid_on)
                          values (current_date, 100, 'x', '30000000-0000-0000-0000-00000000000d', 'paid', test.cat('Den meetings'), current_date)$$,
                         '42501', 'leadership cannot record paying themselves back');
-- Other income: only categories the app doesn't count on its own.
insert into public.finance_income (received_on, amount_cents, category_id, description, received_via)
values (current_date, 50000, test.cat('Donations and sponsors'), 'Sponsor check', 'check');
select test.expect_error($$insert into public.finance_income (received_on, amount_cents, category_id, description) values (current_date, 100, test.cat('Pack dues'), 'Dues')$$,
                         '22023', 'hand-entered income cannot double count dues');
select test.expect_error($$insert into public.finance_income (received_on, amount_cents, category_id, description) values (current_date, 100, test.cat('Den meetings'), 'x')$$,
                         '22023', 'income needs an income category');
-- Budget and categories.
insert into public.finance_budget (season, category_id, amount_cents) values ('2026-27', test.cat('Pinewood Derby'), 60000);
insert into public.finance_categories (id, kind, name) values ('fc000000-0000-0000-0000-000000000001', 'expense', '  Field   trips ');
select test.check((select name from public.finance_categories where id = 'fc000000-0000-0000-0000-000000000001') = 'Field trips', 'category names are tidied');
select test.expect_error($$insert into public.finance_categories (kind, name) values ('expense', 'field trips')$$, '23505', 'no duplicate category names');
select test.expect_error($$insert into public.finance_categories (kind, name, source) values ('income', 'More dues', 'dues')$$, '42501', 'cannot add an app-counted category');
update public.finance_categories set source = null, kind = 'expense' where source = 'dues';
select test.check((select kind from public.finance_categories where source = 'dues') = 'income', 'a category''s kind and source never change');
select test.expect_rows($$delete from public.finance_categories where source = 'givebutter' returning id$$, 0, 'app-counted categories cannot be deleted');
select test.expect_error($$delete from public.finance_categories where name = 'Pinewood Derby'$$, '23503', 'a category in use cannot be deleted');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","aal":"aal2"}', true);
update public.expenses set status = 'approved' where id = 'e1000000-0000-0000-0000-000000000003';
select test.check((select approved_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000003') = '30000000-0000-0000-0000-0000000000a7',
                  'another leadership member approves it');
rollback;

\echo '== Finance: after leadership acts'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check((select status from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = 'paid', 'parent sees their request was paid');
select test.check(test.count('select * from public.expenses') = 1, 'parent still sees only their own');
select test.expect_rows($$update public.expenses set amount_cents = 9999 where id = 'e1000000-0000-0000-0000-000000000001'$$, 0,
                        'parent cannot change a paid request');
select test.check((select amount_cents from public.expenses where id = 'e1000000-0000-0000-0000-000000000001') = 4699, 'paid request is unchanged');
select test.expect_rows($$delete from public.expenses where id = 'e1000000-0000-0000-0000-000000000001' returning id$$, 0,
                        'parent cannot delete a paid request');
select test.expect_rows($$delete from storage.objects where bucket_id = 'receipts' and name = 'r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000001.jpg' returning id$$, 0,
                        'parent cannot delete the receipt of a paid request');
select test.expect_rows($$delete from storage.objects where bucket_id = 'receipts' and name = 'r/30000000-0000-0000-0000-00000000000a/e0000000-0000-0000-0000-000000000002.pdf' returning id$$, 1,
                        'parent can delete an unused receipt');
-- A new request they withdraw.
insert into public.expenses (id, spent_on, amount_cents, description, adult_id)
values ('e1000000-0000-0000-0000-000000000004', current_date, 1200, 'Tape', '30000000-0000-0000-0000-00000000000a');
select test.expect_rows($$delete from public.expenses where id = 'e1000000-0000-0000-0000-000000000004' returning id$$, 1,
                        'parent can withdraw a request leadership has not acted on');
rollback;

\echo '== Finance: review fixes'
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_error($$insert into public.expenses (spent_on, amount_cents, description, paid_by, adult_id, status, category_id, paid_on)
                          values (current_date, 100, 'x', 'pack', '30000000-0000-0000-0000-00000000000d', 'paid', test.cat('Den meetings'), current_date)$$,
                         '23514', 'pack spending has nobody to pay back');
insert into public.expenses (id, spent_on, amount_cents, description, paid_by, status, category_id, paid_on)
values ('e1000000-0000-0000-0000-000000000010', current_date, 100, 'Pack thing', 'pack', 'paid', test.cat('Den meetings'), current_date);
update public.expenses set paid_by = 'member' where id = 'e1000000-0000-0000-0000-000000000010';
select test.check((select paid_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000010') = 'pack', 'who paid never changes');
select test.expect_error($$update public.expenses set paid_by = 'member', adult_id = '30000000-0000-0000-0000-00000000000d' where id = 'e1000000-0000-0000-0000-000000000010'$$,
                         '23514', 'pack spending cannot become your own paid request');
insert into public.expenses (id, spent_on, amount_cents, description, adult_id, category_id, created_by)
values ('e1000000-0000-0000-0000-000000000011', current_date, 1000, 'Mine', '30000000-0000-0000-0000-00000000000d', test.cat('Den meetings'), '30000000-0000-0000-0000-00000000000a');
select test.check((select created_by from public.expenses where id = 'e1000000-0000-0000-0000-000000000011') = '30000000-0000-0000-0000-00000000000d',
                  'who recorded it is always the person signed in');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","aal":"aal2"}', true);
update public.expenses set status = 'approved' where id = 'e1000000-0000-0000-0000-000000000011';
insert into public.expenses (id, spent_on, amount_cents, description, adult_id, status, category_id,
                             receipt_path, receipt_name, receipt_mime, receipt_bytes)
values ('e1000000-0000-0000-0000-000000000012', current_date, 700, 'Bought for Alex', '30000000-0000-0000-0000-00000000000a', 'approved',
        test.cat('Den meetings'), 'r/30000000-0000-0000-0000-0000000000a7/e0000000-0000-0000-0000-000000000012.jpg', 'r.jpg', 'image/jpeg', 10);
commit;
insert into storage.objects (bucket_id, name, metadata)
values ('receipts', 'r/30000000-0000-0000-0000-0000000000a7/e0000000-0000-0000-0000-000000000012.jpg', '{"size": 10, "mimetype": "image/jpeg"}');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","aal":"aal2"}', true);
select test.expect_error($$update public.expenses set amount_cents = 99999 where id = 'e1000000-0000-0000-0000-000000000011'$$,
                         '42501', 'leadership cannot change their own request once someone approved it');
select test.expect_error($$delete from public.expenses where id = 'e1000000-0000-0000-0000-000000000011'$$,
                         '42501', 'leadership cannot delete their own approved request');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select test.check(test.count($$select * from storage.objects where name = 'r/30000000-0000-0000-0000-0000000000a7/e0000000-0000-0000-0000-000000000012.jpg'$$) = 1,
                  'a member can open the receipt leadership attached to their request');
select test.check(test.count($$select * from storage.objects where bucket_id = 'receipts' and name like 'r/30000000-0000-0000-0000-0000000000a7/%'$$) = 1,
                  'but no other receipts of that leader');
select test.expect_error($$insert into public.finance_income (received_on, amount_cents, category_id, description) values (current_date, 1, test.cat('Bank interest'), 'x')$$,
                         '42501', 'parent cannot record income');
rollback;
