# Brain Dump

An ADHD-friendly brain-dump app for phone and laptop. Type or say whatever is in your head. Claude sorts it into tasks, reminders, goals, ideas and notes across your life areas, writes a clear to-do list for today, and keeps gently following up.

## What it does

- **Capture first.** One box, one button, or talk. Messy is fine. It works offline and syncs later.
- **Everything put in its place.** Claude files thoughts into folders per class or project, and turns them into something ready to use: slides and lesson notes for a class, an email draft for a work idea (with a reminder to send it next morning), documents and checklists. Slides open in a full-screen presenter, emails open straight in Mail, and both stay readable offline.
- **Zero upkeep.** You never have to tick anything. Say "sent the email to Omar" and it clears itself; tasks ignored for three weeks quietly step aside.
- **Today's list on the first page.** Each morning Claude writes 3 to 7 things to do, in order, from everything you've dumped. It adds small next steps for goals and life areas that have gone quiet: career, education, money, health, home & family, friends, personal, spiritual, religion.
- **Follow-ups.** Reminders arrive as notifications, ignored ones come back up to 3 times, snoozes wake up on time, and a morning notification says your list is ready. Quiet hours are respected.
- **Everything, findable.** Filter by life area or type, search, and see what you finished this week.
- **English and Egyptian Arabic.** Talk in either (voice toggle EN / عربي); work and formal outputs come out in English.
- **Photos and screenshots.** Dump a picture of a schedule, flyer or whiteboard and Claude reads it.
- **Downloads and drafts.** Slides download as PowerPoint. Work emails open in Outlook, personal ones in Gmail; you always send them yourself, and unsent drafts keep getting (varied) reminders.
- **Faith.** Prayer-time reminders (Egyptian method, from your location), one page of Quran a day with a streak, and other nudges pause around the adhan.
- **Daily learning.** A 5 to 10 minute bite every day, alternating Sunni Islamic knowledge and general ideas.
- **Cycle.** Optional tracking pauses prayer reminders during a period and gives a discreet heads-up for the estimated fertile window.
- **Nudges that don't fade into the background.** Re-nudges change style each time (tiny step, 2-minute timer, why it matters, a choice, a joke), and "Just show me one thing" turns the list into a single card with a timer.
- **Calendar.** A day timeline and a month view of everything with a time: reminders, today's list, prayers, the daily cooking and learning moments, and period and fertile days.
- **Money and goals.** Say "paid 450 for groceries", "salary came in" or dump a receipt, and it lands in this month's spending by category. Set a monthly budget (with a heads-up at 80%), savings goals with progress and how much to save a month, and life goals with small steps in the daily list.
- **Cooking.** Dump a recipe, screenshot or reel you want to try and it's saved, cleaned up, in Recipes. Each afternoon you get one answer to "what should I cook today?", or tap "Decide for me".
- **Content planning.** TikTok and Instagram ideas become ready-to-film plans (hook, script, shots, caption, hashtags, best time), with a content calendar and filming reminders.
- **Synced live** between phone and laptop.

## How it's built

| Part | What |
| --- | --- |
| App | React + Vite installable web app (PWA), hosted on GitHub Pages |
| Data, login, sync | Supabase: Postgres with row level security, email and password login, Realtime |
| `process-dump` function | Claude splits a dump into items (life area, time, priority, folder), drafts or updates slides, notes, emails and documents, and marks done what you said you finished. Runs in the background; the `nudge` job retries anything left over |
| `plan-today` function | Claude writes today's list, adding steps for neglected goals and areas |
| `nudge` function | Runs every 5 minutes from a database cron job: prayer times, reminders and Claude-written re-nudges, snoozes, morning list at the workday or weekend start, learning bite, evening Quran nudge, fertile-window heads-up, stale-task clean-up |
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
