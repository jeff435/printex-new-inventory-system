# The Very Simple Printex Setup Guide

**For someone who has never done this before.**

This guide explains every single step. Nothing is skipped. If you follow it in
order, it will work.

Take your time. Getting this set up takes about **1 to 2 hours** the first time,
and most of that is just waiting for things to download.

---

## Before we start: what are we even doing?

Imagine you want to run a small shop.

You need **four helpers**:

| Helper | What it does | Real name |
|---|---|---|
| The **Notebook** | Remembers every part, price, and customer | PostgreSQL |
| The **Sticky Notes** | Remembers quick things for a short time | Redis |
| The **Manager** | Does the thinking. Adds up prices, checks stock | FastAPI (backend) |
| The **Shop Window** | The pretty part people look at and click | Next.js (frontend) |

All four have to be running at the same time for the shop to work.

Starting four helpers by hand every day would be annoying. So we use a tool
called **Docker**, which starts all four with one command.

Think of Docker like a **lunchbox**. Instead of carrying an apple, a sandwich,
a drink and a cookie separately, you put them all in one box and carry the box.

**We are going to:**
1. Install the tools (you only ever do this once)
2. Press one button to start the shop
3. Learn how to turn it on and off

---

## A few words you'll see a lot

Don't worry about memorising these. Come back if you get confused.

- **Terminal** — a black window where you type commands instead of clicking
  buttons. It looks scary. It isn't.
- **Command** — a line you type into the terminal, then press Enter.
- **Install** — download a program and set it up.
- **WSL** — a way to run Linux (a different operating system) inside Windows.
- **Container** — one of our four helpers, running inside Docker.

### How to use the terminal

When this guide shows a grey box like this:

```
some-command-here
```

It means: **type that into the terminal, then press Enter.**

Three things that trip people up:

1. **Copy and paste instead of typing.** One wrong letter breaks it.
   In the terminal, paste with **Ctrl+Shift+V** (not Ctrl+V).
2. **When you type a password, nothing appears.** No dots, no stars, nothing.
   The computer *is* hearing you. Just type it and press Enter.
3. **If you see a lot of text scroll past, that's normal.** Computers talk a lot.
   You only need to worry if it says the word **error** and then stops.

---

# PART 1 — INSTALLING THE TOOLS

You do this part **once**. Never again on this computer.

---

## Step 1: Install WSL (Linux inside Windows)

**Why?** This project was built for Linux computers. WSL lets your Windows
computer pretend to be a Linux computer when it needs to.

### 1.1 Open PowerShell as Administrator

"As Administrator" means "with permission to change important things."

1. Click the **Start** button
2. Type `powershell`
3. **Right-click** on *Windows PowerShell*
4. Choose **Run as administrator**
5. A box asks "Do you want to allow this app to make changes?" → click **Yes**

You should now see a blue window.

### 1.2 Type the magic command

```
wsl --install -d Ubuntu
```

Press Enter. Now **wait**. It's downloading. This can take 5–15 minutes
depending on your internet.

### 1.3 Restart your computer

When it finishes, it will tell you to restart. **Do it.** It won't work
otherwise.

### 1.4 Set up your Linux username

After restarting, a black window opens by itself and says
`Installing, this may take a few minutes...`

Then it asks for a **username**. Type something simple and lowercase, like your
first name:

```
peter
```

Then it asks for a **password**. Type one and press Enter. It asks again to
check. Type the same one.

> **Remember this password.** Write it down somewhere. You'll need it later,
> and there's no "forgot password" button.
>
> Remember: **nothing appears on screen while you type it.** That's normal.

### 1.5 Check it worked

You should see something like:

```
peter@DESKTOP-1234:~$
```

That's your Ubuntu terminal. **This is where you'll do everything from now on.**

To open it again later: click Start, type `Ubuntu`, press Enter.

### 1.6 Update Ubuntu

Fresh Ubuntu is slightly out of date. Let's update it:

```
sudo apt update && sudo apt upgrade -y
```

`sudo` means "do this as the boss." It will ask for the password you just made.

