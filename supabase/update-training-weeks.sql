-- Weeks follow your training, not the calendar.
-- A week ends when you've done as many sessions as the schedule has days.
-- Safe to re-run: the backfill only touches rows that haven't been migrated yet.

begin;

alter table public.program_progress
  add column if not exists training_week integer not null default 1 check (training_week >= 1),
  add column if not exists week_done_ids uuid[] not null default '{}',
  add column if not exists last_active_at timestamptz,
  add column if not exists training_weeks_migrated boolean not null default false;

-- Backfill: sessions completed this month ÷ sessions per week = weeks done.
-- A half-finished week starts over; adjust by hand afterwards if needed.
update public.program_progress p
set training_week =
      coalesce((select sum(value::int) from jsonb_each_text(p.completions)), 0)
      / greatest(
          (select count(*) from public.program_schedule s
           where s.program_id = p.program_id and s.month = p.current_month),
          1)
      + 1,
    week_done_ids = '{}',
    last_active_at = coalesce(p.last_active_at, p.updated_at, p.started_at),
    training_weeks_migrated = true
where not p.training_weeks_migrated;

commit;

-- Check the result:
-- select pr.title, p.current_month, p.training_week, p.week_done_ids, p.last_active_at
-- from public.program_progress p join public.programs pr on pr.id = p.program_id;

-- Set a week by hand (example: Muscle-focused, week 3):
-- update public.program_progress p set training_week = 3, week_done_ids = '{}'
-- from public.programs pr
-- where pr.id = p.program_id and pr.title = 'Muscle-focused kettlebell program';
