# Brain Dump

An ADHD-friendly brain-dump app for phone and laptop. Type or say whatever is in your head. Claude sorts it into tasks, reminders, goals, ideas and notes across your life areas, writes a clear to-do list for today, and keeps gently following up.

## What it does

- **Capture first.** One box, one button, or talk. Messy is fine. It works offline and syncs later.
- **Today's list on the first page.** Each morning Claude writes 3 to 7 things to do, in order, from everything you've dumped. It adds small next steps for goals and life areas that have gone quiet: career, education, money, health, home & family, friends, personal, spiritual, religion.
- **Follow-ups.** Reminders arrive as notifications, ignored ones come back up to 3 times, snoozes wake up on time, and a morning notification says your list is ready. Quiet hours are respected.
- **Everything, findable.** Filter by life area or type, search, and see what you finished this week.
- **Synced live** between phone and laptop.

## How it's built

| Part | What |
| --- | --- |
| App | React + Vite installable web app (PWA), hosted on GitHub Pages |
| Data, login, sync | Supabase: Postgres with row level security, email-code login, Realtime |
| `process-dump` function | Claude splits a dump into items with life area, time and priority |
| `plan-today` function | Claude writes today's list, adding steps for neglected goals and areas |
| `nudge` function | Runs every 5 minutes from a database cron job: reminders, re-nudges, snoozes, morning list |
| Notifications | Web Push. Works on iPhone once the app is added to the Home Screen (iOS 16.4+) |

The shared follow-up rules live in `supabase/functions/_shared/schedule.ts` and are tested in `tests/`.

## Develop

```sh
npm install
cp .env.example .env.local   # Supabase URL, anon key, VAPID public key
npm run dev
npm test
npm run check:functions      # needs Deno
```

Setting it up from scratch is in [SETUP.md](SETUP.md).
