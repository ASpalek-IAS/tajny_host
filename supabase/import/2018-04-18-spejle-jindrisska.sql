-- =====================================================================
-- Import kontroly ze starého systému: ŠPEJLE Jindřišská, návštěva 18. 4. 2018
-- Agent 335, původní skóre 73 %
--
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
--
-- Co skript udělá:
--   1. najde (nebo založí) firmu Špejle s.r.o. a provozovnu Jindřišská
--   2. založí dotazník „Špejle – service scan (2018)“ se všemi tématy a otázkami
--   3. založí kontrolu s vyplněnými odpověďmi ve stavu „Ke schválení“
-- Bodování: body z reportu = váha otázky, váha tématu = maximum bodů tématu.
-- Otázky označené v reportu pomlčkou (netýká se) mají odpověď „Nelze posoudit“.
-- =====================================================================

do $$
declare
  v_company  uuid;
  v_branch   uuid;
  v_template uuid;
  v_insp     uuid;
  v_topic_t  uuid;
  v_topic_i  uuid;
  v_q_t      uuid;
  v_q_i      uuid;
  t          jsonb;
  q          jsonb;
  ti         int := 0;
  qi         int;

  -- Témata: title, weight, questions[ {text, type, weight, answer, help} ]
  -- answer: yes / no / na (ano / ne / nelze posoudit), u textových otázek text
  data jsonb := $json$
  [
    {"title": "Informace o návštěvě", "weight": 0, "questions": [
      {"text": "Obsluhující", "type": "short_text", "weight": 0,
       "answer": "Hosteska, muž v tmavé košili, obsluhující č. 1, obsluhující č. 2, obsluha studené pokrmy, obsluha teplé pokrmy"},
      {"text": "Obsazenost provozovny", "type": "number", "weight": 0, "unit": "%", "answer": 80},
      {"text": "Výše účtu", "type": "number", "weight": 0, "unit": "Kč", "answer": 1189},
      {"text": "Spropitné", "type": "number", "weight": 0, "unit": "Kč", "answer": 50},
      {"text": "Konzumované pokrmy", "type": "long_text", "weight": 0, "required": false, "answer": null},
      {"text": "Nápoje", "type": "long_text", "weight": 0,
       "answer": "1 x Limonáda Citron\n1 x Limonáda Malina\n2 x Pinot\n1 x Ryzlink"},
      {"text": "Účtenka", "type": "file", "weight": 0, "required": false, "answer": null}
    ]},

    {"title": "Telefonní rozhovor – rezervace", "weight": 40, "questions": [
      {"text": "Dovolali jste se v době mimo oběda a večeře bez potíží", "weight": 5, "answer": "yes"},
      {"text": "Představil obsluhující jméno provozovny", "weight": 5, "answer": "yes"},
      {"text": "Představil obsluhující své jméno nebo příjmení", "weight": 5, "answer": "yes"},
      {"text": "Na základě dotazu hosta bylo upřesněno místo umístění rezervace", "weight": 5, "answer": "na"},
      {"text": "Zopakoval obsluhující hostovu rezervaci, aby potvrdil správné přijetí informací", "weight": 5, "answer": "yes"},
      {"text": "Rozloučila se obsluha s hostem vhodnou formulací", "weight": 5, "answer": "yes"},
      {"text": "Byl obsluhující při rozhovoru příjemný a zdvořilý", "weight": 15, "answer": "yes", "help": "Subjektivní hodnocení"},
      {"text": "Komentář agenta k této oblasti", "type": "long_text", "weight": 0, "required": false,
       "answer": "Host se do restaurace bez problémů dovolal i ve večerních hodinách. Obsluhující představila sebe i provozovnu, následně si s hostem upřesnila detaily rezervace, sdělené informace průběžně opakovala.\n\nV závěru poděkovala a mile se rozloučila. Obsluhující v telefonu byla přátelská, rezervace byla přijata svižně, host se na návštěvu těšil."}
    ]},

    {"title": "Kvalita služeb – styl uvítání", "weight": 100, "questions": [
      {"text": "Zaregistrovali obsluhující příchod hostů", "weight": 5, "answer": "yes"},
      {"text": "Byli hosté při vstupu ústně pozdraveni", "weight": 10, "answer": "yes"},
      {"text": "Při plné obsazenosti byli hosté vyzváni k vyčkání u baru, či jinak motivováni k vyčkání", "weight": 5, "answer": "yes"},
      {"text": "Byla rezervace hostů správně zaznamenána", "weight": 5, "answer": "yes"},
      {"text": "Host byl dotázán, zda již provozovnu dříve navštívil", "weight": 5, "answer": "no"},
      {"text": "Byli hosté uvedeni ke stolu obsluhujícím nebo dveřníkem", "weight": 5, "answer": "yes"},
      {"text": "Nabídl personál konkrétní stůl v restauraci", "weight": 5, "answer": "yes"},
      {"text": "Vysvětlil personál hostovi samoobslužný systém pro servis pokrmů", "weight": 10, "answer": "no"},
      {"text": "Byl host informován o rozdílech ceny pokrmů dle počtu špejlí", "weight": 5, "answer": "no"},
      {"text": "Personál seznámil hosta s rozmístěním teplé, studené a sladké nabídky pokrmů", "weight": 5, "answer": "no"},
      {"text": "Byl host upozorněn na oboustranné nápojové menu na papírové prostírce", "weight": 10, "answer": "no"},
      {"text": "Personál podal hostu informaci o objednávce nápojů u obsluhy", "weight": 5, "answer": "no"},
      {"text": "Host byl informován o průběžném doplňování nabídky pokrmů", "weight": 5, "answer": "no"},
      {"text": "Host byl orientován personálem kde se nachází toalety", "weight": 5, "answer": "no"},
      {"text": "Věnovali obsluhující hostům při příchodu dostatek času / pozornost / pozitivní přístup", "weight": 15, "answer": "no", "help": "Subjektivní hodnocení"},
      {"text": "Komentář agenta k této oblasti", "type": "long_text", "weight": 0, "required": false,
       "answer": "Host navštívil provozovnu ve večerních hodinách. Měl rezervaci na 20 Hod, do provozovny přišel již kolem 19 hod, aby se ujistil, zda nebude místo již dříve. V provozovně panovala velice živá atmosféra, provozovna se zdála být plně obsazena.\n\nHosté vyčkali, po chvilce k nim přišla hosteska, která se dotázala na rezervaci, hosté sdělili, že ji mají až na pozdější hodinu, hosteska jim sdělila, že jsou úplně plní, že jim přišla ještě nějaká větší skupina, hostům nabídla, že se zatím mohou postavit ke stolečku na stání nebo přijít až na čas jejich rezervace. Hosté využili druhou možnost, hosteska jim sdělila, že to pro ně bude asi komfortnější. Při prvním kontaktu s hosty hosteska i přes její vytíženost mile pozdravila, usmála se a působila pozitivně.\n\nHosté dorazili tedy o hodinu později, po krátké chvíli hosty uvítal mladý muž v černé košili, ověřil rezervaci, hosty doprovodil ke stolu.\n\nHostů se na nic dalšího neptal, neověřil, zda znají koncept, byli již hosty restaurace, popřál jim hezký večer a odešel. Hosté díky absenci veškerých informací ohledně konceptu provozovny nemají pocit, že by jim obsluhující při příchodu věnoval dostatek času.\n\nV průběhu hosté zaznamenali, že hosteska uváděla ke stolu i další hosty, po celou dobu byla aktivní a byla příjemně naladěná.\n\nHosteska - mladá slečna - působila velice sympaticky, byla oblečena ležérněji v kalhotách a tričku.\n\nObsazenost se po 20 hod mírně snížila a pohybovala se kolem 80%."}
    ]},

    {"title": "Kvalita služeb – profesionalita personálu", "weight": 140, "questions": [
      {"text": "Byli hosté vyzváni k objednávce nápojů do 3 minut od usazení", "weight": 10, "answer": "yes"},
      {"text": "Obsluhující informoval hosta o speciálních nabídkách, orientoval se v nabídce nápojů", "weight": 5, "answer": "yes"},
      {"text": "Poděkoval obsluhující hostovi za objednávku", "weight": 5, "answer": "no"},
      {"text": "Nápoje byly servírovány najednou", "weight": 5, "answer": "yes"},
      {"text": "Bylo hostům popřáno dobrou chuť", "weight": 10, "answer": "no"},
      {"text": "Zeptal se obsluhující během konzumace zda jídlo chutná", "weight": 5, "answer": "no"},
      {"text": "Průběžný debaras (na stole hosta se nehromadily prázdné talířky)", "weight": 5, "answer": "yes"},
      {"text": "Zeptal se obsluhující po dojedení zda hostovi chutnalo", "weight": 10, "answer": "no"},
      {"text": "Personál doobjednával hostovi další nápoje", "weight": 15, "answer": "yes"},
      {"text": "Personál používal pro servis a debaras nápojů plato", "weight": 10, "answer": "no"},
      {"text": "Byl host informován v průběhu návštěvy o doplnění nabídky pokrmů", "weight": 5, "answer": "no"},
      {"text": "Udržoval personál s hostem oční kontakt", "weight": 5, "answer": "yes"},
      {"text": "Nabídl personál hostovi na závěr návštěvy kávu a informoval o nabídce dezertů", "weight": 10, "answer": "yes"},
      {"text": "Byl manažer přítomen v provozovně / věnoval se hostům", "weight": 5, "answer": "na"},
      {"text": "Měli obsluhující předepsanou a reprezentativní uniformu", "weight": 10, "answer": "yes"},
      {"text": "Rozloučili se obsluhující při odchodu hosta, pozdravem", "weight": 5, "answer": "yes"},
      {"text": "Byl účet vystaven do 5 min (vrácená hotovost v pořádku)", "weight": 5, "answer": "yes"},
      {"text": "Hodnotíte rychlost servisu jako optimální potřebám hosta", "weight": 10, "answer": "yes", "help": "Subjektivní hodnocení"},
      {"text": "Měli hosté pocit, že jim byla věnována osobní péče", "weight": 10, "answer": "no", "help": "Subjektivní hodnocení"},
      {"text": "Působil manažer aktivním dojmem se zájmem o kvalitu obsluhy", "weight": 5, "answer": "na", "help": "Subjektivní hodnocení"},
      {"text": "Komentář agenta k této oblasti", "type": "long_text", "weight": 0, "required": false,
       "answer": "Krátce po usazení ke stolu přišel č. 1, hosty pozdravil a dotázal se na nápoje. Host požádal o bílé víno, č. 1 pomohl s výběrem, o nabídce měl přehled. Druhému hostu pomohl s s výběrem limonády, zodpověděl dotaz ohledně piva na čepu. K vínu nabídl vodu.\n\nV průběhu návštěvy nabídla č. 2 při jednom z debarasů další víno. Host, který si objednal limonádu, měl dopito více než 15 min a nikdo mu další nápoj nenabídl. Nabídka dalšího nápoje proběhla až za delší dobu č. 1, který nabídl i kávu nebo něco dalšího.\n\nČ. 1 – muž, menší (normální) postavy, krátké hnědé vlasy – na účtu jméno Tomáš Pauza. Hosty po příchodu ke stolu pozdravil, udržoval oční kontakt, usmíval se. O nabídce nápojů měl přehled, objednávku se snažil navýšit o vodu k vínu. Hostovi doporučil Ryzlink, následně mu ho přinesl ochutnat, host byl spokojen, a poté mu dolil do skleničky. Host toto hodnotí jako pozorné gesto.\n\nAni č.1 se při objednávce nápojů nezajímal o to, zda hosté koncept znají. Následně jim až ke konci návštěvy nabídl další nápoje nebo kávu. Č. 1 byl v přímé komunikaci milý a sympatický, ale výraznější zájem v průběhu návštěvy o hosty neprojevoval, nesnažil se s nimi navázat kontakt, něco jim doporučit, upozornit na nějakou novinku v sortimentu.\n\nV závěru přijal platbu, poděkoval a mile se rozloučil. Účet byl v pořádku, před hostem spočítal počet špejlí.\n\nč. 2 - mladá slečna s brýlemi - působila velice plaše, s hosty téměř nekomunikovala, při debarasech se pouze usmála, jinak je prováděla mlčky."}
    ]},

    {"title": "Kvalita sortimentu / presentace", "weight": 155, "questions": [
      {"text": "Byly prodejní a výstavní plochy doplněné, dostatečná nabídka", "weight": 10, "answer": "yes"},
      {"text": "Produkty působily opticky lákavě (neoschlé, čerstvé, správně nařezané)", "weight": 10, "answer": "yes"},
      {"text": "Za obslužným pultem byl vždy minimálně jeden člen personálu", "weight": 10, "answer": "yes"},
      {"text": "Obsluhující kuchař měl přehled a dokázal informovat hosta o jednotlivých pokrmech", "weight": 10, "answer": "yes"},
      {"text": "Talíře nepoškozené a čisté", "weight": 5, "answer": "yes"},
      {"text": "Teplá kuchyně: nabídka po celou dobu doplňována", "weight": 10, "answer": "yes"},
      {"text": "Teplá kuchyně: kvalita a presentace odpovídající představě hosta", "weight": 10, "answer": "yes"},
      {"text": "Teplá kuchyně: teplota pokrmů byla odpovídající", "weight": 10, "answer": "yes"},
      {"text": "Teplá kuchyně: použité suroviny čerstvé a chutné", "weight": 10, "answer": "yes"},
      {"text": "Studená kuchyně: nabídka po celou dobu doplňována", "weight": 10, "answer": "yes"},
      {"text": "Studená kuchyně: kvalita a presentace odpovídající představě hosta", "weight": 10, "answer": "no"},
      {"text": "Studená kuchyně: použité suroviny čerstvé a chutné", "weight": 10, "answer": "yes"},
      {"text": "Sladká kuchyně: nabídka byla odpovídající a byla doplňována", "weight": 10, "answer": "yes"},
      {"text": "Sladká kuchyně: kvalita a presentace odpovídající představě hosta", "weight": 10, "answer": "yes"},
      {"text": "Nápoje servírovány v čistém a nepoškozeném skle", "weight": 10, "answer": "yes"},
      {"text": "Teplota nápojů byla odpovídající jejich charakteru", "weight": 5, "answer": "yes"},
      {"text": "Kvalita nápojů odpovídala očekávání hosta", "weight": 5, "answer": "yes"},
      {"text": "Káva byla podávána v čistém a nepoškozeném inventáři", "weight": 5, "answer": "na"},
      {"text": "Byla káva servírována dle standardů (pěna, vzhled, teplota, chuť)", "weight": 5, "answer": "na"},
      {"text": "Komentář agenta k této oblasti", "type": "long_text", "weight": 0, "required": false,
       "answer": "Hostům po celou dobu nikdo z obsluhujících nepopřál dobrou chuť a neověřil spokojenost.\n\nSekce studených předkrmů a dezertů - obsluhující č. 1 (muž, krátké tmavé vlasy). Hosty nezdravil, nesnažil se s nimi navázat kontakt, i když hosté delší dobu vybírali. V úvodu návštěvy host zaznamenal, že v sekci bylo hodně produktů typu \"kousek bagety s něčím\", host nebyl s rozsahem nabídky úplně spokojen a dotázal se, zda nebude něco i s mořskými plody, č. 1 sdělil, že již nikoliv. Na tu samou věc se ptali i další hosté a byli odkázaní do sekce teplých pokrmů, kde měly být krevety. V druhé půlce návštěvy host našel mořské plody i v předkrmové nabídce, takže info od č.1. byla mylná.\n\nNěkteré \"chlebíčky\" byly již okoralé a úplně nelákaly ke konzumaci, chuťově ale byly pokrmy dobré a výborně sladěné. Dezerty byly lákavé a chutné.\n\nSekce teplých pokrmů - č. 2 - mladý muž vyšší, štíhlý - s hosty také aktivně nekomunikoval, nesnažil se doporučit, nezdravil, ale pokud host vznesl dotaz, tak odpovídal. Několik hostů se ho ptalo na již avizované krevety, sdělil přibližný čas dodání, ale ten byl ve finále delší, host se tam v mezičase přišel zeptat znovu.\n\nNabídka teplých pokrmů byla zajímavá, vše bylo čerstvé, dobře připravené a lákavé na pohled. Velice dobré byly burgery, krevety i kachna s perníkovým knedlíkem.\n\nObsluhující nosili většinou nápoje v ruce, nepůsobilo to dobře.\n\nVšechny nápoje splnily očekávání, inventář byl nepoškozený a čistý."}
    ]},

    {"title": "Stav provozovny", "weight": 55, "questions": [
      {"text": "Byl vchod do provozovny bez odpadků a nečistot", "weight": 5, "answer": "yes"},
      {"text": "Bylo interiérové osvětlení v provozu", "weight": 5, "answer": "yes"},
      {"text": "Bylo venkovní osvětlení v provozu", "weight": 5, "answer": "na"},
      {"text": "Byly podlahy v provozovně bez nečistot", "weight": 5, "answer": "yes"},
      {"text": "Byly stůl a židle čisté / nekývaly se", "weight": 5, "answer": "yes"},
      {"text": "Byly jídelní lístky čisté a úplné, zachovalé", "weight": 5, "answer": "yes"},
      {"text": "Byly příbory čisté", "weight": 5, "answer": "yes"},
      {"text": "Byly dochucovací prostředky čisté a doplněné", "weight": 5, "answer": "na"},
      {"text": "Bylo nepotřebné prostření odneseno", "weight": 5, "answer": "na"},
      {"text": "Byla vzduchotechnika v provozu", "weight": 5, "answer": "yes"},
      {"text": "Byla hudební kulisa vhodně přizpůsobena", "weight": 5, "answer": "na"},
      {"text": "Byla na toaletách čistá a suchá podlaha", "weight": 5, "answer": "yes"},
      {"text": "Byla zrcadla na toaletách vyleštěná", "weight": 5, "answer": "yes"},
      {"text": "Byl na toaletách k dispozici toaletní papír a mýdlo", "weight": 5, "answer": "yes"},
      {"text": "Byly toalety vyvětrány", "weight": 5, "answer": "yes"},
      {"text": "Komentář agenta k této oblasti", "type": "long_text", "weight": 0, "required": false,
       "answer": "Vstup do provozovny byl bez jakýchkoli nedostatků.\n\nProvozovna působila stylovým a příjemným dojmem.\n\nInteriér sladěný, koncept se hostům líbil.\n\nStoly a židle byly čisté. V průběhu návštěvy probíhal průběžný debaras, prázdné talíře se nehromadily na stolech hostů.\n\nHudební kulisu host přes přirozený šum nezaznamenal.\n\nHosté nezaznamenali žádné technické a ani jiné nedostatky.\n\nToalety byly v pořádku, všechny hygienické potřeby doplněné.\n\nHost celkově hodnotí návštěvu průměrně, byl spokojen hlavně s kvalitou nápojů a s teplými pokrmy, v druhé polovině návštěvy ho zaujala i předkrmová nabídka. Od obsluhujících host necítil žádný zájem o jeho osobu, komunikace z jejich strany byla velice omezená."}
    ]},

    {"title": "Pozitiva a negativa provozovny", "weight": 0, "questions": [
      {"text": "Pozitiva", "type": "long_text", "weight": 0,
       "answer": "- orientace Tomáše v nabídce nápojů a pomoc s jejich výběrem\n- nabídka vody k vínu\n- nabídka kávy\n- kvalita teplých pokrmů\n- čistota provozovny"},
      {"text": "Negativa", "type": "long_text", "weight": 0,
       "answer": "- bez podání informací v úvodu návštěvy o konceptu\n- absence dotazu na to, zda host již provozovnu navštívil\n- pasivní přístup obsluhujících\n- nabídka dalšího nápoje po dopití v jednom případě proběhla až po delší době\n- bez přání dobré chuti\n- bez ověření spokojenosti\n- nápoje nosili obsluhující v ruce\n- některé produkty ve studené nabídce byly okoralé a nelákaly ke konzumaci"}
    ]}
  ]
  $json$;
