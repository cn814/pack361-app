-- Pages anyone can read (the public join page and its linked pages) say "Monday evenings in
-- Columbia" instead of naming the church. Members still see the meeting place in the app.

begin;

update public.guide_pages
   set body = replace(body, 'at the First Presbyterian Church of Howard County in Columbia', 'in Columbia')
 where is_public
   and body like '%at the First Presbyterian Church of Howard County in Columbia%'
returning slug, title;

commit;
