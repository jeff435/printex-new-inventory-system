# 🔧 Printex Engineers — Original Skeleton Setup Guide (Reference)

> **Read this entire guide before running a single command.**
> It covers every step from zero to a running app — locally AND deployed live for free.

---

## Table of Contents

1. [What You're Setting Up](#1-what-youre-setting-up)
2. [Prerequisites — Install These First](#2-prerequisites)
3. [Project Structure Explained](#3-project-structure)
4. [Option A — Run With Docker (Recommended)](#4-option-a--docker-recommended)
5. [Option B — Run Without Docker (Manual)](#5-option-b--manual-setup)
6. [Environment Variables — Every Field Explained](#6-environment-variables)
7. [Registering for Free External Services](#7-registering-for-free-services)
8. [M-Pesa Daraja Setup (Step by Step)](#8-m-pesa-daraja-setup)
9. [Africa's Talking SMS Setup](#9-africas-talking-sms-setup)
10. [Flutterwave Card Payments Setup](#10-flutterwave-setup)
11. [Cloudflare R2 Storage Setup](#11-cloudflare-r2-setup)
12. [Deploying Live for Free](#12-deploying-live-for-free)
13. [First Steps After Launch](#13-first-steps-after-launch)
14. [Troubleshooting Common Errors](#14-troubleshooting)

---

## 1. What You're Setting Up

```
┌─────────────────────────────────────────────────────────┐
│                  PRINTEX ENGINEERS                       │
│                                                         │
│  Frontend (Next.js)          Backend (FastAPI)          │
│  localhost:3000    ◄────►    localhost:8000             │
│                                                         │
│  Pages:                      API Modules:               │
│  • Homepage                  • /api/v1/auth             │
│  • Product catalogue         • /api/v1/products         │
│  • Shopping cart             • /api/v1/categories       │
│  • Login / Register          • /api/v1/inventory        │
│                              • /api/v1/orders           │
│                              • /api/v1/payments         │
│                                                         │
│  Database: PostgreSQL        Cache: Redis               │
│  localhost:5432              localhost:6379             │
└─────────────────────────────────────────────────────────┘
```

**Tech stack:**
- **Backend:** Python 3.12 + FastAPI + SQLAlchemy (async) + Alembic
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Zustand
- **Database:** PostgreSQL 16
- **Cache/Sessions:** Redis 7
- **Payments:** Safaricom M-Pesa (Daraja API) + Flutterwave
- **SMS:** Africa's Talking
- **Email:** Resend
- **Storage:** Cloudflare R2

---

## 2. Prerequisites

You need the following installed on your computer **before** starting.

### 2a. Docker & Docker Compose (for Option A — recommended)

**Windows:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Run the installer — it installs both Docker and Docker Compose
3. Open Docker Desktop and wait for it to say "Engine running"
4. Open PowerShell or Command Prompt and verify:
   ```
   docker --version
   docker compose version
   ```

**macOS:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Drag to Applications, open it, follow setup wizard
3. Verify in Terminal:
   ```
   docker --version
   docker compose version
   ```

**Ubuntu/Linux:**
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Log out and log back in, then verify:
docker --version
docker compose version
```

### 2b. Git (to version-control your code)

**Windows:** Download from https://git-scm.com/download/win
**macOS:** Run `xcode-select --install` in Terminal
**Linux:** `sudo apt install git`

### 2c. For Option B (no Docker) — you also need:

**Python 3.12:**
- Windows: https://www.python.org/downloads/ (tick "Add to PATH")
- macOS: `brew install python@3.12`
- Linux: `sudo apt install python3.12 python3.12-venv python3-pip`

**Node.js 20 LTS:**
- All platforms: https://nodejs.org/en/download (choose LTS)
- Or with nvm: `nvm install 20 && nvm use 20`

**PostgreSQL 16:**
- Windows: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- macOS: `brew install postgresql@16`
- Linux: `sudo apt install postgresql-16`

**Redis 7:**
- Windows: Use WSL2 or download from https://github.com/tporadowski/redis/releases
- macOS: `brew install redis`
- Linux: `sudo apt install redis-server`

---

## 3. Project Structure

After unzipping `printex-system.zip`, you'll have this structure:

```
printex-system/
│
├── .env.example              ← Template for all environment variables
├── README.md                 ← Quick reference
├── SETUP_GUIDE.md            ← This file
│
├── backend/                  ← FastAPI Python application
│   ├── Dockerfile
│   ├── requirements.txt      ← Python dependencies
│   └── app/
│       ├── main.py           ← Entry point, registers all routers
│       ├── config.py         ← Reads .env variables
│       ├── database.py       ← PostgreSQL async connection
│       ├── auth/             ← Register, login, JWT, OTP, addresses
│       ├── products/         ← Product catalogue, categories, brands
│       ├── inventory/        ← Stock per branch, alerts, restocking
│       ├── orders/           ← Order lifecycle management
│       ├── payments/         ← M-Pesa Daraja + Flutterwave
│       ├── notifications/    ← SMS + Email sending
│       └── core/             ← Security, JWT, Redis, exceptions
│
├── frontend/                 ← Next.js 14 TypeScript application
│   ├── Dockerfile
│   ├── package.json          ← Node dependencies
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── app/                  ← Pages (App Router)
│   │   ├── page.tsx          ← Homepage
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── products/page.tsx
│   │   └── cart/page.tsx
│   ├── components/           ← Reusable UI components
│   ├── lib/api.ts            ← Axios API client
│   └── stores/index.ts       ← Zustand (cart + auth state)
│
└── infra/
    └── docker-compose.yml    ← Orchestrates all services locally
```

---

## 4. Option A — Docker (Recommended)

This is the **easiest way**. One command starts everything.

### Step 1 — Unzip the project

```bash
# Unzip wherever you want to work
unzip printex-system.zip
cd printex-system
```

### Step 2 — Create your .env file

```bash
# Copy the template
cp .env.example .env
```

Now open `.env` in any text editor (Notepad, VS Code, nano, etc.) and **at minimum** change these values:

```env
SECRET_KEY=pick-any-long-random-string-like-xK9mP2qL8vN3jR7wT
JWT_SECRET=another-long-random-string-like-yH4cB6nM1sQ5eU0iA
```

For everything else, the default values will work for **local development**. You only need to add real API keys when you want SMS, email, and payments to actually work. See Section 6 and 7 for that.

### Step 3 — Start everything

```bash
cd infra
docker compose up --build
```

The first run takes 3–5 minutes to:
- Pull PostgreSQL and Redis Docker images
- Build the Python backend image (installs all pip packages)
- Build the Next.js frontend image (installs all npm packages)

You'll see coloured logs from three services: `db`, `backend`, `frontend`.

**Wait for these lines before opening the browser:**
```
backend-1  | ✅ Ready
frontend-1 | ▲ Next.js 14.x.x
frontend-1 | - Local: http://localhost:3000
```

### Step 4 — Open in browser

| Service | URL |
|---|---|
| **Storefront** | http://localhost:3000 |
| **API docs (Swagger)** | http://localhost:8000/api/docs |
| **API health check** | http://localhost:8000/health |

### Step 5 — Verify it works

Open http://localhost:8000/api/docs — you should see the interactive API documentation with all endpoints listed. Try:
1. Click on `POST /api/v1/auth/register`
2. Click "Try it out"
3. Fill in a name, phone, and password
4. Click "Execute"
5. You should get a `201` response with a JWT token

### Stopping the app

```bash
# Stop (keeps data)
docker compose down

# Stop AND delete all data (fresh start)
docker compose down -v
```

### Restarting after changes

```bash
# After changing Python files:
docker compose restart backend

# After changing frontend files:
docker compose restart frontend

# After changing docker-compose.yml:
docker compose up --build
```

---

## 5. Option B — Manual Setup (No Docker)

Use this if you don't want Docker or are deploying to a server.

### Step 1 — Start PostgreSQL

**macOS/Linux:**
```bash
# Start the service
sudo service postgresql start   # Linux
brew services start postgresql  # macOS

# Create the database
psql -U postgres -c "CREATE DATABASE printex_db;"
psql -U postgres -c "CREATE USER printex_user WITH PASSWORD 'printex_pass';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE printex_db TO printex_user;"
```

**Windows (after installing PostgreSQL):**
1. Open pgAdmin (installed with PostgreSQL)
2. Right-click "Databases" → Create → Database → name it `printex_db`
3. Or use the psql shell from Start Menu

### Step 2 — Start Redis

```bash
# macOS
brew services start redis

# Linux
sudo service redis-server start

# Windows (in WSL2 or using the Windows port)
redis-server
```

Verify Redis is running: `redis-cli ping` → should return `PONG`

### Step 3 — Set up the backend

```bash
cd printex-system/backend

# Create a virtual environment (isolates Python dependencies)
python3.12 -m venv .venv

# Activate it
source .venv/bin/activate          # macOS/Linux
.venv\Scripts\activate             # Windows PowerShell

# Install all dependencies
pip install -r requirements.txt
pip install "pydantic[email]"

# Create your .env file in the backend directory
cp ../.env.example .env
```

Edit `.env` and update the database URL for your local setup:
```env
DATABASE_URL=postgresql+asyncpg://printex_user:printex_pass@localhost:5432/printex_db
DATABASE_URL_SYNC=postgresql://printex_user:printex_pass@localhost:5432/printex_db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-random-secret-here
JWT_SECRET=your-jwt-secret-here
```

Start the backend:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On startup it will automatically create all database tables (in development mode).

### Step 4 — Set up the frontend

Open a **new terminal window**:

```bash
cd printex-system/frontend

# Install dependencies
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local

# Start the dev server
npm run dev
```

Visit http://localhost:3000

---

## 6. Environment Variables

Full explanation of every variable in `.env`:

### App Settings

```env
APP_NAME="Printex Engineers"
# The name shown in emails and logs. Change to your brand name.

APP_ENV=development
# Options: development, production
# In development: tables auto-created, verbose SQL logs enabled
# In production: use Alembic migrations instead

DEBUG=true
# Set to false in production — hides internal error details from API responses

SECRET_KEY=change-me-to-a-long-random-string-in-production
# Used for general app encryption. Generate with:
# python -c "import secrets; print(secrets.token_hex(32))"

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
# Comma-separated list of frontend URLs allowed to call the API (CORS)
# In production: https://yourdomain.com
```

### Database

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/printex_db
# Format: postgresql+asyncpg://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
# The +asyncpg part is required — it tells SQLAlchemy to use the async driver
# For Supabase: get this from Supabase dashboard → Settings → Database → Connection string (URI mode)
# Replace "postgresql://" with "postgresql+asyncpg://"

DATABASE_URL_SYNC=postgresql://postgres:postgres@localhost:5432/printex_db
# Same as above but WITHOUT +asyncpg — used by Alembic for migrations
```

### Redis

```env
REDIS_URL=redis://localhost:6379/0
# Format: redis://HOST:PORT/DATABASE_NUMBER
# The /0 at the end means database 0 (Redis has 16 databases, 0-15)
# For Upstash: get the URL from your Upstash dashboard — it looks like:
# redis://default:PASSWORD@HOST.upstash.io:PORT
```

### JWT (Authentication Tokens)

```env
JWT_SECRET=change-me-jwt-secret
# Secret used to sign JWT access tokens. Must be long and random.
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
# NEVER share this. If leaked, anyone can forge authentication tokens.

JWT_ALGORITHM=HS256
# Leave this as HS256 unless you know what you're doing

ACCESS_TOKEN_EXPIRE_MINUTES=60
# How long before a user's access token expires (they need to refresh)
# 60 minutes = users stay logged in for 1 hour of activity

REFRESH_TOKEN_EXPIRE_DAYS=30
# How long a refresh token lasts. Users are fully logged out after this.
```

### Africa's Talking (SMS)

```env
AT_USERNAME=sandbox
# Your Africa's Talking username
# In sandbox (testing): keep as "sandbox"
# In production: your registered AT username (e.g. "printexengineers")

AT_API_KEY=your-at-api-key
# Get this from your Africa's Talking dashboard after registering
# Sandbox key is different from production key

AT_SENDER_ID=PRINTEX
# The name that appears as the SMS sender
# In sandbox: use "PRINTEX" or any name
# In production: must be approved by Africa's Talking (takes 1-2 days)
```

### Resend (Email)

```env
RESEND_API_KEY=re_your_key
# Get from resend.com after creating an account
# Starts with "re_"

EMAIL_FROM=noreply@yourdomain.com
# The "from" address for all emails
# On free tier you can use "onboarding@resend.dev" for testing
# For production: must be a domain you own and have verified in Resend
```

### M-Pesa Daraja (Safaricom)

```env
MPESA_CONSUMER_KEY=your-consumer-key
MPESA_CONSUMER_SECRET=your-consumer-secret
# Get both from developer.safaricom.co.ke after creating an app
# Sandbox keys work immediately; production keys require go-live approval

MPESA_SHORTCODE=174379
# Sandbox: always use 174379 (Safaricom's test shortcode)
# Production: your registered Paybill or Till number

MPESA_PASSKEY=your-passkey
# Sandbox passkey is provided by Safaricom in the developer portal
# Production passkey comes with your go-live approval

MPESA_CALLBACK_URL=https://your-domain.com/api/v1/payments/mpesa/callback
# The URL Safaricom calls after a payment completes
# MUST be a public HTTPS URL — localhost won't work for real payments
# For local testing: use ngrok (see M-Pesa setup section)

MPESA_ENV=sandbox
# Options: sandbox, production
# Keep as sandbox until you have go-live approval
```

### Flutterwave (Card Payments)

```env
FLW_PUBLIC_KEY=FLWPUBK_TEST-your-key
FLW_SECRET_KEY=FLWSECK_TEST-your-key
# Get from dashboard.flutterwave.com → Settings → API Keys
# TEST keys work immediately; LIVE keys need business verification

FLW_WEBHOOK_SECRET=your-webhook-secret
# Set this yourself in your Flutterwave dashboard under Webhooks
# Must match exactly what you put in the Flutterwave webhook settings
```

### Cloudflare R2 (File Storage)

```env
R2_ACCOUNT_ID=your-account-id
# Found in Cloudflare dashboard top-right after logging in

R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
# Created in R2 → Manage R2 API tokens

R2_BUCKET_NAME=printex-media
# The name of your R2 bucket (create it in the Cloudflare dashboard)

R2_PUBLIC_URL=https://pub-xxx.r2.dev
# The public URL for your bucket (enable public access in R2 settings)
```

---

## 7. Registering for Free Services

Here's exactly where to sign up and what to do for each service.

### Supabase (PostgreSQL — Free)

1. Go to https://supabase.com and click **Start your project**
2. Sign up with GitHub (easiest)
3. Click **New project**
4. Choose a name (e.g. "printex-db"), set a **strong database password** (save it!), select **East Africa (closest region: Ohio or Frankfurt)**
5. Wait ~2 minutes for the project to provision
6. Go to **Settings** (gear icon) → **Database**
7. Scroll to **Connection string** → select **URI** tab
8. Copy the string — it looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`
9. In your `.env`:
   - `DATABASE_URL` = replace `postgresql://` with `postgresql+asyncpg://`
   - `DATABASE_URL_SYNC` = keep as `postgresql://...`

### Upstash (Redis — Free)

1. Go to https://upstash.com and click **Start for Free**
2. Sign up with GitHub
3. Click **Create Database**
4. Name it "printex-cache", select **Global** type, choose **EU-West** or **US-East**
5. Click **Create**
6. On the database page, find **Redis URL** — it starts with `redis://default:...`
7. Copy it into `REDIS_URL` in your `.env`

### Resend (Email — Free, 3,000 emails/month)

1. Go to https://resend.com and click **Get started for free**
2. Sign up with GitHub or email
3. On the dashboard, click **API Keys** → **Create API Key**
4. Name it "printex-production", give it **Full access**
5. Copy the key (starts with `re_`) into `RESEND_API_KEY`
6. For `EMAIL_FROM`: on the free tier, use `onboarding@resend.dev` (no domain needed)
7. When ready for production: go to **Domains** → **Add Domain** → verify your domain via DNS

### Africa's Talking (SMS)

See the full step-by-step in **Section 9** below.

---

## 8. M-Pesa Daraja Setup

This is the most important integration. Follow every step carefully.

### Step 1 — Create a Safaricom Developer Account

1. Go to https://developer.safaricom.co.ke
2. Click **Sign Up** (top right)
3. Fill in: First name, Last name, Email, Password
4. Check your email for a verification link and click it
5. Log in to the developer portal

### Step 2 — Create an App

1. After logging in, click **My Apps** in the top menu
2. Click **Add New App**
3. App Name: "Printex Engineers" (or your name)
4. Check these boxes: ✅ Lipa Na M-Pesa Sandbox ✅ M-Pesa Sandbox
5. Click **Create App**
6. Your app appears with a **Consumer Key** and **Consumer Secret** — copy both into your `.env`

### Step 3 — Get the Sandbox Passkey

1. In the developer portal, click **APIs** in the top menu
2. Click **Lipa Na M-Pesa**
3. Scroll down to find the **Lipa Na M-Pesa Online (Sandbox)** section
4. The test passkey is: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`
5. Copy this into `MPESA_PASSKEY` in your `.env`

### Step 4 — Test with Sandbox

In sandbox mode, you can trigger test payments using the Safaricom simulator:

1. In the developer portal, click **APIs** → **Lipa Na M-Pesa**
2. Scroll to **Simulate C2B** (Consumer to Business)
3. Or just call your STK push endpoint from the API docs:
   ```
   POST /api/v1/payments/mpesa/stk-push
   ?order_id=YOUR_ORDER_ID&phone=254708374149
   ```
   The phone `254708374149` is Safaricom's sandbox test number — it auto-approves

### Step 5 — Testing Callbacks Locally (ngrok)

Safaricom needs a public URL to send payment confirmations to. For local testing:

1. Download ngrok from https://ngrok.com/download
2. Sign up for a free account and get your auth token
3. Run ngrok:
   ```bash
   ngrok http 8000
   ```
4. You'll see a URL like `https://abc123.ngrok-free.app`
5. Update your `.env`:
   ```env
   MPESA_CALLBACK_URL=https://abc123.ngrok-free.app/api/v1/payments/mpesa/callback
   ```
6. Restart the backend after changing `.env`

### Step 6 — Going Live (Production)

This requires a registered Kenyan business:
1. In the developer portal, click **Go Live** on your app
2. Fill in your business details (business registration number, Safaricom shortcode)
3. Safaricom reviews in 3–5 business days
4. Once approved: change `MPESA_ENV=production` and update the shortcode and passkey

---

## 9. Africa's Talking SMS Setup

### Step 1 — Create an Account

1. Go to https://africastalking.com
2. Click **Register**
3. Fill in: Username, Email, Password, Country (Kenya), Phone
4. Verify your email
5. Log in

### Step 2 — Get Your Sandbox API Key

1. After logging in, you start in **Sandbox** mode automatically
2. Click your username (top right) → **Settings**
3. Under **API Key**, click **Generate** (or copy the existing one)
4. Copy the key into `AT_API_KEY` in your `.env`
5. Set `AT_USERNAME=sandbox` for testing

### Step 3 — Test SMS in Sandbox

The sandbox doesn't actually send SMS — it shows them in a simulator:
1. In the Africa's Talking dashboard, click the **Sandbox** tab
2. Click **SMS** → **Simulator**
3. When your app sends an OTP, it appears here

### Step 4 — Going to Production

1. In the AT dashboard, click **Create New App** (or **Go Live**)
2. Fill in your app details and business info
3. Top up your SMS credits (minimum ~KES 200 to start)
4. Update `.env`: `AT_USERNAME=your_actual_username`

---

## 10. Flutterwave Setup

### Step 1 — Create an Account

1. Go to https://app.flutterwave.com/register
2. Sign up with your email
3. Verify your email address

### Step 2 — Get Test API Keys

1. After logging in, click **Settings** (gear icon, bottom left)
2. Click **API Keys**
3. Toggle to **Test mode** (top right of the page)
4. Copy:
   - **Public Key** → `FLW_PUBLIC_KEY` in `.env`
   - **Secret Key** → `FLW_SECRET_KEY` in `.env`

### Step 3 — Set Up Webhook

1. Still in Settings, click **Webhooks**
2. Add your webhook URL:
   - Local testing: `https://your-ngrok-url.ngrok-free.app/api/v1/payments/card/webhook`
   - Production: `https://your-api-domain.com/api/v1/payments/card/webhook`
3. Set a **Secret Hash** (make one up, e.g. "printex-flw-webhook-2024")
4. Copy that same secret into `FLW_WEBHOOK_SECRET` in `.env`

### Step 4 — Test Card Payment

Use these test card details on Flutterwave's checkout:
- Card number: `5531 8866 5214 2950`
- Expiry: 09/32
- CVV: 564
- OTP: 12345

---

## 11. Cloudflare R2 Setup

### Step 1 — Create a Cloudflare Account

1. Go to https://cloudflare.com and click **Sign Up**
2. Verify your email

### Step 2 — Create an R2 Bucket

1. In the Cloudflare dashboard, click **R2** in the left sidebar
2. Click **Create bucket**
3. Name: `printex-media`
4. Leave all defaults and click **Create bucket**

### Step 3 — Enable Public Access

1. Open your `printex-media` bucket
2. Click **Settings** tab
3. Under **Public access**, click **Allow Access**
4. Copy the **Public Bucket URL** (looks like `https://pub-xxxxx.r2.dev`)
5. Save this as `R2_PUBLIC_URL` in `.env`

### Step 4 — Create API Token

1. Go back to R2 overview → **Manage R2 API tokens**
2. Click **Create API token**
3. Permissions: **Object Read & Write**
4. Specify bucket: `printex-media`
5. Click **Create API token**
6. Copy:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
7. Your Account ID is in the right sidebar of any R2 page → `R2_ACCOUNT_ID`

---

## 12. Deploying Live for Free

### Overview

| Service | What it hosts | Cost |
|---|---|---|
| Fly.io | FastAPI backend | Free (3 VMs) |
| Vercel | Next.js frontend | Free |
| Supabase | PostgreSQL database | Free (500 MB) |
| Upstash | Redis cache | Free (10K req/day) |

### Step 1 — Deploy the Backend to Fly.io

**Install the Fly CLI:**
```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell as Admin)
iwr https://fly.io/install.ps1 -useb | iex
```

**Sign up and log in:**
```bash
fly auth signup   # or: fly auth login
```

**Deploy:**
```bash
cd printex-system/backend

# Initialize the Fly app (only once)
fly launch \
  --name printex-api \
  --region jnb \
  --no-deploy

# This creates a fly.toml config file. Edit it to set:
# [env]
#   PORT = "8000"
# [[services]]
#   internal_port = 8000

# Set all your environment variables as secrets:
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres" \
  DATABASE_URL_SYNC="postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres" \
  REDIS_URL="redis://default:PASSWORD@HOST.upstash.io:PORT" \
  SECRET_KEY="your-secret-key" \
  JWT_SECRET="your-jwt-secret" \
  AT_USERNAME="sandbox" \
  AT_API_KEY="your-at-key" \
  MPESA_CONSUMER_KEY="your-key" \
  MPESA_CONSUMER_SECRET="your-secret" \
  MPESA_PASSKEY="your-passkey" \
  MPESA_SHORTCODE="174379" \
  MPESA_ENV="sandbox" \
  APP_ENV="production" \
  DEBUG="false" \
  ALLOWED_ORIGINS="https://your-vercel-app.vercel.app"

# Deploy
fly deploy

# Check it's running
fly status
curl https://printex-api.fly.dev/health
```

Your API is now live at `https://printex-api.fly.dev`

### Step 2 — Deploy the Frontend to Vercel

**Install Vercel CLI:**
```bash
npm install -g vercel
```

**Deploy:**
```bash
cd printex-system/frontend

# First time setup
vercel

# Answer the prompts:
# Set up and deploy? Y
# Which scope? (your account)
# Link to existing project? N
# Project name: printex-frontend
# Directory: ./  (current)
# Override settings? N

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL production
# Enter value: https://printex-api.fly.dev/api/v1

# Deploy to production
vercel --prod
```

Your storefront is now live at `https://printex-frontend.vercel.app`

### Step 3 — Update CORS

After deploying frontend, go back and update:
```bash
fly secrets set ALLOWED_ORIGINS="https://printex-frontend.vercel.app"
fly deploy
```

### Step 4 — Update M-Pesa Callback URL

```bash
fly secrets set MPESA_CALLBACK_URL="https://printex-api.fly.dev/api/v1/payments/mpesa/callback"
fly deploy
```

---

## 13. First Steps After Launch

Once everything is running, here's what to do in order:

### 1. Create your Super Admin account

```bash
curl -X POST https://printex-api.fly.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Admin User",
    "email": "admin@yourdomain.com",
    "phone": "+254712345678",
    "password": "YourStrongPassword123"
  }'
```

Then manually update the role in your Supabase SQL editor:
```sql
UPDATE users SET role = 'super_admin' WHERE email = 'admin@yourdomain.com';
```

### 2. Create your first branch

```bash
# First login to get your token
TOKEN=$(curl -s -X POST https://printex-api.fly.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier": "admin@yourdomain.com", "password": "YourStrongPassword123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# No branch creation endpoint yet — insert directly in Supabase:
```

In your Supabase SQL editor:
```sql
INSERT INTO branches (id, name, slug, address, area, city, is_active)
VALUES (
  gen_random_uuid(),
  'Printex Nairobi',
  'printex-nairobi',
  'Westlands Mall, Nairobi',
  'Westlands',
  'Nairobi',
  true
);
```

### 3. Add your first product categories

Go to `https://printex-api.fly.dev/api/docs` → Categories → POST `/api/v1/categories`

Create these to start:
- Food Cupboard
- Fresh Food
- Beverages
- Baby & Kids
- Health & Beauty
- Cleaning

### 4. Add your first products

Use `POST /api/v1/products` in the API docs. For each product you'll need:
- `sku`: unique code (e.g. `MILK-KK-500`)
- `name`: product name
- `slug`: URL-friendly name (e.g. `kienyeji-milk-500ml`)
- `price_kes`: price in **cents** (e.g. 6500 = KES 65.00)
- `category_id`: ID from the category you created

### 5. Set stock levels

For each product + branch combination, call:
```
POST /api/v1/inventory/restock/{product_id}/{branch_id}?quantity=100
```

---

## 14. Troubleshooting

### "Cannot connect to database"

```
sqlalchemy.exc.OperationalError: could not connect to server
```

**Fix:**
- Check PostgreSQL is running: `pg_isready` or `docker compose ps`
- Verify `DATABASE_URL` in `.env` has the correct username/password/host
- If using Docker: make sure you're running `docker compose up` from the `infra/` folder

### "Redis connection refused"

```
redis.exceptions.ConnectionError: Error 111 connecting to localhost:6379
```

**Fix:**
- Start Redis: `sudo service redis-server start` or `brew services start redis`
- Verify: `redis-cli ping` should return `PONG`
- If using Docker: it starts automatically with `docker compose up`

### "Module not found" (Python)

```
ModuleNotFoundError: No module named 'fastapi'
```

**Fix:**
```bash
# Make sure virtual environment is activated
source .venv/bin/activate  # macOS/Linux
.venv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -r requirements.txt
pip install "pydantic[email]"
```

### "Port 8000 already in use"

```
ERROR: [Errno 98] Address already in use
```

**Fix:**
```bash
# Find what's using port 8000
lsof -i :8000        # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill it (replace PID with the process ID shown)
kill -9 PID          # macOS/Linux
taskkill /PID PID /F # Windows

# Or just use a different port:
uvicorn app.main:app --port 8001
```

### "CORS error" in browser

```
Access to XMLHttpRequest blocked by CORS policy
```

**Fix:**
- Check `ALLOWED_ORIGINS` in `.env` includes your frontend URL exactly
- Example: `ALLOWED_ORIGINS=http://localhost:3000` (no trailing slash)
- Restart the backend after changing `.env`

### "Invalid or expired token" on every request

**Fix:**
- Clear localStorage in your browser: DevTools → Application → Storage → Clear All
- Log in again — old tokens may be from a different `JWT_SECRET`

### M-Pesa STK push returns error

```
{"errorCode": "400.002.02", "errorMessage": "Bad Request"}
```

**Fix:**
- Phone number must be in format `254712345678` (no `+`, no `0` prefix)
- Make sure `MPESA_SHORTCODE=174379` for sandbox
- Check `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET` are copied correctly (no extra spaces)
- Verify `MPESA_ENV=sandbox`

### Docker containers keep restarting

```bash
# Check logs to see the error
docker compose logs backend
docker compose logs frontend
docker compose logs db
```

Common cause: `.env` file missing or has wrong database URL. The backend can't start without a valid DB connection.

### Frontend shows blank page

```bash
# Check frontend logs
docker compose logs frontend

# Or check browser console (F12)
```

Common cause: `NEXT_PUBLIC_API_URL` not set, so API calls fail silently.

---

## Still Stuck?

The API documentation at `http://localhost:8000/api/docs` is your best friend — every endpoint is documented with example requests and responses. Use the "Try it out" button to test endpoints directly.

For M-Pesa specific issues: https://developer.safaricom.co.ke/Documentation
For Africa's Talking: https://developers.africastalking.com/docs/sms
For Flutterwave: https://developer.flutterwave.com/docs
For Fly.io: https://fly.io/docs/

---

*Printex Engineers v1.0 — Phase 1 Complete*
*Next: Add loyalty engine, digital wallet, live driver tracking (Phase 2)*
