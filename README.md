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

## Knowledge graph and roadmaps

The brain of the app is a prerequisite graph of skills in `backend/src/data/graph/*.json` (one file per domain) plus `goalPaths.json` (which skills each goal and sub-track needs). The pure engine in `backend/src/engine/` turns an assessment, a goal and weekly hours into a deterministic week-by-week roadmap (Kahn topological sort + weekly packing); the roadmap page shows it as a skill tree or a week list.

- `npm run validate-graph`: checks ids, prerequisites, cycles, topic hours, mini tasks and goal references; the server also refuses to start on an invalid graph.
- `npm run import-resources`: rebuilds each skill's curated resources from `backend/src/data/resources/nexpath-resources.csv` using the rules in `resourceMap.json`, and writes `import-report.json` (unmapped rows, skills with fewer than 3 resources are flagged `needsReview`). Resource links are never invented.
- `npm test` in `backend/`: engine tests (ordering, determinism, mastery, partial credit, packing, deadlines, hours scaling, recommender, progress) and route tests for auth, assessment, goals, roadmaps and hostile input, run against an in-memory MongoDB (downloaded once on first run).
- `npm test` in `frontend/`: page and component tests in jsdom (assessment flow with its timer, goal page estimates, roadmap and progress pages, session expiry).
- Every goal and sub-track has a roadmap path (`goalPaths.json`). Durations shown on the goal page are computed from the graph, not typed in. Skills with thin resources (aptitude, deployment, iOS release, trees) are flagged `needsReview`; send more CSV rows for them and re-run the importer.

### How a roadmap is personalised

1. **Assessment bands:** Intermediate skips a domain's level-1 skills, Advanced skips levels 1 and 2. Level-3 skills are never skipped.
2. **Partial credit by score:** inside a band, the score still counts. A student near the top of a band has also covered part of the next level, so the first topics of those skills are skipped, or the next topic is shortened (a lighter pass). Credit goes first to skills whose own questions (each question is tagged to a skill) were answered correctly and never to skills whose question was answered wrong. The last topic of a skill and every capstone are never skipped.
3. **Capstones:** every goal path ends in a hands-on capstone skill that nothing can skip, so a roadmap is never empty.
4. **"I already know this":** on the roadmap a student can mark a skill as known; this covers areas the assessment cannot (theory, aptitude, research, business) and can be undone.
5. **Weekly hours:** the number of topics per week grows above 15 hours a week, so more hours always means fewer weeks, and the estimates on the goal page come from the same planner.

### Saved roadmaps and progress

The roadmap is saved per student (`Roadmap`, one active version at a time, older versions kept). It is regenerated as a new version when the goal, hours, target, assessment or known skills change, and finished topics are never scheduled again. Ticking a topic or logging time appends a `ProgressEvent`; progress (percentage by hours, weekly completion, time logged vs planned, learning velocity and lag in weeks) is computed from those events by the pure `engine/progress.js`. Open `/roadmap` to tick topics and `/progress` for the dashboard. The tests in `backend/tests` include route tests that run against an in-memory MongoDB (downloaded once on first run), so they never touch your Atlas data.

### Adaptive replanning

`backend/src/engine/replan.js` is a pure function that watches the learning velocity from `engine/progress.js` and adapts the plan:

