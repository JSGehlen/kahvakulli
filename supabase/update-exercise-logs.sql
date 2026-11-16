-- What you lifted: one row per move per finished session.
-- Safe to re-run.

begin;

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  workout_id uuid references public.workouts (id) on delete set null,
  exercise_name text not null,
  bell text,
  reps integer check (reps is null or reps >= 0),
  logged_at timestamptz not null default now()
);

create index if not exists exercise_logs_user_name_idx
  on public.exercise_logs (user_id, lower(exercise_name), logged_at desc);

alter table public.exercise_logs enable row level security;

drop policy if exists exercise_logs_select on public.exercise_logs;
create policy exercise_logs_select on public.exercise_logs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists exercise_logs_insert on public.exercise_logs;
create policy exercise_logs_insert on public.exercise_logs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists exercise_logs_update on public.exercise_logs;
create policy exercise_logs_update on public.exercise_logs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists exercise_logs_delete on public.exercise_logs;
create policy exercise_logs_delete on public.exercise_logs
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.exercise_logs to authenticated;

commit;
