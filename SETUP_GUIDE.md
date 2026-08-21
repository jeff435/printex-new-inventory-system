# Printex Engineers — Setup Guide

From a brand-new Windows machine to a running app, then to production.

Work through Part 1 once per machine. After that, Part 2 is a single command.

---

## Part 1 — Install the toolchain

You need four things: WSL2, Docker Desktop, VS Code, and Git. Everything else
lives inside Docker, so you will **not** install Python, Node, or PostgreSQL on
Windows directly.

### 1.1 WSL2 + Ubuntu

WSL2 runs a real Linux kernel inside Windows. This matters more than it sounds:
this project's file paths, shell scripts, and native Node binaries are all
Linux-shaped, and running them through Windows directly causes a long tail of
line-ending and permission problems.

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu
```

Reboot when prompted. On first launch Ubuntu asks for a username and password —
this is your Linux account, unrelated to your Windows login. The password is
invisible as you type it; that is normal.

Verify you are on version 2:

```powershell
wsl -l -v
```

You want `VERSION` to read `2`. If it says `1`:

```powershell
wsl --set-version Ubuntu 2
```

Then update the packages inside Ubuntu:

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Docker Desktop

Download from **docker.com/products/docker-desktop** and install with
*Use WSL 2 instead of Hyper-V* ticked.

After installing, open Docker Desktop → **Settings**:

- **General** → enable *Use the WSL 2 based engine*
- **Resources → WSL Integration** → enable integration with **Ubuntu**

That last step is the one people miss. Without it, `docker` is not on your PATH
inside Ubuntu and every command in this guide fails with "command not found".

Confirm from an **Ubuntu** terminal:

```bash
docker --version
docker compose version
```

### 1.3 VS Code

Install from **code.visualstudio.com**. Then install the **WSL** extension
(`ms-vscode-remote.remote-wsl`) — search "WSL" in the Extensions panel.

The project ships a `.vscode/extensions.json`; when you open the folder VS Code
offers to install the recommended extensions (Python, Pylance, Ruff, ESLint,
Prettier, Tailwind, Docker, PostgreSQL). Accept.

> **Install extensions into WSL, not Windows.** When connected to WSL, some
> extensions show an *Install in WSL: Ubuntu* button. Press it. A Python
> extension installed only on the Windows side cannot see the interpreter.

### 1.4 Git

Inside Ubuntu:

```bash
sudo apt install -y git
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"

# Stops Git rewriting line endings, which breaks shell scripts in containers.
git config --global core.autocrlf input
```

---

## Part 2 — Run the project

### 2.1 Put the code in the Linux filesystem

This is the single most important performance decision in the whole setup.

```bash
# Correct — native Linux filesystem
cd ~
mkdir -p projects && cd projects
# unzip the project here, or: git clone <your-repo>
cd printex
```

**Do not** put the project under `/mnt/c/Users/...`. Docker reads across the
Windows/Linux boundary at a fraction of the speed, and file-watching often
fails outright, so hot reload silently stops working. Symptoms are a dev server
that takes 30+ seconds to reload and changes that never appear. Keep it in
`~/projects`.

To open it in VS Code:

```bash
code .
```

The bottom-left corner should read **WSL: Ubuntu**. If it does not, you are
editing through Windows and will hit the problems above.

### 2.2 Start everything

```bash
./scripts/bootstrap.sh
```

This creates your `.env` files with freshly generated secrets, starts four
containers, applies the SQL migrations, restarts the API, and imports the 134
parts from the register. First run takes several minutes while images download.

When it finishes:

| | |
|---|---|
| Storefront | http://localhost:3000 |
| Admin | http://localhost:3000/admin |
| API docs | http://localhost:8000/api/docs |

### 2.3 Day-to-day commands

```bash
docker compose up -d        # start
docker compose down         # stop (data survives)
docker compose down -v      # stop and DELETE the database
docker compose logs -f backend
docker compose restart backend

