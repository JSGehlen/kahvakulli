-- Record when the current month began so Week 1 does not start mid-week.
-- Does not truncate progress.

alter table public.program_progress add column if not exists month_started_at timestamptz;

update public.program_progress
set month_started_at = started_at
where month_started_at is null and current_month = 1;

update public.program_progress
set month_started_at = coalesce(updated_at, started_at)
where month_started_at is null and current_month > 1;
