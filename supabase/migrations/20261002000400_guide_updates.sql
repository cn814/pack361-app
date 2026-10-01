-- Pack guide text for the new features: paying in the app, documents, saved-on-this-phone
-- copies of medical forms, in-app RSVPs, and yearly Safeguarding Youth renewal. Each change
-- swaps one sentence, so pages the committee has already edited elsewhere keep their edits
-- (a sentence they rewrote is simply left alone).

update public.guide_pages set body = replace(body,
    '- **My family:** your contact info, photo permission, medical forms, dues and alerts.',
    '- **My family:** your contact info, photo permission, medical forms, what you owe the pack, and alerts.
- **Pay the pack:** dues, registration and event fees, paid with PayPal, Venmo or a card.
- **Documents:** forms, packing lists, minutes and other pack papers.')
 where slug = 'welcome';

update public.guide_pages set body = replace(body,
    '- Sign up on the campout''s page in the app (Events tab) and pay if there''s a fee.',
    '- RSVP on the campout''s page in the app (Events tab), and pay any fee from **Pay the pack** on My family.')
 where slug = 'camping';

update public.guide_pages set body = replace(body,
    '**Don''t upload it to the app.** The app never stores medical information.',
    '**Don''t upload it to the app.** The app never stores medical information. To keep your own copy handy for next year, save a photo or PDF in [Saved on this phone](/family/files). It stays on your phone; the pack never sees it.')
 where slug = 'medical-forms';

update public.guide_pages set body = replace(body,
    'Safeguarding Youth training at my.scouting.org and renews it every two years.',
    'Safeguarding Youth training at my.scouting.org and renews it every year.')
 where slug = 'youth-protection';

update public.guide_pages set body = replace(replace(body,
    'The amount and payment details also go in Pack admin -> Pack settings, so they show on each family''s page.',
    'Set the amounts in Leaders -> Money -> Settings, then add the dues there so each family sees them on Pay the pack.'),
    '[Leaders: TroopWebHost, Givebutter, check to the pack, and so on.]',
    'Pay in the app: tap **Pay the pack** on My family and use PayPal, Venmo or a card. Paying by check or cash? Tap **I paid another way** there, and the treasurer confirms it. [Leaders: who checks are made out to, and where to drop them off.]')
 where slug = 'dues';
