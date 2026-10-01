-- Pack guide text: how families actually pay. Pack dues are paid on Givebutter from Pay the pack,
-- event costs in the app, and each family renews and pays Scouting America registration itself at
-- my.scouting.org (the pack doesn't collect it). Each change swaps one sentence, so a page the
-- committee has already rewritten keeps its edits (a sentence they changed is simply left alone).

update public.guide_pages set body = replace(body,
    '- **Pay the pack:** dues, registration and event fees, paid with PayPal, Venmo or a card.',
    '- **Pay the pack:** pack dues (paid on Givebutter) and event costs. Scouting America registration is renewed by each family at my.scouting.org.')
 where slug = 'welcome';

update public.guide_pages set body = replace(body,
    'Pay in the app: tap **Pay the pack** on My family and use PayPal, Venmo or a card. Paying by check or cash?',
    'Pay in the app: tap **Pay dues on Givebutter** on Pay the pack (on My family). Paying by check or cash?')
 where slug = 'dues';

update public.guide_pages set body = replace(body,
    '- Scouting America national registration: [amount, paid when you register]',
    '- Scouting America national registration: renewed and paid by each family at my.scouting.org')
 where slug = 'dues';
