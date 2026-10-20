# Intaliq SE365 Prototype

Mobile-first working prototype based on `figma/Intaliq-Low-Fidelity-Prototype.pdf`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173/`.

Create `.env.local` first:

```bash
cp .env.example .env.local
```

Then fill in:

```text
VITE_SUPABASE_URL=your Supabase project URL
VITE_SUPABASE_ANON_KEY=your Supabase anon public key
```

## Build for Vercel

```bash
npm run build
```

The static build is written to `dist/`, which is configured in `vercel.json`.

## Prototype scope

- Supabase email/password account creation and sign in
- Goal setup with progress and checkpoint flags
- Join, create, open, and leave sessions
- Profile editing with Supabase user metadata

Goal and session prototype data still uses per-user `localStorage`. Auth and profile metadata use Supabase.

## Supabase setup

1. Create a Supabase project.
2. Go to Project Settings -> API.
3. Copy the Project URL into `VITE_SUPABASE_URL`.
4. Copy the anon public key into `VITE_SUPABASE_ANON_KEY`.
5. Go to Authentication -> URL Configuration.
6. Add these redirect URLs:

```text
http://127.0.0.1:4173
https://intaliq-se-365.vercel.app
```

If email confirmations are enabled, new users must confirm their email before signing in.

## Vercel environment variables

Add the same two variables in Vercel:

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_ANON_KEY preview
```

Then redeploy:

```bash
vercel --prod
```

## Admin accounts

1. Run `supabase/profile-username.sql`, then `supabase/admin.sql`, in the Supabase SQL Editor.
2. Sign up in the app as usual and finish profile setup.
3. In the SQL Editor, make that account an admin:

```sql
update public.profiles set is_admin = true where lower(email) = lower('you@example.com');
```

Admins get **Admin Dashboard** under More: platform stats, coach application review, user search, coach/user role changes, suspending and restoring accounts, granting admin to others, deleting sessions, announcements to every user, and an activity log of every admin action. Admin rights are checked in the database, not the app, and users can't grant them to themselves.

### Coach vetting

Signing up as a coach files an application; the account stays a member until an admin approves it under **Coach applications**. Turned-down applicants see the admin's note on their home screen and can apply again. Only approved coaches (and admins) can create sessions; the database enforces this. Accounts that were already coaches when `admin.sql` first ran are approved automatically.
