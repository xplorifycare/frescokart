# FrescoKart

Landing page and order server for FrescoKart, a Kochi service that sells ready-to-cook Kerala fish kits: the fish cut for the dish, cut vegetables and measured masalas in one chilled pack.

Visitors pick a kit, build a basket and place an order, delivered in about 45 minutes. Orders, "tell me when you reach my area" sign-ups and area taps are saved on a server, and you read them on a password-protected admin page that also shows demand by area and by ad campaign.

## What is in this repository

| Path | What it is |
| --- | --- |
| `web/` | The site visitors see: `index.html` (generated), `privacy.html` and `img/`. |
| `web/app/` | The customer app at `/app/`: browse, basket, checkout, live order status, cook-along mode. Installable on a phone from the browser. `menu.js` is generated. |
| `frescokart-landing.html` | The source of the home page. Edit this one. |
| `build_site.py` | Turns `frescokart-landing.html` into `web/index.html`. |
| `server/app.py` | The server: orders, sign-ups, area votes, admin page and CSV downloads. SQLite when you run it yourself, Postgres on Vercel. |
| `api/` | The Vercel functions. Each file is a few lines that point Vercel at `server/app.py`. |
| `server/market.py`, `web/market/`, `web/partner/`, `web/rider/`, `web/ui/` | The shops marketplace pilot: the customer, shop and rider apps and their server code. See below. |
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

## Shops marketplace pilot

A second ordering system, separate from the kit orders above: customers order fresh food from shops near them, a shop packs and weighs it, and one rider collects from every shop and delivers. Its tables all start with `m_`, so the kit orders are untouched.

| Address | Who uses it |
| --- | --- |
| `/market/` | Customers. Shops, search, one basket from several shops, checkout with pay-on-delivery (cash or UPI to the rider), live order with a delivery code. |
| `/partner/` | Shop owners. Log in with the shop's mobile number and PIN. New orders ring and fill the screen; the shop picks a ready time, packs and weighs, and hands over to the rider who shows the pickup PIN. Daily prices and stock, and today's sales. |
| `/rider/` | Riders. Log in with mobile and PIN, go online, accept an order, pick up from each shop, collect the money and finish with the customer's 4-digit code. |
| `/admin/market` | You, with the admin password. Add shops (with starter items) and riders, give PINs, follow every order, set or change the rider, cancel. Also adds and removes demo shops for testing. |

How an order moves: placed, then each shop accepts (or turns it down; the rest of the order carries on), packs and marks it ready, a rider claims it and picks up from every shop, and it is delivered when the rider enters the customer's code. Customers pay for what each shop actually packed, so a lighter fish costs less. Everything is rounded to whole rupees.

To try it, open `/admin/market`, press **Add demo shops and rider** (PIN 1234, mobiles 90000 00001 to 90000 00004 for shops and 90000 00009 for the rider), place an order at `/market/`, then use `/partner/` and `/rider/`. Remove the demo data before real customers arrive.

Limits of this pilot: no online payment yet, no maps or distance (riders get map links), riders take one order at a time, orders are checked every 8 seconds rather than pushed, and the shop's ring only plays while the app is open on screen. The fees and pay are examples; set the real ones with the settings below.

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
| `FK_M_AREAS` | Pilot delivery areas, separated by commas. Default `Edappally,Palarivattom,Kaloor`. |
| `FK_M_DELIVERY_FEE`, `FK_M_EXTRA_SHOP_FEE`, `FK_M_FREE_OVER` | Delivery fee for one shop, extra for each more shop, and the basket value that makes delivery free. Defaults 30, 10 and 1599 (examples). |
| `FK_M_SHOP_FEE_PCT` | FrescoKart's share of a new shop's sales. Default 10 (example; each shop can have its own on the admin page). |
| `FK_M_RIDER_TRIP`, `FK_M_RIDER_EXTRA` | Rider pay per trip and per extra pickup. Defaults 40 and 10 (examples). |
| `FK_M_LIMIT_ORDERS`, `FK_M_LIMIT_STATUS` | Marketplace orders and live-order checks per visitor per hour. Defaults 12 and 900. |

## Before you run ads

- Have a lawyer review `web/privacy.html`. It is a plain-language template. Update its cookies section if you add Meta Pixel, Google Ads or analytics.
- Prices and offers are worked out in the visitor's browser, and the server only checks that a basket is sensible. Confirm price and availability on WhatsApp for each order before it goes out.
- Back up the database now and then. Neon has its own backup and export tools, and the admin page can download every table as CSV.
