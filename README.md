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
