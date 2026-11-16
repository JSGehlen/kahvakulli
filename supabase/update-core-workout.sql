-- Rework "Workout C — Core & Abs" in the muscle-focused program.
-- Straight sets with 90s rests become a 3-round loaded core circuit:
-- standing moves first, floor moves last, 30s between moves, 90s between rounds.
-- Safe to re-run. Does not touch progress or other workouts.

begin;

-- Stop if the workout name doesn't match exactly one row.
do $$
declare
  hits integer;
begin
  select count(*) into hits from public.workouts where name = 'Workout C — Core & Abs';
  if hits <> 1 then
    raise exception 'Expected 1 workout named "Workout C — Core & Abs", found %', hits;
  end if;
end $$;

-- New glossary moves (updated if they already exist).
insert into public.glossary_entries (name, steps, notes, is_builtin) values
(
  'Waiter''s March',
  ARRAY[
    'Clean the kettlebell and press it overhead with one arm.',
    'Lock the elbow, biceps by your ear, wrist straight.',
    'Keep your ribs down and glutes tight.',
    'March slowly in place, lifting one knee at a time.',
    'Do not lean or let the arm drift forward.',
    'Switch hands halfway through the interval.'
  ]::text[],
  ARRAY['Bring the bell down under control between sides.']::text[],
  true
),
(
  'Half Turkish Get-up',
  ARRAY[
    'Lie on your back with the kettlebell pressed to the ceiling in your right hand.',
    'Bend your right knee, foot flat. Left arm and leg out at about 45 degrees.',
    'Keep your eyes on the bell and the arm vertical the whole time.',
    'Roll up onto your left elbow.',
    'Press up onto your left hand, arm straight.',
    'Pause, then reverse each step slowly back to the floor.',
    'Finish the reps, then switch sides.'
  ]::text[],
  ARRAY['Learn it first with a shoe balanced on your fist instead of a bell.']::text[],
  true
),
(
  'Kettlebell Dead Bug',
  ARRAY[
    'Lie on your back holding the kettlebell by the horns above your chest, arms straight.',
    'Lift your knees above your hips, shins parallel to the floor.',
    'Press your lower back into the floor.',
    'Slowly straighten one leg until the heel hovers just above the floor.',
    'Bring it back and switch legs.'
  ]::text[],
  ARRAY['If your lower back lifts, shorten the range.']::text[],
  true
)
on conflict ((lower(name))) do update
  set steps = excluded.steps, notes = excluded.notes, is_builtin = true, updated_at = now();

-- Halo: only added if you don't have it yet.
insert into public.glossary_entries (name, steps, notes, is_builtin) values
(
  'Halo',
  ARRAY[
    'Hold the kettlebell upside down by the horns at chest height.',
    'Circle it around your head, close to your neck and face.',
    'Keep your ribs down, glutes tight and hips still.',
    'Change direction each rep.'
  ]::text[],
  '{}',
  true
)
on conflict ((lower(name))) do nothing;

-- Workout shape: 3 rounds, Regular.
update public.workouts
set rounds = 3, round_rest_sec = 90, type = 'regular', types = ARRAY['regular']::text[]
where name = 'Workout C — Core & Abs';

-- Replace the moves.
delete from public.workout_exercises
where workout_id = (select id from public.workouts where name = 'Workout C — Core & Abs');

insert into public.workout_exercises
  (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets)
select
  w.id,
  (select g.id from public.glossary_entries g where g.name ilike m.glossary order by g.created_at limit 1),
  m.name, m.sort, m.work_sec, m.rest_sec, m.reps, m.target, m.bell, m.notes, null
from public.workouts w
cross join (values
  ('Halo',                         'Halo',                0,  0, 30, 10, '5 each way',   '12–16 kg', ARRAY['Ribs down. Hips do not move.']::text[]),
  ('Waiter''s March',              'Waiter''s March',     1, 60, 30, null, '30s each side', '12 kg', ARRAY['Arm locked overhead. Slow knees.']::text[]),
  ('Suitcase March',               'Suitcase March',      2, 80, 30, null, '40s each side', '20 kg', ARRAY['Do not lean toward or away from the bell.']::text[]),
  ('Half Turkish Get-up — Left',   'Half Turkish Get-up', 3,  0, 15, 3, '3 reps, bell in left hand',  '12 kg', ARRAY['Eyes on the bell.']::text[]),
  ('Half Turkish Get-up — Right',  'Half Turkish Get-up', 4,  0, 30, 3, '3 reps, bell in right hand', '12 kg', ARRAY['Eyes on the bell.']::text[]),
  ('Kettlebell Dead Bug',          'Kettlebell Dead Bug', 5,  0, 30, 16, '8 per side',   '12–16 kg', ARRAY['Lower back stays down.']::text[]),
  ('Kettlebell Plank Pull-Through','%pull-through%',      6,  0, 90, 16, '8 per side',   '12–16 kg', ARRAY['Hips square. No rocking.']::text[])
) as m(name, glossary, sort, work_sec, rest_sec, reps, target, bell, notes)
where w.name = 'Workout C — Core & Abs';

commit;
