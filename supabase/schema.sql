-- Run this in the Supabase SQL editor first.
-- Then run `npm run seed` and paste supabase/seed.sql in the SQL editor.
-- After you sign up, if you are not already admin, run:
--   update public.profiles set is_admin = true where id = auth.uid();
-- The first account to sign up is also made admin automatically.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.glossary_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  steps text[] not null default '{}',
  notes text[] not null default '{}',
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists glossary_entries_name_idx
  on public.glossary_entries (lower(name));

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  rounds integer not null default 1 check (rounds >= 1),
  type text not null default 'regular' check (type in ('regular', 'emom', 'circuit')),
  is_builtin boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.workouts add column if not exists type text;
update public.workouts set type = 'regular' where type is null;
alter table public.workouts alter column type set default 'regular';
alter table public.workouts alter column type set not null;
alter table public.workouts drop constraint if exists workouts_type_check;
alter table public.workouts add constraint workouts_type_check
  check (type in ('regular', 'emom', 'circuit'));

alter table public.workouts add column if not exists types text[] not null default array['regular']::text[];
update public.workouts
set types = array[coalesce(type, 'regular')]
where cardinality(types) < 1;
alter table public.workouts drop constraint if exists workouts_types_check;
alter table public.workouts add constraint workouts_types_check
  check (types <@ array['regular', 'emom', 'circuit']::text[] and cardinality(types) >= 1);

alter table public.workouts add column if not exists round_rest_sec integer not null default 0;

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  glossary_id uuid references public.glossary_entries (id) on delete set null,
  name text not null,
  sort integer not null default 0,
  work_sec integer not null default 30,
  rest_sec integer not null default 30,
  reps integer,
  target text,
  bell text,
  notes text[] not null default '{}'
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  stage text,
  duration text,
  difficulty text,
  focus text,
  equipment text[] not null default '{}',
  warmup jsonb,
  phases jsonb not null default '[]',
  is_builtin boolean not null default false,
  is_public boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.program_workouts (
  program_id uuid not null references public.programs (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  sort integer not null default 0,
  month integer not null default 1,
  primary key (program_id, workout_id)
);

create table if not exists public.program_schedule (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  day text not null,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  month integer not null default 1
);

alter table public.programs add column if not exists phases jsonb not null default '[]';
alter table public.program_workouts add column if not exists month integer not null default 1;
alter table public.program_schedule add column if not exists month integer not null default 1;

create table if not exists public.week_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  week_start date not null,
  done_workout_ids uuid[] not null default '{}',
  primary key (user_id, program_id, week_start)
);

create table if not exists public.program_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  current_month integer not null default 1 check (current_month >= 1),
  completions jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

alter table public.program_progress add column if not exists started_at timestamptz;
update public.program_progress
set started_at = coalesce(started_at, updated_at, now())
where started_at is null;

alter table public.profiles enable row level security;
alter table public.glossary_entries enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_workouts enable row level security;
alter table public.program_schedule enable row level security;
alter table public.week_progress enable row level security;
alter table public.program_progress enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_read_program(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.programs p
    where p.id = pid
      and (p.is_builtin or p.is_public or p.user_id = auth.uid())
  );
$$;

