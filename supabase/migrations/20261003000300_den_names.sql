-- Den names drop the number: "Bear" instead of "Bear Den 5". The pack has one den per rank, and
-- families know dens by rank. The number stays in dens.number (Scoutbook's den number) and is
-- shown on Pack admin -> Dens. name is a generated column, so it is re-created.
alter table public.dens drop column name;
alter table public.dens add column name text generated always as (
    case rank
      when 'lion' then 'Lion' when 'tiger' then 'Tiger'
      when 'wolf' then 'Wolf' when 'bear' then 'Bear'
      when 'webelos' then 'Webelos' when 'aol' then 'Arrow of Light'
    end) stored;
