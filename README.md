# Kettlebell

A mobile-first workout timer. The Beginner 3-month track ships with the app. Signed-in people can also build workouts and programs from the shared glossary.

```bash
npm install
cp .env.example .env.local
```

Fill in from the Supabase project **API Keys** tab:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) — safe for the browser; this replaced the old `anon` key. See [API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Then in the SQL editor:

1. Run [`supabase/schema.sql`](supabase/schema.sql)
2. Run `npm run seed` and paste [`supabase/seed.sql`](supabase/seed.sql)
3. Sign up in the app, then make yourself admin:

```sql
update public.profiles set is_admin = true where id = auth.uid();
```

```bash
npm run dev
```

On your phone, open the local URL and add it to the home screen.

## What you can do

- Train the Beginner months (Fundamentals, Power & Conditioning, Complexes & Intensity).
- Add glossary moves if you are an admin — one shared catalog for everyone.
- Create workouts from those moves, then assemble them into a program with a weekly schedule.
- Publish a program so anyone signed in can start it. Progress stays per person.

Markdown in `workouts/` is only the seed source for the Beginner track. Runtime data lives in Supabase.
