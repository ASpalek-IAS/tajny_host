# Mystery Shopping – platforma pro kontroly

Webová aplikace pro agenturu mystery shoppingu se třemi rolemi:

- **Správce** zakládá firmy, provozovny a uživatele. Skládá dotazníky (témata a otázky), plánuje kontroly (jednorázové i opakované), přiřazuje agenty, schvaluje výsledky a vidí všechny reporty.
- **Klient** vidí naplánované kontroly a schválené výsledky svých provozoven, grafy vývoje, srovnání provozoven, PDF a export do Excelu.
- **Agent** vidí jen přiřazené kontroly a vyplňuje je (i z mobilu, s fotkami).

Technologie: Next.js 16 (App Router), Supabase (Postgres, Auth, Storage), Vercel, e-maily přes Resend.

## Jak to funguje

1. Správce založí firmu a její provozovny.
2. Vytvoří dotazník: témata s vahou a otázky (ano/ne, škála, výběr, číslo, čas, text, fotka…).
3. Naplánuje kontrolu ručně, nebo nastaví plán opakování (týdně / měsíčně / čtvrtletně) – kontroly se pak zakládají samy.
4. Každá kontrola si při vytvoření uloží **vlastní kopii otázek**. Pozdější změna dotazníku nezmění hotové kontroly. Před tím, než agent začne, lze otázky jedné kontroly upravit.
5. Agent kontrolu vyplní (ukládá se průběžně) a odešle.
6. Správce ji schválí, nebo vrátí k opravě s komentářem. Při schválení se spočítá skóre.
7. Klient dostane e-mail a vidí výsledek, PDF a statistiky.

### Bodování

Každá bodovaná odpověď dává podíl 0–1 (ano = 1, ne = 0, škála poměrně, výběr podle bodů u možností, číslo/čas podle limitu).
Skóre tématu = vážený průměr otázek, celkové skóre = vážený průměr témat (váhy témat nastavuje správce).
„Nelze posoudit“ a nevyplněné nepovinné otázky se do skóre nepočítají. Výpočet běží v databázi (`compute_inspection_score`).

### Oprávnění

Pravidla přístupu hlídá přímo databáze (Row Level Security), ne jen rozhraní:
- agent vidí jen kontroly přiřazené jemu a může je měnit jen do odeslání,
- klient vidí jen svou firmu, případně jen vybrané provozovny, a obsah kontroly až po schválení,
- klient nevidí jméno agenta ani interní poznámky (čte přes pohled `client_inspections`).

## Nasazení

### 1. Supabase

1. Založte projekt na [supabase.com](https://supabase.com) (region **Frankfurt / eu-central-1**).
2. V **SQL Editoru** spusťte postupně:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_storage.sql`
3. **Authentication → Providers → Email**: nechte zapnuté, vypněte „Allow new users to sign up“ (účty zakládá jen správce).
4. **Authentication → URL Configuration**: Site URL = adresa aplikace (např. `https://kontroly.example.cz`).
5. Volitelně **Authentication → Email → OTP expiry** prodlužte na 86400 s (24 h), ať odkazy z pozvánek vydrží déle.

### 2. Vercel

1. Nahrajte repozitář na GitHub a importujte ho ve Vercelu.
2. Nastavte proměnné prostředí podle `.env.example`:

| Proměnná | Kde ji vzít |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tamtéž, anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | tamtéž, service_role / secret key – **nikdy nesdílet** |
| `NEXT_PUBLIC_SITE_URL` | veřejná adresa aplikace |
| `NEXT_PUBLIC_APP_NAME` | název v hlavičce a v e-mailech |
| `RESEND_API_KEY`, `EMAIL_FROM` | [resend.com](https://resend.com) – ověřená doména odesílatele |
| `CRON_SECRET` | libovolný dlouhý náhodný řetězec |

3. Deploy. Soubor `vercel.json` nastaví denní úlohu `/api/cron` (7:00 SELČ), která:
   zakládá kontroly podle plánů, připomíná agentům termín 2 dny předem, upozorňuje na kontroly po termínu
   a 1. den v měsíci posílá klientům souhrn.

### 3. První správce

```bash
npm install
cp .env.example .env.local   # doplnit hodnoty
node --env-file=.env.local scripts/create-admin.mjs vas@email.cz "Jméno Příjmení" "silneHeslo"
```

Pak se přihlaste na `/login`. Další uživatele už zakládáte v aplikaci.

## E-maily

Pozvánky, obnova hesla i notifikace se posílají přes Resend.
Když `RESEND_API_KEY` chybí, aplikace funguje dál: e-maily se jen zapíší do logu
a odkaz na nastavení hesla se správci zobrazí přímo v aplikaci k ručnímu předání.

| Událost | Komu |
|---|---|
| Nový účet | uživateli (odkaz na nastavení hesla) |
| Přiřazení kontroly | agentovi |
| 2 dny před koncem termínu | agentovi |
| Po termínu | agentovi + správcům |
| Odesláno ke schválení | správcům |
| Vráceno k opravě | agentovi |
| Schváleno | uživatelům klienta s přístupem k provozovně |
| Měsíční souhrn | uživatelům klienta (lze vypnout v Můj účet) |

## Vývoj

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
```

Struktura:

```
supabase/migrations/   schéma, oprávnění, funkce (skóre, odeslání, schválení)
src/app/admin/         rozhraní správce
src/app/klient/        rozhraní klienta
src/app/agent/         rozhraní agenta
src/app/api/           PDF, export do Excelu, cron
src/components/        sdílené komponenty (editor dotazníku, formulář agenta, grafy…)
src/lib/               přístup k datům, e-maily, plánování, reporty
```
