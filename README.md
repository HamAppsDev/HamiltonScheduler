# Hamilton Scheduler

A HamApps project: plan your Hamilton College semester. Search the course catalog,
build up to three schedules per semester on a weekly calendar, and download a schedule as an
`.ics` calendar file (class meetings and final exams) for Google Calendar, Apple Calendar or Outlook.

- **Front end:** React + Vite (TypeScript)
- **Database:** Supabase (Postgres, Row Level Security)
- **Sign-in:** Google, through our own `/api/auth` server (`infra/auth.ts`), which then signs the student in to Supabase. The database lets in @hamilton.edu accounts plus a guest list and any extra school domains (see [Guest sign-ins](#guest-sign-ins))
- **Hosting:** AWS via SST (profile `hamapps`, region `us-east-2`) at https://scheduler.hamapps.dev; deploys automatically on every push to `main`

## Run it locally

Needs Docker Desktop running.

```bash
npm install
supabase start          # local database + login service, loads the sample data (real Fall 2026 + Spring 2027 catalogs, test student)
npm run dev             # http://127.0.0.1:5173
```

`.env.development.local` (git-ignored) points the dev server at the local database. On the
sign-in page, use **Local test sign-in** (`dev@hamilton.edu`). That button only appears in
development against the local database.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (time conflicts, calendar export) |
| `npm run db:test` | Database tests: sign-up rules, RLS, schedule limits (34 checks) |
| `npm run typecheck` | TypeScript check |
| `supabase db reset` | Wipe the local database and rebuild it from migrations + seed |
| `supabase stop` | Stop the local containers |

## Project layout

```
supabase/migrations/   database tables, rules, and security policies
supabase/tests/        database tests (pgTAP)
supabase/seed.sql      LOCAL-ONLY semesters and test student
supabase/seeds/        LOCAL-ONLY course catalogs (copied from the live site) + test schedules
src/                   the React app
infra/auth.ts          Google sign-in server (Lambda at /api/auth)
infra/keepalive.ts     daily Supabase check; emails an alert if it's down
infra/github-deploy-role.yaml   AWS role GitHub Actions uses to deploy (no AWS keys in GitHub)
.github/workflows/     deploy on push to main
sst.config.ts          AWS hosting (CloudFront Router, S3 site, Lambdas, alerts)
```

Course data tools (`scripts/`) and data files (`data/`) are git-ignored and stay on the
maintainer's computer; see `scripts/README.md` there.

## Adding a search filter

No database access needed: the local seed has the full real catalogs, and filters run in the
browser on the semester's loaded courses.

All filters live in the **Filters** panel (the button next to the search box, `src/components/FiltersPanel.tsx`);
the ones that are on show as a removable line under the search box. The course-type chips (Writing Intensive,
Quantitative, First Year, Phys Ed, …) come from
`TYPE_FILTERS` in `src/lib/filters.ts`. **To add a course-type filter, add one line there**; the chip,
the filtering and the empty-search browsing all follow from it:

```ts
{ id: 'qlit', label: 'Quant Literacy', types: ['Qlit Course'] },
```

A filter matches a section that has any of its `types` labels; with several chips on, a section must
match all of them. Clicking a chip cycles **off → include (only these) → exclude (hide these) → off**
(`cycleFilter`). With any chip on, an empty search lists every matching course. Add a test case in
`src/lib/filters.test.ts`.

Each section has `types`: the course types from Self-Service. Labels are Self-Service's own:

| Label in `types` | Meaning |
|---|---|
| `Writing Intensive Courses` | Writing-intensive. Use this label, not the code: most W codes match, but not all (e.g. SOC 276W in Spring 2027 is untagged) |
| `Speaking Intensive Course` | Speaking-intensive |
| `Quantitative & Symbolic R` | Quantitative & symbolic reasoning |
| `Qlit Course` | Quantitative literacy |
| `First Year Courses` | Reserved for first-years (can be one section of a course) |
| `Proseminar` | Proseminar |
| `Cultural Diversity Course`, `Diversity Course` | Diversity requirements |
| `Soc, Struct & Inst Hier` | Social structures & institutional hierarchies |
| `Senior Project`, `Co-Lab Course`, `Experiential Learning`, `Physical Education Course`, … | Others; list them all with `select distinct unnest(types) from sections;` |

Types are per **section** (e.g. only one MATH 113 section is first-years only), so filters keep the
sections that match (`src/components/Sidebar.tsx`, the `results` list).
Day/time (`matchesWhen`: only the chosen days, start after, end by; final exams ignored, sections with no set
time pass) and level (`matchesCourse`) are in the same file; "hide classes that conflict with my schedule" is
checked in `Sidebar.tsx`, which knows the schedule. A new kind of filter goes in `filters.ts`,
in `SearchFilters`, and gets a control in the panel and a label in `FilterSummary`.

Keep Self-Service's labels in the database and put friendly names in `label`, so the next catalog
import keeps matching.


## Labs and prerequisites

**Labs** are separate courses in Self-Service (CHEM 190L next to CHEM 190). `src/lib/labs.ts` pairs a
lab with the class of the same code minus the "L", or with every lettered class of that number when
they share one (BIO 100L goes with BIO 100B, BIO 100P, …). Search shows the lab inside its class's
card; adding the class asks for a class time, then a lab time, on the calendar (a step with one choice
is filled in), and saves nothing until both are picked. Class and lab share one saved card and color.

**Class year** ("My class year" in the Filters panel, remembered on the device) comes from each section's
note ("Open to Srs., Jrs. & Sophomores", "Open to First Years only"): `src/lib/classYear.ts` reads the common
phrasings and ignores "Not open to …" and "by permission". Search hides courses with no section open to the
student's year, section picking leaves those sections out, and each place says so with a tip to email the
professor. A section whose note states no year limit is open to everyone.

**Prerequisites/corequisites** (`courses.prerequisites`, `courses.corequisites`) are the text from
each course's public catalogue page, collected by the local data tools and shown for reading only:
the app never checks them.

## Guest sign-ins

Who may sign in is decided by the live database, not the code: the trigger
`private.enforce_hamilton_google()` on `auth.users` allows `@hamilton.edu` emails, anyone in the
guest list `private.allowed_emails`, and every email at a school domain in `private.allowed_domains`.
All of these were set up directly in Supabase, **not** by a migration in this repo, so a database
rebuilt from `supabase/migrations` is Hamilton-only until the setup below is run again. Guest emails
and extra domains are never committed (this repo is public).

Manage guests in Supabase → SQL Editor (production project). No code change or deploy is needed:

```sql
-- Add a guest (they choose "Use another account" on Google's screen)
insert into private.allowed_emails (email, note) values ('someone@example.edu', 'why they have access');
-- List guests
select * from private.allowed_emails order by added_at;
-- Remove a guest: stop new sign-ins, then end their account (Authentication → Users → delete)
delete from private.allowed_emails where email = 'someone@example.edu';

-- Let in a whole school (every verified email at that domain)
insert into private.allowed_domains (domain, note) values ('example.edu', 'why they have access');
-- List / remove extra domains
select * from private.allowed_domains order by added_at;
delete from private.allowed_domains where domain = 'example.edu';
```

<details><summary>One-time setup (already done on production; rerun if the database is rebuilt)</summary>

```sql
create table if not exists private.allowed_emails (
  email    text primary key check (email = lower(email) and email like '%_@_%'),
  note     text,
  added_at timestamptz not null default now()
);
revoke all on private.allowed_emails from public, anon, authenticated;

create table if not exists private.allowed_domains (
  domain   text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  note     text,
  added_at timestamptz not null default now()
);
revoke all on private.allowed_domains from public, anon, authenticated;

create or replace function private.enforce_hamilton_google() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or (
       lower(new.email) !~ '^[^@]+@hamilton\.edu$'
       and not exists (select 1 from private.allowed_emails a where a.email = lower(new.email))
       and not (
         lower(new.email) ~ '^[^@]+@[^@]+$'
         and exists (select 1 from private.allowed_domains d where d.domain = split_part(lower(new.email), '@', 2))
       )
     ) then
    raise exception 'Only @hamilton.edu accounts can sign in.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'Please sign in with Google.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
```

</details>

## Secrets

Never commit `.env`. Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | No |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key | No (public by design) |
| `SUPABASE_URL` | Same as the Project URL | No |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key | **Yes**: local data tools only, never in a `VITE_` variable |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Zone DNS edit for hamapps.dev) | **Yes** |
| `CLOUDFLARE_DEFAULT_ACCOUNT_ID` | Cloudflare dashboard → hamapps.dev → Account ID | No |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials | No |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same OAuth client | **Yes** |
| `AUTH_COOKIE_SECRET` | Any long random string (`openssl rand -base64 32`) | **Yes** |

## How it's deployed

Every push to `main` runs `.github/workflows/deploy.yml`: unit tests, then
`npx sst deploy --stage production`. GitHub signs in to AWS with the role from
`infra/github-deploy-role.yaml` (stack `hamilton-scheduler-github`, us-east-2), so no AWS keys
are stored in GitHub. The workflow needs the repository variable `AWS_DEPLOY_ROLE_ARN` and the
`.env` values above (except the `SUPABASE_*` data-tool ones) as repository secrets
(Settings → Secrets and variables → Actions).

To deploy by hand instead: `eval "$(aws configure export-credentials --profile hamapps --format env)"`,
then `npx sst deploy --stage production`.

### Online setup (already done; for reference if it ever needs redoing)

1. **Google OAuth client** (Web application), authorized redirect URI
   `https://scheduler.hamapps.dev/api/auth/callback/google`.
2. **Supabase → Authentication → Providers:** Google enabled with the same client ID (Supabase
   checks the ID token the `/api/auth` server hands it); Email and other providers disabled.
   The database also rejects non-Google sign-ups.
3. **Supabase → Authentication → URL Configuration:** Site URL `https://scheduler.hamapps.dev`.
4. **Database schema:** `supabase link --project-ref evczdyzsqzwuxudjvhsc`, then `supabase db push`
   whenever a new migration is added.
5. **Course data:** loaded with the local data tools (`scripts/`, not in this repo).
6. **Alerts:** confirm the one-time SNS subscription email sent to `hamappsdevs@gmail.com`.
