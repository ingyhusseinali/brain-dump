# Setting up Brain Dump

About 20 minutes, once. After that, every push to `main` tests and deploys automatically.

## 1. Supabase (database, login, sync)

1. Create a free project at [supabase.com](https://supabase.com). Save the database password it asks for.
2. In **Project Settings → API**, note the **Project ref** (the `xxxx` in `https://xxxx.supabase.co`) and the **anon public** key.
3. In **Account → Access Tokens**, create a token for GitHub to deploy with.
4. In **Authentication → Email Templates → Magic Link**, make sure the email includes `{{ .Token }}` so it contains a 6-digit code. The app signs in with the code, because iPhone Home Screen apps can't receive magic links.

## 2. Anthropic (Claude)

Create an API key at [console.anthropic.com](https://console.anthropic.com) and add a little credit. Sorting dumps and writing one list a day costs very little.

## 3. Notification keys

Run this once on any computer with Node installed:

```sh
npx web-push generate-vapid-keys
```

Keep both keys. The private key is a secret.

## 4. GitHub secrets

In the repo, open **Settings → Secrets and variables → Actions** and add:

| Name | Value |
| --- | --- |
| `SUPABASE_PROJECT_REF` | project ref from step 1 |
| `SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_ACCESS_TOKEN` | access token |
| `SUPABASE_DB_PASSWORD` | database password |
| `ANTHROPIC_API_KEY` | Claude API key |
| `VAPID_PUBLIC_KEY` | public key from step 3 |
| `VAPID_PRIVATE_KEY` | private key from step 3 |
| `VAPID_SUBJECT` | `mailto:` followed by your email |

Then in **Settings → Pages**, set **Source** to **GitHub Actions**, and run the **Test and deploy** workflow from the **Actions** tab.

## 5. Start the follow-up engine

In Supabase, open the **SQL Editor** and run (with your project ref):

```sql
select public.schedule_nudges('https://YOUR-PROJECT-REF.supabase.co');
```

## 6. Install on your devices

- **iPhone:** open the app link (shown on the workflow run) in Safari, tap **Share → Add to Home Screen**, open it from the Home Screen, sign in, then **Settings → Turn on reminders**.
- **Laptop:** open the link in Chrome or Edge and use **Install app** in the address bar, or keep it as a pinned tab. Turn on reminders there too.