# Open a shell inside a container
docker compose exec backend bash
docker compose exec db psql -U postgres -d printex_db
```

Both services hot-reload: edit a file on the host and the container picks it up.

### 2.4 Re-importing the parts register

```bash
docker compose exec backend python -m app.scripts.seed_printex
```

Safe to re-run. It updates part details but **deliberately leaves stock
untouched** on parts that already exist, so a re-run cannot wipe out live stock
figures that have moved since the original import.

---

## Part 3 — Why the migrations are separate

This project has **no Alembic**. Tables are created by
`Base.metadata.create_all()` on startup, and that function only ever creates
*missing tables* — it never alters an existing one.

So a new table like `customers` appears automatically, but a new **column** on
the existing `products` table does not. The API then fails on any query
touching it with `column products.part_number does not exist`.

The `backend/migrations/*.sql` files exist to close that gap. Every statement is
guarded (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`) so they are safe to
re-run. `bootstrap.sh` applies them in filename order.

**When you add a column to a model, write a matching migration.** Otherwise it
works on your machine — where the database was created fresh — and breaks on
every machine that already has data.

Applying them by hand:

```bash
docker compose exec -T db psql -U postgres -d printex_db \
  < backend/migrations/002_printex_parts_and_customers.sql
```

---

## Part 4 — External services

None of these are needed to develop locally. The app runs without them; the
relevant features are simply inert.

| Service | Purpose | Needed when |
|---|---|---|
| M-Pesa Daraja | Payments | Testing checkout |
| Cloudflare R2 | Image storage | Uploading part photos |
| Africa's Talking | SMS / OTP | Phone login |
| Resend | Email | Email receipts |
| Google OAuth | Social sign-in | "Sign in with Google" |
| Groq | AI assistant | Chat widget |

### M-Pesa needs a public URL

Safaricom's servers call **you** back after a payment, and they cannot reach
`localhost`. During development, tunnel it:

```bash
# Install ngrok, then:
ngrok http 8000
```

Take the `https://` URL it prints and set it in `backend/.env`:

```
MPESA_CALLBACK_URL=https://your-id.ngrok-free.app/api/v1/payments/mpesa/callback
```

Restart the backend. Note the free ngrok URL changes each restart, so this has
to be updated each session.

---

## Part 5 — Shipping to production

### 5.1 Before you deploy

- [ ] `APP_ENV=production` and `DEBUG=False`
- [ ] Fresh `SECRET_KEY` and `JWT_SECRET` — never reuse the dev ones
- [ ] `ALLOWED_ORIGINS` set to your real domain, not `localhost`
- [ ] `MPESA_ENV=production` with live Daraja credentials
- [ ] Migrations applied against the production database
- [ ] Database backups switched on
- [ ] Confirm `.env` is not in the repository: `git check-ignore backend/.env`

> **`create_all` is dev-only.** In production `APP_ENV` is not `development`, so
> tables are *not* auto-created. You must apply every SQL migration to the
> production database by hand before the first deploy, or the API starts with no
> tables at all.

### 5.2 Recommended free-tier hosting

| Piece | Host | Notes |
|---|---|---|
| Database | **Supabase** or **Neon** | Managed Postgres, free tier, automatic backups |
| Redis | **Upstash** | Free tier is ample for sessions |
| Backend | **Fly.io** or **Railway** | Both read the existing `backend/Dockerfile` |
| Frontend | **Vercel** | Built by the same people as Next.js |
| Images | **Cloudflare R2** | No egress fees, unlike S3 |

### 5.3 Backend to Fly.io

```bash
curl -L https://fly.io/install.sh | sh
fly auth login

cd backend
fly launch --no-deploy        # detects the Dockerfile

# Secrets, not env vars — these are encrypted at rest
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://…supabase…" \
  DATABASE_URL_SYNC="postgresql://…supabase…" \
  REDIS_URL="rediss://…upstash…" \
  SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')" \
  JWT_SECRET="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')" \
  APP_ENV=production \
  DEBUG=False \
  ALLOWED_ORIGINS="https://your-app.vercel.app"

fly deploy
```

Then apply migrations against the managed database:

```bash
psql "postgresql://…supabase…" < migrations/001_product_ratings.sql
psql "postgresql://…supabase…" < migrations/002_printex_parts_and_customers.sql
```

And seed the register once:

```bash
fly ssh console -C "python -m app.scripts.seed_printex"
```

### 5.4 Frontend to Vercel

```bash
npm i -g vercel
cd frontend
vercel
```

In the Vercel dashboard set `NEXT_PUBLIC_API_URL` to your Fly URL
(`https://printex-api.fly.dev/api/v1`), then redeploy.

Finally, go back and set `ALLOWED_ORIGINS` on Fly to the real Vercel domain —
this is a chicken-and-egg step that is easy to forget, and CORS errors in the
browser console are the symptom.

### 5.5 Desktop or mobile app

The current build is a web app. If you want it installable:

- **PWA** — cheapest path. Add a manifest and service worker to Next.js and it
  becomes installable on Android, iOS and desktop from the browser. No app
  stores, no review process.
- **Desktop** — wrap in **Tauri** (small binaries, Rust) or **Electron**
  (heavier, simpler). The old Printex system used Electron; the files are in the
  reference repo if you want to compare.
- **Mobile stores** — needs React Native or Capacitor, which is a genuine port
  rather than a wrapper. Worth doing only if you need camera/barcode scanning
  hardware access.

Given this is an inventory tool used on a shop floor, **PWA is almost certainly
the right call** — offline caching and an installable icon, without maintaining
a second codebase.

---

## Part 6 — Troubleshooting

**`docker: command not found` inside Ubuntu**
Docker Desktop → Settings → Resources → WSL Integration → enable Ubuntu. Restart
the terminal.

**Port already allocated**
Something else holds 3000, 5432, 6379 or 8000. Find it with
`sudo lsof -i :5432`, or change the host-side port in `docker-compose.yml`
(`"5433:5432"` — only the left number).

**`column products.part_number does not exist`**
Migrations were not applied, or were applied before the table existed. Run
`./scripts/bootstrap.sh` again — it is idempotent.

**Backend restarts in a loop**
`docker compose logs backend`. Usually a malformed `DATABASE_URL`, or a missing
`backend/.env`.

**Frontend compiles but shows a blank page / network errors**
`NEXT_PUBLIC_API_URL` must be `http://localhost:8000/api/v1` — the *browser*
resolves it, so the compose service name `backend` will not work here.

**Hot reload stopped working**
The project is probably under `/mnt/c/`. Move it to `~/projects`.

**`ModuleNotFoundError` after adding a package**
Rebuild rather than restart: `docker compose up -d --build backend`.

**Everything is broken and you want a clean slate**
```bash
docker compose down -v          # deletes the database too
docker compose up -d --build
./scripts/bootstrap.sh
```