Lots of text will scroll by. Wait for it to stop and show `peter@...$` again.
This takes a few minutes.

✅ **Checkpoint:** You have an Ubuntu terminal that you can open from the Start
menu.

---

## Step 2: Install Docker Desktop

**Why?** Docker is the lunchbox that carries our four helpers.

### 2.1 Download it

1. Open your web browser
2. Go to **docker.com/products/docker-desktop**
3. Click **Download for Windows**
4. Wait — it's a big file, around 500 MB

### 2.2 Install it

1. Find the downloaded file (usually in your **Downloads** folder), double-click it
2. When it asks about options, make sure **"Use WSL 2 instead of Hyper-V"** is
   **ticked** ✔
3. Click **OK** and wait
4. Restart your computer when it asks

### 2.3 Open Docker Desktop

Click Start → type `Docker Desktop` → press Enter.

The first time, it shows a licence agreement. Click **Accept**. It may ask you
to sign in — **you can skip this**, you don't need an account.

Wait until the little whale icon at the bottom-left is **green** and says
**Engine running**. This takes a minute or two.

### 2.4 ⚠️ The most important setting in this whole guide

Most people who get stuck get stuck here. Please don't skip it.

1. In Docker Desktop, click the **⚙️ gear icon** (Settings), top-right
2. Click **Resources** on the left
3. Click **WSL Integration** underneath it
4. Find **Ubuntu** in the list and turn its switch **ON** ✅
5. Click **Apply & Restart** at the bottom
6. Wait for it to restart

**What does this do?** It lets your Ubuntu terminal talk to Docker. Without it,
Ubuntu doesn't know Docker exists, and every command later will say
`docker: command not found`.

### 2.5 Check it worked

Open your **Ubuntu** terminal (Start → type `Ubuntu` → Enter) and type:

```
docker --version
```

**Good** — you see something like `Docker version 27.3.1`

**Bad** — you see `docker: command not found`
→ Go back to step 2.4. The switch didn't get turned on, or you didn't click
Apply & Restart.

Also check:

```
docker compose version
```

You should see a version number.

✅ **Checkpoint:** Typing `docker --version` in Ubuntu shows a version number.

---

## Step 3: Install VS Code

**Why?** VS Code is where you look at and edit the project's files. It's like
Microsoft Word, but for code.

### 3.1 Download and install

1. Go to **code.visualstudio.com**
2. Click the big **Download for Windows** button
3. Run the downloaded file
4. Accept the agreement, click Next through everything
5. On the "Select Additional Tasks" screen, **tick "Add to PATH"** if you see it

### 3.2 Add the WSL extension

Extensions are add-ons that teach VS Code new tricks.

1. Open VS Code
2. On the left edge, click the icon that looks like **four squares** (Extensions)
3. In the search box at the top, type `WSL`
4. Find the one called **WSL** made by **Microsoft**
5. Click the blue **Install** button

**Why this one?** It lets VS Code edit files inside Ubuntu. Without it, VS Code
can only see your Windows files, and the project lives in Ubuntu.

✅ **Checkpoint:** VS Code is installed and the WSL extension is installed.

---

## Step 4: Install Git

**Why?** Git keeps track of changes to code. You need it even if you never use
it directly.

In your **Ubuntu** terminal:

```
sudo apt install -y git
```

Then tell Git who you are (put your own name and email):

```
git config --global user.name "Peter Kamau"
git config --global user.email "peter@example.com"
```

And one more, which is important:

```
git config --global core.autocrlf input
```

**What's that last one?** Windows and Linux mark the end of a line differently —
a tiny invisible difference. This setting stops Git from "helpfully" changing
them, which would break our start-up script.

✅ **Checkpoint:** All tools installed! The hard part is over.

---

# PART 2 — SETTING UP THE PROJECT

---

## Step 5: Put the project in the right place

### ⚠️ This step matters more than it looks

Your computer has **two** filesystems now:

- The **Windows** side — `C:\Users\You\Documents`
- The **Linux** side — `/home/peter`

The project **must** go on the Linux side.

