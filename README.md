# Kettlebell

A mobile-first workout timer. Drop a markdown file into `workouts/` and it becomes a program in the app.

```bash
npm install
npm run dev
```

On your phone, open the local URL and add it to the home screen. The session screen keeps a large timer, the current move, suggested bell, and the next interval. It beeps on work/rest changes and tries to keep the screen awake.

## Adding a workout

Create `workouts/my-program.md`. The parser is built around this shape:

```markdown
# Level 2 — Kettlebell Program

Equipment

* 1 × 16 kg kettlebell

Month: 1
Difficulty: Beginner
Focus: Two-hand squat, press, and row.

Weekly Schedule

Day	Workout
Monday	Workout A
Friday	Workout B

---

Warm-Up

Repeat for 3–5 minutes:

1. March or jog on the spot — 30 seconds
2. Arm circles — 15 seconds

---

Workout A

Repeat 3×

1. Goblet Squats
    * Work: 30 seconds
    * Rest: 45 seconds
    * Suggested bell: 16 kg
2. Kettlebell Row
    * Work: 30 seconds
    * Rest: 45 seconds
    * Suggested bell: 16 kg

---

Exercise Glossary

Goblet Squat

1. Hold the kettlebell at chest height.
2. Sit your hips back and down.

---

Quick Weight Reference

Exercise	Suggested Bell
Goblet Squat	16 kg
```

Rules that matter:

- The first heading or first line is the program title.
- `Month:`, `Difficulty:`, `Name:`, and `Focus:` show on the home-screen cards.
- `Workout A`, `Workout B`, and any other `Workout …` block becomes a startable session.
- `Work:` and `Rest:` lines become the timer. `Suggested bell:` shows under the exercise name.
- `Repeat 3×` is the number of rounds.
- Glossary names are matched fuzzily, so `Goblet Squats` still finds `Goblet Squat`.
- `##` headings are optional. `---` dividers are optional.

Level 1 from the original program already lives in `workouts/level-1.md`.
