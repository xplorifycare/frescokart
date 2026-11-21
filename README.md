# FrescoKart

Landing page and order server for FrescoKart, a Kochi service that sells ready-to-cook Kerala fish kits: the fish cut for the dish, cut vegetables and measured masalas in one chilled pack.

Visitors pick a kit, build a basket and place an order, delivered in about 45 minutes. Orders, "tell me when you reach my area" sign-ups and area taps are saved on a server, and you read them on a password-protected admin page that also shows demand by area and by ad campaign.

## What is in this repository

| Path | What it is |
| --- | --- |
| `web/` | The site visitors see: `index.html` (generated), `privacy.html` and `img/`. |
| `web/join/` | The waiting list at `/join/` for the pre-launch demand test: customers, shop owners and riders sign up by area. |
| `web/app/` | The customer app at `/app/`: browse, basket, checkout, live order status, cook-along mode. Installable on a phone from the browser. `menu.js` is generated. |
| `frescokart-landing.html` | The source of the home page. Edit this one. |
| `build_site.py` | Turns `frescokart-landing.html` into `web/index.html`. |
| `server/app.py` | The server: orders, sign-ups, area votes, admin page and CSV downloads. SQLite when you run it yourself, Postgres on Vercel. |
| `server/demand.py`, `server/demand_admin.py` | The waiting list behind `/join/` and its live dashboard at `/admin/leads`. |
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

## The app

The app lives at `/app/` on the same address as the site (for example `https://your-domain/app/`). It sends orders to the same server, so they show on the admin page like any other order.

- **Menu and prices** come from the website. Change them in `frescokart-landing.html`, then run `python build_site.py`, which also rewrites `web/app/menu.js`.
- **Live status.** When you change an order's status on the admin page (confirmed, preparing, out for delivery, delivered, cancelled), the customer's order screen shows it within about 30 seconds. Each order gets a private key, so only the phone that placed it can follow it.
- **Install.** On Android, Chrome offers "Install app" (also in the app's Account tab). On iPhone, Safari's Share menu has "Add to Home Screen".
- **Saved on the phone.** The basket, the customer's details and their order list stay in that phone's browser. There is no login yet.

## The waiting list (demand test)

`/join/` collects interest before launch from all of Kerala, in English and Malayalam. A visitor picks who they are (customer, shop owner, rider), types their PIN code (or picks district, then place) and leaves a WhatsApp number. That is all that is required. Places that share a PIN code count together as one area. Visitors then see their place in that area and the area's rank in Kerala, get a personal share link, a button for the area's WhatsApp group, and a few optional questions: what they buy, **which nearby shops they buy from**, their flat or street, and whether they would order in the first week.

`/admin/leads` (same password as `/admin`) refreshes by itself every 20 seconds and shows:

- sign-ups today and in total, the top PIN areas against their targets, every district, and whether an area is ready (homes, shops and riders all reached)
- which poster, place or ad brought people (visits, sign-ups, conversion)
- the shops customers asked for, ranked, and whether that shop has signed up yet. Walk in with "27 of your customers asked for you".
- the people who brought the most neighbours, and the areas people typed in themselves
- everyone, with a one-tap WhatsApp welcome message in their language, a status (new, welcomed, in group, pre-booked…), a note and delete
- tools: tracked links with QR codes, add someone by hand, import a Meta lead-form CSV, edit areas, targets and WhatsApp group links, and Telegram alerts

**Town links and tracked links.** `/join/thrissur` opens the page with a district picked, `/join/kakkanad` or `/join/682030` with a PIN area picked. The link tool on `/admin/leads` builds these with a source name for each poster, place and ad, for example `/join/kakkanad?src=poster-kakkanad-infopark&lang=ml`. Add `&role=shop` or `&role=rider` for shop and rider posters. On day 10, use the **Week-1 ask** button next to each customer on `/admin/leads`: it opens WhatsApp with a personal link that takes them straight to "Would you order in our first week?" on their own page. For a broadcast, ask them to reply YES and set their status to "Pre-booked" yourself.

**Phone alerts (Telegram).** Create a bot with @BotFather, add its token as `FK_TG_TOKEN` in Vercel and redeploy, press Start in the bot, then press "Find my chat" on `/admin/leads`. Every sign-up then reaches your phone, and Vercel Cron sends a summary each evening around 9 PM IST (`crons` in `vercel.json`). Set `CRON_SECRET` in Vercel so nobody else can trigger it.

**Share preview.** WhatsApp shows `web/join/og.png` when someone shares the link.

**Kerala places.** `web/join/data/places.json` and `server/kerala_places.py` come from the Department of Posts PIN directory on data.gov.in (5,057 post offices, 1,427 PIN areas). Run `python build_places.py` to refresh them; it takes 15 minutes or more because the site only gives 10 rows per request. Place names use postal spellings (Edapally, Calicut); the page's search ignores doubled letters, so "edappally" still finds Edapally.

## Change the page

Edit `frescokart-landing.html`, run `python build_site.py`, and commit the changed files. The business WhatsApp number is the `WA` value near the top of the page script, and it is also written in `web/privacy.html`.

## Settings

| Variable | What it does |
| --- | --- |
| `FK_ADMIN_PASSWORD` | Admin password. Required on Vercel. |
| `FK_NOTIFY_WEBHOOK` | URL that receives `{"text": "..."}` for every new order and sign-up. |
| `DATABASE_URL` | Postgres address. Vercel adds it when you connect the database. Locally use `FK_DATABASE_URL`. |
| `FK_SECRET` | Secret behind the daily visitor code. If empty, one is made and kept in the database. |
| `FK_LIMIT_ORDERS`, `FK_LIMIT_LEADS`, `FK_LIMIT_VOTES` | Requests allowed per visitor per hour. Defaults 8, 10 and 60. |
| `FK_LIMIT_STATUS` | Order-status checks per visitor per hour, from the app. Default 300. |
| `FK_TG_TOKEN` | Telegram bot token for sign-up alerts and the evening summary. |
| `FK_TG_CHAT` | Optional. The chat that gets the alerts; the admin page can find it for you instead. |
| `CRON_SECRET` | Optional. Vercel sends it with the daily summary call, so nobody else can trigger it. |
| `FK_D_LIMIT_JOIN` | Waiting-list sign-ups allowed per visitor per hour. Default 12. |

## Before you run ads

- Have a lawyer review `web/privacy.html`. It is a plain-language template. Update its cookies section if you add Meta Pixel, Google Ads or analytics.
- Prices and offers are worked out in the visitor's browser, and the server only checks that a basket is sensible. Confirm price and availability on WhatsApp for each order before it goes out.
- Back up the database now and then. Neon has its own backup and export tools, and the admin page can download every table as CSV.