**Why?** When Docker reaches across from Linux into Windows, it's like shouting
through a wall. It's slow, and it often doesn't hear you. If you put the project
on the Windows side:

- The app takes 30+ seconds to update instead of 1 second
- You save a file and nothing happens at all

So we put it in your Linux home folder.

### 5.1 Make a folder for your projects

In your **Ubuntu** terminal:

```
cd ~
```

`cd` means "change directory" (go to a folder). `~` means "my home folder."

```
mkdir -p projects
```

`mkdir` means "make directory." Now go into it:

```
cd projects
```

### 5.2 Move the zip file into Ubuntu

The zip file is probably in your Windows Downloads folder. Let's copy it over.

Type this, replacing `YourName` with your **Windows** username:

```
cp /mnt/c/Users/YourName/Downloads/printex-system.zip .
```

**What's `/mnt/c/`?** That's how Linux sees your Windows `C:` drive.
The `.` at the end means "put it right here."

Not sure of your Windows username? Look at it:

```
ls /mnt/c/Users/
```

That lists the folders. Yours is in there.

### 5.3 Unzip it

First install the unzip tool:

```
sudo apt install -y unzip
```

Then unzip:

```
unzip printex-system.zip
```

Then go into the folder:

```
cd printex-system
```

### 5.4 Check you're in the right place

```
ls
```

`ls` means "list" — show me what's here. You should see:

```
README.md  SETUP_GUIDE.md  backend  docker-compose.yml  docs  frontend  scripts
```

If you see those, you're in the right place. 🎉

✅ **Checkpoint:** Typing `ls` shows `backend`, `frontend`, and `docker-compose.yml`.

---

## Step 6: Open the project in VS Code

Still in the same terminal, type:

```
code .
```