create or replace function public.can_read_workout(wid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workouts w
    where w.id = wid
      and (
        w.is_builtin
        or w.is_public
        or w.user_id = auth.uid()
        or exists (
          select 1
          from public.program_workouts pw
          where pw.workout_id = w.id
            and public.can_read_program(pw.program_id)
        )
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    split_part(new.email, '@', 1),
    not exists (select 1 from public.profiles where is_admin)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = public.is_admin());

drop policy if exists glossary_select on public.glossary_entries;
create policy glossary_select on public.glossary_entries
  for select to authenticated using (true);

drop policy if exists glossary_insert on public.glossary_entries;
create policy glossary_insert on public.glossary_entries
  for insert to authenticated with check (public.is_admin());

drop policy if exists glossary_update on public.glossary_entries;
create policy glossary_update on public.glossary_entries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists glossary_delete on public.glossary_entries;
create policy glossary_delete on public.glossary_entries
  for delete to authenticated using (public.is_admin());

drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts
  for select to authenticated using (public.can_read_workout(id));

drop policy if exists workouts_insert on public.workouts;
create policy workouts_insert on public.workouts
  for insert to authenticated
  with check (user_id = auth.uid() and not is_builtin);

drop policy if exists workouts_update on public.workouts;
create policy workouts_update on public.workouts
  for update to authenticated
  using (user_id = auth.uid() and not is_builtin)
  with check (user_id = auth.uid() and not is_builtin);

drop policy if exists workouts_delete on public.workouts;
create policy workouts_delete on public.workouts
  for delete to authenticated
  using (user_id = auth.uid() and not is_builtin);

drop policy if exists workout_exercises_select on public.workout_exercises;
create policy workout_exercises_select on public.workout_exercises
  for select to authenticated using (public.can_read_workout(workout_id));

drop policy if exists workout_exercises_write on public.workout_exercises;
drop policy if exists workout_exercises_insert on public.workout_exercises;
create policy workout_exercises_insert on public.workout_exercises
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = auth.uid() and not w.is_builtin
    )
  );

drop policy if exists workout_exercises_update on public.workout_exercises;
create policy workout_exercises_update on public.workout_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = auth.uid() and not w.is_builtin
    )
  );

drop policy if exists workout_exercises_delete on public.workout_exercises;
create policy workout_exercises_delete on public.workout_exercises
  for delete to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = auth.uid() and not w.is_builtin
    )
  );

drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs
  for select to authenticated using (public.can_read_program(id));

drop policy if exists programs_insert on public.programs;
create policy programs_insert on public.programs
  for insert to authenticated
  with check (user_id = auth.uid() and not is_builtin);

drop policy if exists programs_update on public.programs;
create policy programs_update on public.programs
  for update to authenticated
  using (user_id = auth.uid() and not is_builtin)
  with check (user_id = auth.uid() and not is_builtin);

drop policy if exists programs_delete on public.programs;
create policy programs_delete on public.programs
  for delete to authenticated
  using (user_id = auth.uid() and not is_builtin);

drop policy if exists program_workouts_select on public.program_workouts;
create policy program_workouts_select on public.program_workouts
  for select to authenticated using (public.can_read_program(program_id));

drop policy if exists program_workouts_insert on public.program_workouts;
create policy program_workouts_insert on public.program_workouts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid() and not p.is_builtin
    )
  );

drop policy if exists program_workouts_update on public.program_workouts;
create policy program_workouts_update on public.program_workouts
  for update to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid() and not p.is_builtin
    )
  );

drop policy if exists program_workouts_delete on public.program_workouts;
create policy program_workouts_delete on public.program_workouts
  for delete to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid() and not p.is_builtin
    )
  );

drop policy if exists program_schedule_select on public.program_schedule;
create policy program_schedule_select on public.program_schedule
  for select to authenticated using (public.can_read_program(program_id));

drop policy if exists program_schedule_insert on public.program_schedule;
create policy program_schedule_insert on public.program_schedule
  for insert to authenticated
  with check (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid() and not p.is_builtin
    )
  );

drop policy if exists program_schedule_update on public.program_schedule;
create policy program_schedule_update on public.program_schedule
  for update to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid() and not p.is_builtin
    )
  );

drop policy if exists program_schedule_delete on public.program_schedule;
create policy program_schedule_delete on public.program_schedule
  for delete to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.user_id = auth.uid() and not p.is_builtin
    )
  );

drop policy if exists week_progress_select on public.week_progress;
create policy week_progress_select on public.week_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists week_progress_insert on public.week_progress;
create policy week_progress_insert on public.week_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists week_progress_update on public.week_progress;
create policy week_progress_update on public.week_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists week_progress_delete on public.week_progress;
create policy week_progress_delete on public.week_progress
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists program_progress_select on public.program_progress;
create policy program_progress_select on public.program_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists program_progress_insert on public.program_progress;
create policy program_progress_insert on public.program_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists program_progress_update on public.program_progress;
create policy program_progress_update on public.program_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists program_progress_delete on public.program_progress;
create policy program_progress_delete on public.program_progress
  for delete to authenticated using (user_id = auth.uid());

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
