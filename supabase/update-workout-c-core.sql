-- Replace Muscle Workout C with Core & Abs. Does not truncate progress.
-- Keeps the existing workout id so completed Fridays stay completed.

insert into public.glossary_entries (id, name, steps, notes, is_builtin) values ('2ee1fd3a-25e4-4e18-a196-c5f4112a2bb4', 'Kettlebell Around-the-Body Pass', ARRAY['Stand tall, feet shoulder-width apart.', 'Pass the kettlebell around your waist, switching hands behind and in front of your body.', 'Keep your torso steady and avoid rotating your hips.', 'Reverse direction after 10 complete circles.']::text[], '{}', true)
on conflict (id) do update set name = excluded.name, steps = excluded.steps, notes = excluded.notes, is_builtin = true;

insert into public.glossary_entries (id, name, steps, notes, is_builtin) values ('2efd463b-8f4b-4c4b-aabb-86c324698c18', 'Kettlebell Glute Bridge', ARRAY['Lie on your back, knees bent and feet flat.', 'Hold the kettlebell securely across your hips.', 'Push through your heels, raise your hips and squeeze your glutes.', 'Lower slowly without arching your back.']::text[], '{}', true)
on conflict (id) do update set name = excluded.name, steps = excluded.steps, notes = excluded.notes, is_builtin = true;

insert into public.glossary_entries (id, name, steps, notes, is_builtin) values ('db1669c0-5e15-4efb-ab66-f28b49020c65', 'Kettlebell Plank Pull-Through', ARRAY['Get into a high plank with feet slightly wider than your shoulders.', 'Place the kettlebell beside one hand.', 'Reach underneath with your opposite hand and drag it across to the other side.', 'Alternate hands, keeping your hips level and abs braced.']::text[], '{}', true)
on conflict (id) do update set name = excluded.name, steps = excluded.steps, notes = excluded.notes, is_builtin = true;

insert into public.glossary_entries (id, name, steps, notes, is_builtin) values ('e6eace82-3385-4b49-abae-7fa85672870f', 'Kettlebell Side Bend', ARRAY['Stand upright with the kettlebell in one hand.', 'Slowly bend sideways toward the kettlebell, keeping your hips still and chest facing forward.', 'Use your obliques to return to upright.']::text[], ARRAY['Avoid bending backward or swinging the weight.']::text[], true)
on conflict (id) do update set name = excluded.name, steps = excluded.steps, notes = excluded.notes, is_builtin = true;

insert into public.glossary_entries (id, name, steps, notes, is_builtin) values ('ba744483-7380-4db3-a9bf-9e3562681b97', 'Kettlebell Weighted Crunch', ARRAY['Lie on your back with knees bent.', 'Hold the kettlebell against your chest.', 'Curl your shoulders and upper back slightly off the floor using your abs.', 'Pause briefly and lower slowly.']::text[], ARRAY['Don’t pull your neck or sit all the way up.']::text[], true)
on conflict (id) do update set name = excluded.name, steps = excluded.steps, notes = excluded.notes, is_builtin = true;

update public.workouts
set name = 'Workout C — Core & Abs'
where id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a';

update public.program_schedule
set workout_id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a'
where program_id = 'a0dc9b80-9101-4997-afb3-2a19778df3ee'
  and day = 'Friday'
  and month = 1;

delete from public.workout_exercises
where workout_id = 'e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a';

insert into public.workout_exercises (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets) values ('e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a', '2efd463b-8f4b-4c4b-aabb-86c324698c18', 'Kettlebell Glute Bridge', 0, 0, 90, 15, '12–15', '20 kg', '{}', 3);
insert into public.workout_exercises (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets) values ('e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a', 'ba744483-7380-4db3-a9bf-9e3562681b97', 'Kettlebell Weighted Crunch', 1, 0, 90, 12, '8–12', 'Bodyweight–12 kg', '{}', 3);
insert into public.workout_exercises (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets) values ('e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a', '2ee1fd3a-25e4-4e18-a196-c5f4112a2bb4', 'Kettlebell Around-the-Body Pass', 2, 0, 90, 10, '10/direction', '12 kg', '{}', 2);
insert into public.workout_exercises (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets) values ('e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a', 'e6eace82-3385-4b49-abae-7fa85672870f', 'Kettlebell Side Bend', 3, 0, 90, 10, '10/side', '12 kg', '{}', 2);
insert into public.workout_exercises (workout_id, glossary_id, name, sort, work_sec, rest_sec, reps, target, bell, notes, sets) values ('e5dd35b2-5581-4ba8-a5e5-9c9cfe7de67a', 'db1669c0-5e15-4efb-ab66-f28b49020c65', 'Kettlebell Plank Pull-Through', 4, 0, 90, 6, '6/side', '12 kg', '{}', 2);
