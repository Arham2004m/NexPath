# NexPath — Authentication & Home Module

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

Open the Vite URL shown in the frontend terminal. Registering creates a real MongoDB user, returns a 15-minute access token held only in React memory, and writes a seven-day httpOnly refresh cookie. Reloading silently refreshes the session. Logout clears that cookie.

## API

`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, and protected `GET /api/auth/me` are implemented. Registration errors return `{ message, errors: { field: message } }`; login deliberately responds with generic invalid credentials.
