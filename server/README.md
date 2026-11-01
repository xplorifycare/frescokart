# FrescoKart pre-order server

One small Python program (3.9 or newer, tested on 3.11, nothing to install) that does three jobs:

1. Serves the landing page from `web/`.
2. Saves pre-orders, "tell me when you start" sign-ups and area votes in a SQLite file.
3. Gives you a password-protected admin page: demand by area, demand by ad campaign, the pre-order list with a status you can change, and CSV downloads.

## Run it on your computer

```
python build_site.py
python server/app.py
```

Open <http://127.0.0.1:8080> for the site and <http://127.0.0.1:8080/admin> for the admin page (user name `admin`).

The first time it starts it makes a random admin password, prints it and saves it in `server/data/admin_password.txt`. To choose your own, set `FK_ADMIN_PASSWORD` before starting.

Run `python build_site.py` again after every change to `frescokart-landing.html`. It writes `web/index.html`, which is what the server sends.

## How the page and the server work together

When the page is served by this server, it finds `/api/health` and switches on server mode: the basket form says **Place pre-order**, shows a consent tick, and the order is saved here. The customer then sees a reference like `FK-000012` and a button to confirm on WhatsApp.

When the page is opened anywhere else (the artifact preview, a plain static host, a file on disk), there is no server to answer, so the form falls back to WhatsApp click-to-chat. Nothing breaks, but nothing is saved either. **Point your ads at the server's address, not at a preview link.**

The business WhatsApp number is `918157863503` (country code, then the number). It is the `WA` value at the top of the script in `frescokart-landing.html` and is also written in `web/privacy.html`. Change it in both files, then run `python build_site.py`.

## Track ads by locality

Give every ad its own link:

```
https://your-domain/?utm_source=instagram&utm_medium=paid&utm_campaign=edappally-nov
```

The page remembers these values and sends them with every area tap, sign-up and pre-order. The admin page shows the demand for each campaign next to the demand for each area.

## Settings

All optional, set as environment variables.

| Variable | What it does |
| --- | --- |
| `FK_ADMIN_PASSWORD` | Admin password. If empty, a random one is made and saved in the data folder. |
| `FK_DATA_DIR` | Where the database lives. Default `server/data`. |
| `FK_WEB_DIR` | Where the site files are. Default `web`. |
| `FK_DATABASE_URL` | Use this Postgres database instead of the SQLite file. Needs `pip install psycopg2-binary`. On Vercel, `DATABASE_URL` and `POSTGRES_URL` are read as well. |
| `FK_SECRET` | Secret behind the daily visitor code. If empty, one is made and kept next to the SQLite file, or inside the Postgres database. |
| `FK_TRUST_PROXY=1` | Read the visitor's address from `X-Forwarded-For`. Set it only when the server sits behind a reverse proxy that sets that header and nobody can reach the server directly. |
| `FK_CORS_ORIGIN` | Let one other site call the API, for example when the page is hosted on a different domain. The page must then also set `API.base` to the server's full address. |
| `FK_NOTIFY_WEBHOOK` | A URL that gets `{"text": "..."}` for every new pre-order and sign-up. Slack-style incoming webhooks accept this. |
| `FK_LIMIT_PREORDERS`, `FK_LIMIT_LEADS`, `FK_LIMIT_VOTES` | Requests allowed per visitor per hour. Defaults 8, 10 and 60. |
| `HOST`, `PORT` | Or use `--host` and `--port`. Default `127.0.0.1:8080`. Use `--host 0.0.0.0` to accept outside connections. |

## What it checks and protects

- Phone numbers must be Indian mobile numbers; they are saved as `+91XXXXXXXXXX`.
- The area must be one of the listed areas. Basket items, servings (2 or 4) and quantities are checked.
- Orders need the consent tick. The same phone, area and basket sent again within three minutes returns the same reference, so a double tap does not make two orders.
- A hidden field catches simple bots, and each visitor is limited per hour.
- Requests must carry the `X-FK` header and a JSON body, and bodies over 32 KB are refused.
- IP addresses are not stored. A scrambled visitor code that changes every day is used to count one area tap per visitor per day.
- The admin page uses HTTP Basic sign-in, escapes everything it shows, and sends a strict content security policy. CSV downloads neutralise cells that start with `=`, `+`, `-` or `@`.
- Only files with known web extensions inside `web/` are served. The server code and the data folder cannot be fetched.

## Put it online

Vercel works too, with the data in Postgres instead of the SQLite file: see [Deploy on Vercel](../README.md#deploy-on-vercel) in the main README. The notes below are for a server you run yourself, which was tested on a Windows computer and not on a live host. Before you spend on ads:

1. **Use HTTPS.** The admin password travels with every admin request, so it must never go over plain HTTP. Easiest is a small VPS with Caddy in front:

   ```
   your-domain.com {
       reverse_proxy 127.0.0.1:8080
   }
   ```

   Then start the server with `FK_TRUST_PROXY=1`, `FK_ADMIN_PASSWORD=<a long password>` and keep it running with systemd or your host's process manager.
2. **Keep the database on a disk that survives restarts.** Platforms with a temporary file system (many free tiers) lose `server/data` on every deploy. Mount a volume and point `FK_DATA_DIR` at it.
3. **Back up `server/data/frescokart.db`** every day (copy the file). Keep `server/data/secret.key` private; it is only used to scramble visitor codes.
4. **Get the privacy notice checked.** `web/privacy.html` is a plain-language template. Have a lawyer review it against Indian data-protection law before you run ads, and update its "Cookies and tracking" section if you add Meta Pixel, Google Ads or analytics.
5. **Confirm every order by message.** Prices and offers are worked out in the visitor's browser and the server only checks that the basket is sensible; it has no price list of its own. Treat each pre-order as a request and confirm the price, availability and slot on WhatsApp before delivery.

## Endpoints

| Method and path | Use |
| --- | --- |
| `GET /api/health` | Lets the page know a server is there. |
| `POST /api/preorders` | Save a pre-order. Returns `{ok, ref}`. |
| `POST /api/leads` | Save a "tell me when you start" sign-up. |
| `POST /api/area-votes` | Count an area tap. |
| `GET /admin` | Admin page (sign-in required). |
| `GET /admin/export.csv?type=preorders\|leads\|votes` | CSV download (sign-in required). |
| `POST /admin/status` | Change a pre-order's status: new, confirmed, delivered, cancelled or spam. |