- **2 or more weeks behind:** every unfinished topic is rescheduled starting today, so the end date moves forward. Finished topics are never moved, and a deadline the student set stays as a date (the weeks left shrink; the app says what weekly load would still meet it, or that it has passed).
- **1 or more weeks ahead** (a real lead beyond the current week, so finishing this week's work on pace never counts): optional advanced topics whose prerequisites are met are added as extras, up to the hours gained. Extras never change the finish date, the pace or the percentage.
- **3 finished weeks in a row below 60% of the plan:** the app offers to plan for fewer hours a week. Nothing changes unless the student accepts (`POST /api/replans/accept-hours`, which only ever lowers the hours).
- At most one automatic replan per 7 days. Every replan creates a new roadmap version (`cause` is `shift` or `enrich`) and a `ReplanEvent` with the trigger numbers, the before and after end dates and the explanation the student sees; nothing is ever deleted.

Replanning is checked whenever the roadmap, dashboard or a tick is requested, so it works without a background job and catches students who stopped logging. `POST /api/roadmaps/replan` checks right now (skipping only the 7 day wait); `GET /api/replans` lists the history and `PATCH /api/replans/:id/seen` records that the student read an explanation. `tests/helpers/simulate.js` runs a day-by-day simulation of fast, steady, slow and intermittent students against the pure engine.

### AI mentor

`/mentor` is a chat with a Gemini-backed mentor. It is called from the server only; the key never reaches the browser. Set these in `backend/.env` (the app starts without them and the mentor then says it is not set up):

- `GEMINI_API_KEY`: from Google AI Studio.
- `GEMINI_MODEL`: the model name. Google renames and retires models, so check the current list and set it here (default `gemini-3.5-flash`).
- `GEMINI_FALLBACK_MODEL` (optional, for example `gemini-3.5-flash-lite`): used when the main model is over quota or still unavailable after one retry, so the mentor keeps answering.
- `CHAT_RATE_LIMIT_PER_HOUR`: messages per student per hour (default 20; failed and refused messages do not count).

Design: the provider sits behind `src/ai/provider.js` (`stream({ system, contents, signal })`), so another model can be swapped in. Safety has two layers: a constrained system prompt (career guidance, learning strategy, the student's roadmap, CS topics) and a keyword filter that answers blatant "ignore your instructions" or "show your prompt" messages and self-harm messages with a fixed reply without calling the model. Student text is untrusted and capped at 1000 characters; a hidden marker in the instructions is watched for in the output and replaced if it ever appears. The model is told the student's goal, track, hours, assessed levels, current week topics, progress, pace and latest plan change, never their name or email, plus the last 10 answered messages. Replies stream over `POST /api/chat/messages` as server-sent events (`delta`, `done`, `error`); `GET /api/chat/history?limit&before` pages the conversation and `DELETE /api/chat/history` clears it. Up to 200 messages per student are kept. One reply at a time per student (the in-flight check lives in the server process, so run a single instance or move it to a shared store when scaling out).

### Password reset and sessions

`POST /api/auth/forgot-password` emails a one-hour, single-use link (`CLIENT_URL/reset-password?token=...`); the answer is identical whether or not the address has an account, links are rate-limited to three an hour per account, and only a hash of the token is stored. `POST /api/auth/reset-password` sets the new password. Resetting or changing a password raises the account's `tokenVersion`, which signs out every other device (access and refresh tokens carry the version they were issued under). Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` (a Gmail app password works). With no `SMTP_HOST`, outside production, the email is printed in the server console so the flow can be tried locally.

### Continuous integration and deployment

`.github/workflows/ci.yml` validates the knowledge graph and runs both test suites and the frontend build on every push and pull request. `render.yaml` is a Render blueprint for the API (set `MONGO_URI`, `CLIENT_URL`, the Gemini and SMTP values; the JWT secrets are generated). `frontend/vercel.json` makes Vercel serve the single-page app for every route; set `VITE_API_URL` to the API address ending in `/api` in Vercel. When the website and API are on different domains the sign-in cookie must be `SameSite=None; Secure`, which `COOKIE_SAMESITE=none` does (the blueprint sets it); some browsers, notably Safari, restrict such cross-site cookies, so a custom domain shared by both is the safer long-term choice. These files have not been exercised against the hosts themselves.

### Demo data and evaluation

- `npm run seed-demo` (in `backend/`) creates two students with five weeks of history: Riya (on track) and Karan (far behind, so the adaptive replanner acts the first time the app loads for him). Password for both: `Demo1234x`. It only ever resets those two accounts. See [DEMO.md](DEMO.md) for a presentation walkthrough.
- `npm run evaluate` (in `backend/`) simulates 50 students (5 goals, 2 weekly-hour levels, 5 work patterns) following a fixed plan and NexPath's adaptive plan, and writes `evaluation/results.csv` and `evaluation/results.md`. Adaptation lowers the average error of the finish date shown to the student from 48.3 to 32.7 days and the average time spent behind from 1.8 to 0.5 weeks; students who keep up are unaffected. Students who work faster than planned get optional extras, not an earlier finish date, so their forecast error is unchanged. The simulated work patterns are deterministic, so results are reproducible; they are not real learners.

## API

- Auth: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, and protected `GET /api/auth/me`. Registration errors return `{ message, errors: { field: message } }`; login deliberately responds with generic invalid credentials.
- Assessment (all require `Authorization: Bearer <access token>`): `GET /api/assessment/domains`, `POST /api/assessment/questions`, `POST /api/assessment/submit`, `GET /api/assessment/latest`.
- Goals and roadmaps: `GET /api/goals`, `GET /api/goals/recommendations`, `PUT /api/me/goal`, `GET /api/graph`, `POST /api/roadmaps/preview` (generates without saving), `GET /api/roadmaps/current` (saved roadmap plus progress), `POST /api/roadmaps/regenerate`, `PATCH /api/roadmaps/current/topics/:topicId` (`{ done, minutesSpent }`), `GET /api/dashboard`, `PUT /api/me/known-skills` (mark or unmark a skill as already known), `POST /api/roadmaps/replan`, `GET /api/replans`, `PATCH /api/replans/:id/seen`, `POST /api/replans/accept-hours`.
- Account: `PATCH /api/auth/me` (`{ name }`), `POST /api/auth/change-password` (`{ currentPassword, newPassword, confirmPassword }`).
- Mentor: `POST /api/chat/messages` (`{ message }`, streams events), `GET /api/chat/history`, `DELETE /api/chat/history`.
- `GET /api/health`.

## Security notes

Helmet security headers, no `X-Powered-By`, a 100 KB body limit, 600 requests a minute per address and 30 sign-in or sign-up attempts per 15 minutes per address (set `TRUST_PROXY=1` behind a hosting proxy). Passwords are limited to 8 to 72 characters (bcrypt ignores the rest), every sign-in takes the same time whether or not the email exists, error answers never include internals, and the assessment only scores the exact questions it issued to that student. Known gaps: refresh tokens are not rotated or revocable yet.

## Troubleshooting MongoDB

The API exits at startup with a hint when it cannot connect.

- `querySrv ECONNREFUSED` / DNS errors: your resolver refuses SRV lookups. Set `DNS_SERVERS=8.8.8.8,1.1.1.1` in `backend/.env`, or use the non-SRV `mongodb://` string from Atlas.
- Timeout / server selection errors: add your current IP in Atlas **Network Access** and make sure the cluster is not paused.
- Authentication errors: check the user and password in `MONGO_URI` (URL-encode special characters).