(That's the word `code`, a space, and a **full stop**.)

The first time, it downloads a small helper. Wait a moment. VS Code will open.

### Check you're connected to Linux

Look at the **bottom-left corner** of VS Code. You should see a blue box that
says:

```
WSL: Ubuntu
```

✅ **Good** — you're editing Linux files.
❌ **If it doesn't say that** — close VS Code, go back to the Ubuntu terminal,
and type `code .` again.

### Install the recommended extensions

VS Code may show a popup: *"This workspace has extension recommendations."*
Click **Install All**. These help colour the code and spot mistakes.

✅ **Checkpoint:** VS Code is open, showing your project, and says `WSL: Ubuntu`.

---

# PART 3 — STARTING THE SHOP

This is the fun part.

---

## Step 7: Press the button

Go back to your **Ubuntu terminal**. Make sure you're in the project folder
(type `ls` — you should see `backend` and `frontend`).

Now type:

```
./scripts/bootstrap.sh
```

Press Enter.

### What's happening now?

A lot of text scrolls past. Here's what it's actually doing, in order:

1. **Making your settings files** — including secret passwords for the app,
   generated randomly so they're safe
2. **Downloading the four helpers** — this is the slow bit, several hundred MB
3. **Starting them up**
4. **Building the Notebook's pages** — creating the tables that hold parts,
   customers and orders
5. **Writing in your parts** — all 134 parts from the handwritten book

### ⏰ How long?

**The first time: 5 to 15 minutes.** It's downloading a lot.
It may look frozen. It isn't. Go make a drink.

Every time after: about 30 seconds.

### How do you know it worked?

At the end you'll see a box like this:

```
  ─────────────────────────────────────────────
   Printex is running.

     Storefront   http://localhost:3000
     Admin        http://localhost:3000/admin
     API docs     http://localhost:8000/api/docs
  ─────────────────────────────────────────────
```

And just above it, something like:

```
  134 parts · 6,329 units on hand
  31 parts flagged 'needs pricing' (cannot be sold yet)
```

🎉 **That's it. Your shop is running.**

---

## Step 8: Look at it!

Open your normal web browser (Chrome, Edge, whatever) and go to:

**http://localhost:3000**

> **What is `localhost`?** It means "this computer." You're not going out to the
> internet — you're visiting a website living inside your own machine. Nobody
> else in the world can see it. It's your private practice shop.

Also try:

- **http://localhost:3000/admin** — the staff side, for managing parts
- **http://localhost:8000/api/docs** — a list of everything the Manager can do.
  This one looks very technical. That's fine, just have a peek.

---

# PART 4 — EVERYDAY USE

## Turning it on and off

Always be in the project folder first:

```
cd ~/projects/printex-system
```

| What you want | Type this |
|---|---|
| **Start it** | `docker compose up -d` |
| **Stop it** | `docker compose down` |
| **See what's happening** | `docker compose logs -f backend` |
| **Restart the Manager** | `docker compose restart backend` |

`-d` means "in the background," so you get your terminal back.

When watching the logs with `-f`, press **Ctrl+C** to stop watching.
That stops *watching*, not the app.

### ⚠️ One dangerous command

```
docker compose down -v
```

That `-v` **deletes the Notebook completely.** Every part, customer and order is
gone forever. Only use it when you want a totally fresh start.

## Do I have to do all this every time?

**No!** Parts 1, 2 and 3 were one-time setup.

From now on, starting work is just:

1. Open Docker Desktop (wait for the green whale)
2. Open Ubuntu
3. `cd ~/projects/printex-system`
4. `docker compose up -d`
5. Open http://localhost:3000

That's it.

---

# PART 5 — WHEN THINGS GO WRONG

Everyone hits these. Nothing here means you broke it.

### "docker: command not found"

The Ubuntu ↔ Docker switch is off.
→ Docker Desktop → ⚙️ Settings → Resources → WSL Integration → turn **Ubuntu**
on → **Apply & Restart**. Then close and reopen your Ubuntu terminal.

### "Cannot connect to the Docker daemon"

Docker Desktop isn't running.
→ Open Docker Desktop and wait for the whale to go green.

### "port is already allocated"

Another program is using the same door number.
→ Close other coding projects, or restart your computer.

### "permission denied" when running bootstrap.sh

The file isn't marked as runnable.
→ Type this once, then try again:
```
chmod +x scripts/bootstrap.sh
```

### The page won't load / says "can't reach this site"

Check things are running:
```
docker compose ps
```
Every row should say **running** or **healthy**.
If not: `docker compose up -d`

### "column products.part_number does not exist"

The Notebook is missing some columns.
→ Just run it again — it's safe to repeat:
```
./scripts/bootstrap.sh
```

### Everything is slow, or my changes don't show up

The project is probably on the Windows side by mistake.
→ Check where you are:
```
pwd
```
**Good:** `/home/peter/projects/printex-system`
**Bad:** anything starting with `/mnt/c/`
If it's bad, go back to Step 5 and move it.

### I want to start completely over

```
docker compose down -v
./scripts/bootstrap.sh
```

⚠️ This erases everything and rebuilds from scratch. That's fine right now,
while it's only practice data.

---

# PART 6 — WHAT'S NEXT?

Right now the shop only runs on **your** computer. To let real customers visit,
you'd put it on the internet — that's called **deploying**.

There are free services for this: **Vercel** for the Shop Window, **Fly.io** for
the Manager, **Supabase** for the Notebook.

The instructions are in **SETUP_GUIDE.md**, Part 5. That guide is written for
someone more experienced — but you've already done the hardest part, so it'll
make more sense than you expect.

---

## The whole thing, on one page

**Once, ever:**
1. Install WSL → `wsl --install -d Ubuntu` → restart → make username & password
2. Install Docker Desktop → **turn on WSL Integration for Ubuntu** ⚠️
3. Install VS Code → add the **WSL** extension
4. Install Git → `sudo apt install -y git`

**Once, for this project:**
5. `cd ~ && mkdir -p projects && cd projects`
6. Copy the zip in, `unzip printex-system.zip`, `cd printex-system`
7. `./scripts/bootstrap.sh` ← wait 5–15 min

**Every day after:**
```
cd ~/projects/printex-system
docker compose up -d
```
Then open **http://localhost:3000**

---

**If you get stuck:** copy the exact error message — the whole red bit — and ask
for help with it. "It doesn't work" is very hard to help with. The error message
almost always says what's wrong.

You've got this. 👍
