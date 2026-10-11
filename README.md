# NexPath

Two apps, nothing else: `backend/` (Express + MongoDB) and `frontend/` (React + Vite).

## Prerequisites

Node.js 18+ and a MongoDB Atlas cluster (or local MongoDB). In Atlas, create a database user, allow your development IP under **Network Access**, then copy the connection string.

## Run locally

1. Copy `backend/.env.example` to `backend/.env`, then set `MONGO_URI` and two distinct, long random JWT secrets. Set `CLIENT_URL` to the Vite URL (normally `http://localhost:5173`).
2. Copy `frontend/.env.example` to `frontend/.env` if your API is not at the default address.
3. In separate terminals:

   ```bash
   cd backend && npm install && npm run dev
   cd frontend && npm install && npm run dev
   ```

Open the Vite URL shown in the frontend terminal. Registering creates a real MongoDB user, returns a 15-minute access token held only in React memory, and writes a seven-day httpOnly refresh cookie. Reloading silently refreshes the session (and the API client renews the access token once on a 401, so a long timed test survives). Logout clears that cookie.

The assessment question bank (`backend/src/data/questions.json`) is seeded into MongoDB automatically on first start. To re-sync after editing it, run `npm run seed` in `backend/` (safe to repeat).

## Assessment

`/assessment` runs a 25-minute timed test: across 9 domains (programming, DSA, OS, DBMS, web, AI/ML, networks, system design, mobile) the student either self-reports "never studied" or answers 3 sampled questions (1 easy, 1 medium, 1 hard), 27 in total. Questions are sampled and scored on the server, correct answers never reach the browser, and each attempt is saved against the signed-in user. Retakes prefer questions the user has not seen. To demo the auto-submit quickly, set `VITE_ASSESSMENT_MINUTES=1` in `frontend/.env` and restart the frontend.

## API

- Auth: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, and protected `GET /api/auth/me`. Registration errors return `{ message, errors: { field: message } }`; login deliberately responds with generic invalid credentials.
- Assessment (all require `Authorization: Bearer <access token>`): `GET /api/assessment/domains`, `POST /api/assessment/questions`, `POST /api/assessment/submit`, `GET /api/assessment/latest`.
- `GET /api/health`.

## Troubleshooting MongoDB

The API exits at startup with a hint when it cannot connect.

- `querySrv ECONNREFUSED` / DNS errors: your resolver refuses SRV lookups. Set `DNS_SERVERS=8.8.8.8,1.1.1.1` in `backend/.env`, or use the non-SRV `mongodb://` string from Atlas.
- Timeout / server selection errors: add your current IP in Atlas **Network Access** and make sure the cluster is not paused.
- Authentication errors: check the user and password in `MONGO_URI` (URL-encode special characters).
