# FrescoKart

Landing page and order server for FrescoKart, a Kochi service that sells ready-to-cook Kerala fish kits: the fish cut for the dish, cut vegetables and measured masalas in one chilled pack.

Visitors pick a kit, build a basket and place an order, delivered in about 45 minutes. Orders, "tell me when you reach my area" sign-ups and area taps are saved on a server, and you read them on a password-protected admin page that also shows demand by area and by ad campaign.

## What is in this repository

| Path | What it is |
| --- | --- |
| `web/` | The site visitors see: `index.html` (generated), `privacy.html` and `img/`. |
| `frescokart-landing.html` | The source of the home page. Edit this one. |
| `build_site.py` | Turns `frescokart-landing.html` into `web/index.html`. |
| `server/app.py` | The server: orders, sign-ups, area votes, admin page and CSV downloads. SQLite when you run it yourself, Postgres on Vercel. |
| `api/` | The Vercel functions. Each file is a few lines that point Vercel at `server/app.py`. |
| `vercel.json`, `requirements.txt`, `.python-version` | Vercel settings. |

## Run it on your computer

Needs Python 3.9 or newer and nothing else.

```
python build_site.py
python server/app.py
```

Open <http://127.0.0.1:8080>, and <http://127.0.0.1:8080/admin> with user name `admin`. The first start prints a random admin password and saves it in `server/data/admin_password.txt`. More settings are in [server/README.md](server/README.md).

## Deploy on Vercel

On Vercel the page and the API live in one project. The data is kept in a Postgres database that you add from Vercel's Storage tab, because a Vercel function cannot keep a database file between requests.

1. **Import the repository.** In Vercel choose Add New, then Project, pick this repository and click Import. If it is not listed, use "Adjust GitHub App Permissions" and give Vercel access to it.
2. **Leave the build settings alone.** Framework Preset "Other" is right. `vercel.json` already sets the output folder (`web`) and turns the build step off.
3. **Add the admin password.** Under Environment Variables add `FK_ADMIN_PASSWORD` with a long password. Without it the admin page stays closed. Optional: `FK_NOTIFY_WEBHOOK`, a URL that receives `{"text": "..."}` for every new order or sign-up.
4. **Deploy.**
5. **Add the database.** Open the project, go to Storage, create a Neon (Postgres) database, then Connect Project and tick Development, Preview and Production. Vercel adds `DATABASE_URL` for you.
6. **Redeploy** so the new settings are used: Deployments, the latest one, the three-dot menu, Redeploy.
7. **Check it.** Open `https://your-project.vercel.app/api/health?deep=1`. You should see `{"ok": true, "db": "postgres"}`. Place a test order on the site, then open `/admin` (user `admin`) and look for it.
8. **Add your domain** under Settings, Domains, and point your ads at it.

Until a database is connected, `/api/health` says so and the page quietly falls back to opening WhatsApp with the order written out, so nothing breaks.

Use the production address for ads and sharing. Preview deployments can sit behind Vercel's own sign-in.

## Change the page

Edit `frescokart-landing.html`, run `python build_site.py`, and commit both files. The business WhatsApp number is the `WA` value near the top of the page script, and it is also written in `web/privacy.html`.

## Settings

| Variable | What it does |
| --- | --- |
| `FK_ADMIN_PASSWORD` | Admin password. Required on Vercel. |
| `FK_NOTIFY_WEBHOOK` | URL that receives `{"text": "..."}` for every new order and sign-up. |
| `DATABASE_URL` | Postgres address. Vercel adds it when you connect the database. Locally use `FK_DATABASE_URL`. |
| `FK_SECRET` | Secret behind the daily visitor code. If empty, one is made and kept in the database. |
| `FK_LIMIT_ORDERS`, `FK_LIMIT_LEADS`, `FK_LIMIT_VOTES` | Requests allowed per visitor per hour. Defaults 8, 10 and 60. |

## Before you run ads

- Have a lawyer review `web/privacy.html`. It is a plain-language template. Update its cookies section if you add Meta Pixel, Google Ads or analytics.
- Prices and offers are worked out in the visitor's browser, and the server only checks that a basket is sensible. Confirm price and availability on WhatsApp for each order before it goes out.
- Back up the database now and then. Neon has its own backup and export tools, and the admin page can download every table as CSV.
