PRINTEX — ready-made .env files
================================

Your code was fine — NEXT_PUBLIC_API_URL, CORS, and the docker-compose
network settings all already point to the right places. The most likely
reason the backend shows "no connection / no server" is that these two
files (which are git-ignored, so they never end up inside a zip export)
don't exist yet on your machine.

WHAT TO DO
----------
1. Copy `backend/.env` from this folder into the `backend/` folder of your
   project (next to backend/.env.example), replacing nothing else.
2. Copy `frontend/.env.local` from this folder into the `frontend/` folder
   of your project.
3. From your project's root folder, open a terminal and run:

       docker compose down
       docker compose up -d --build

4. Wait about 30–60 seconds, then check it's alive:

       curl http://localhost:8000/health

   You should see a small JSON response, not an error. If curl isn't
   installed, just open http://localhost:8000/health in your browser.

5. Refresh http://localhost:3000/admin — the "no connection" error should
   be gone and login should work.

IF STEP 4 STILL FAILS
----------------------
Run:  docker compose logs backend
...and read the last ~20 lines. That will show the real error (wrong DB
password, port already in use, etc.) instead of the generic "no
connection" message the browser gives you.

Already-generated secrets: this backend/.env has fresh, random
SECRET_KEY and JWT_SECRET values filled in for you — you don't need to
generate your own.