begin
  -- 0. Pojistka proti dvojímu importu
  if exists (select 1 from public.inspections
              where title = 'Service scan 2018 – import' and visit_at = '2018-04-18 20:00+02') then
    raise exception 'Tato kontrola už byla naimportována.';
  end if;

  -- 1. Firma a provozovna (údaje z účtenky)
  select id into v_company from public.companies
   where ico = '04660081' or name ilike 'Špejle%' order by created_at limit 1;
  if v_company is null then
    insert into public.companies (name, ico, contact_email)
    values ('Špejle s.r.o.', '04660081', 'info@spejle.eu')
    returning id into v_company;
  end if;

  select id into v_branch from public.branches
   where company_id = v_company and name ilike '%Jindřišsk%' limit 1;
  if v_branch is null then
    insert into public.branches (company_id, name, address)
    values (v_company, 'Jindřišská', 'Jindřišská 937/16, 110 00 Praha 1')
    returning id into v_branch;
  end if;

  -- 2. Šablona dotazníku + 3. kontrola (kopie otázek)
  insert into public.templates (company_id, name, description)
  values (v_company, 'Špejle – service scan (2018)', 'Převzato ze starého systému podle reportu z 18. 4. 2018')
  returning id into v_template;

  insert into public.inspections
    (company_id, branch_id, template_id, title, window_start, window_end, status,
     instructions, visit_at)
  values
    (v_company, v_branch, v_template, 'Service scan 2018 – import', '2018-04-18', '2018-04-18', 'in_progress',
     'Převzato ze starého systému (agent 335). Návštěva 18. 4. 2018 od 20:00 do 21:20.',
     '2018-04-18 20:00+02')
  returning id into v_insp;

  for t in select * from jsonb_array_elements(data) loop
    insert into public.template_topics (template_id, title, position, weight)
    values (v_template, t->>'title', ti, (t->>'weight')::numeric)
    returning id into v_topic_t;

    insert into public.inspection_topics (inspection_id, title, position, weight)
    values (v_insp, t->>'title', ti, (t->>'weight')::numeric)
    returning id into v_topic_i;

    qi := 0;
    for q in select * from jsonb_array_elements(t->'questions') loop
      insert into public.template_questions
        (topic_id, text, help_text, type, required, weight, config, position)
      values
        (v_topic_t, q->>'text', q->>'help',
         coalesce(q->>'type', 'yes_no_na')::public.question_type,
         coalesce((q->>'required')::boolean, true),
         (q->>'weight')::numeric,
         case when q ? 'unit' then jsonb_build_object('unit', q->>'unit') else '{}'::jsonb end,
         qi)
      returning id into v_q_t;

      insert into public.inspection_questions
        (inspection_id, topic_id, text, help_text, type, required, weight, config, position)
      select v_insp, v_topic_i, text, help_text, type, required, weight, config, position
        from public.template_questions where id = v_q_t
      returning id into v_q_i;

      if q->'answer' is not null and q->'answer' <> 'null'::jsonb then
        insert into public.answers (question_id, value) values (v_q_i, q->'answer');
      end if;
      qi := qi + 1;
    end loop;
    ti := ti + 1;
  end loop;

  -- 4. Odesláno ke schválení
  update public.inspections
     set status = 'submitted', submitted_at = now()
   where id = v_insp;

  insert into public.audit_log (inspection_id, action, details)
  values (v_insp, 'created', '{"source": "import ze starého systému"}'),
         (v_insp, 'submitted', '{"source": "import ze starého systému"}');

  raise notice 'Hotovo – kontrola % je ve stavu Ke schválení.', v_insp;
end
$$;
