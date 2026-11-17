-- Patch the live Muscle program. Does not truncate progress.
-- Rep ranges stay stored as ranges. The app shows one count for the current week.

update public.programs
set duration = '12 weeks'
where id = 'a0dc9b80-9101-4997-afb3-2a19778df3ee';

update public.program_schedule
set workout_id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a'
where program_id = 'a0dc9b80-9101-4997-afb3-2a19778df3ee'
  and day = 'Friday'
  and month = 1;

update public.workout_exercises
set bell = '20 kg'
where workout_id = '5ffe08e8-5c0b-4347-a912-46ce2af00d65'
  and name = 'Goblet Squat';

update public.workout_exercises
set bell = 'BW / 12–16 kg'
where workout_id = '5ffe08e8-5c0b-4347-a912-46ce2af00d65'
  and name = 'Push Up or Floor Press';

update public.workout_exercises
set bell = '20 kg'
where workout_id = '5ffe08e8-5c0b-4347-a912-46ce2af00d65'
  and name = 'Suitcase Hold or Carry';

update public.workout_exercises
set notes = ARRAY['Brace before pressing. Avoid loaded left-arm reps that cause loss of control, and have the shoulder assessed before progressing. Do not rush to 20 kg.']::text[]
where workout_id = 'c3993c1b-17b4-45b7-adb0-eab79913ba3e'
  and name = 'Single Arm Clean & Press';

update public.workout_exercises
set bell = 'BW / 12–16 kg'
where workout_id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a'
  and name = 'Push Up or Floor Press';

update public.workout_exercises
set bell = '16–20 kg'
where workout_id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a'
  and name = 'Kettlebell Swing';

update public.workout_exercises
set bell = '20 kg'
where workout_id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a'
  and name = 'Suitcase March';
