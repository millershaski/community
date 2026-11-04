# TheCommunity

A small project-management app in the style of Asana: **Members**, **Issues**, **Tasks** and **Comments**.

- **Issues** have an owner (assignable), a due date, an open/closed status, and can **depend on other issues**. An issue is shown as *Blocked* until every issue it depends on is closed. Circular dependencies are rejected.
- **Tasks** live inside an issue, have an assignable owner and a due date, and can be **marked complete**.
- **Comments** can be written on issues and tasks. A comment's owner is always the member who wrote it.
- **Members** have a **name** and an **icon** (an emoji, or the built-in pixel-art avatar) plus a color. Four members are created automatically on first start: *Tyler* (half-robot / half-human pixel-art face), *The Professor* (👨‍🏫), *Adam* (🕵️) and *Mother* (❤️).

There is one backend and one frontend. The frontend is plain HTML/CSS/JS (no build step) and runs as a website on GitHub Pages, as an installable app on your phone, or as a native Android app.

```
 GitHub Pages (static site)  ─┐
 Phone: installed web app    ─┼──  HTTPS + JSON  ──►  Backend API (Node/Express + SQLite)
 Phone: native Android app   ─┘                        hosted separately (Fly.io, Render, ...)
```

## Repository layout

| Folder | What it is |
| --- | --- |
| `backend/` | REST API (Node.js, Express, SQLite). Has a Dockerfile and `fly.toml`. |
| `frontend/` | The app UI. Static files, installable as a PWA. Deployed to GitHub Pages. |
| `mobile/` | Capacitor wrapper that packages `frontend/` as a native Android (or iOS) app. |
| `.github/workflows/pages.yml` | Deploys `frontend/` to GitHub Pages on every push to `main`. |
| `tools/` | Scripts that generated the pixel-art avatar and app icons (only needed to change them). |

## 1. Run everything locally

Requirements: Node.js 20 or newer (tested on 24).

```bash
# Terminal 1 - backend on http://localhost:3000
cd backend
npm install
npm run seed      # optional: adds demo issues/tasks/comments
npm start

# Terminal 2 - frontend on http://localhost:5173
cd frontend
python3 -m http.server 5173      # or: npx serve -l 5173
```

Open http://localhost:5173. The default API address in `frontend/js/config.js` is `http://localhost:3000`. On first launch pick who you are; comments you write are attributed to that member (switch any time from the avatar menu in the top right).

Run the backend tests with `cd backend && npm test`.

### Backend configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. |
| `DB_PATH` | `./data/taskflow.db` | SQLite file. Must be on persistent storage in production. |
| `ALLOWED_ORIGINS` | *(empty = any)* | Comma-separated list of browser origins allowed by CORS. **Set this in production.** |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the app (the Dockerfile sets `1`). |

## 2. Deploy the backend (hosted separately)

The backend needs a place to run Node.js **and persistent disk storage** for the SQLite file. Free-tier hosts that wipe their disk on restart will lose your data. Below: Fly.io (uses the included `fly.toml`), with notes for Render/Railway.

### Option A - Fly.io

1. Install the CLI (<https://fly.io/docs/flyctl/install/>) and sign in: `fly auth login`. (Fly requires a payment method on file.)
2. From the `backend/` folder:

   ```bash
   cd backend
   fly launch --no-deploy --copy-config --name YOUR-UNIQUE-APP-NAME
   fly volumes create taskflow_data --size 1 --region iad     # same region as primary_region in fly.toml
   fly secrets set \
     ALLOWED_ORIGINS="https://YOUR-GITHUB-USERNAME.github.io,https://localhost,capacitor://localhost"
   fly deploy
   fly scale count 1      # SQLite = a single machine
   ```

3. Your API address is `https://YOUR-UNIQUE-APP-NAME.fly.dev`. Check it: `curl https://YOUR-UNIQUE-APP-NAME.fly.dev/api/health`.
4. Optional demo data: `fly ssh console -C "node src/seed.js"`.

`ALLOWED_ORIGINS` explained: `https://YOUR-GITHUB-USERNAME.github.io` is the Pages site (origin only, no path); `https://localhost` is the Android app; `capacitor://localhost` is the iOS app; add `http://localhost:5173` if you also want local frontend development against the hosted API.

### Option B - Render, Railway or any Docker host

- Create a **Web Service** from this repo with root directory `backend` and runtime **Docker** (it uses `backend/Dockerfile`).
- Attach a **persistent disk/volume mounted at `/data`** (on Render this requires a paid instance type).
- Set the environment variable `ALLOWED_ORIGINS` from the table above. `PORT` is provided by the platform.
- Your API address is the URL the platform gives you (must be `https://`).

### Back up your data

All data is the single file at `DB_PATH` (`/data/taskflow.db` in the container). On Fly: `fly ssh sftp get /data/taskflow.db` or `fly volumes snapshots list`.

## 3. Publish the frontend on GitHub Pages

1. Create a GitHub repository and push this whole folder to it (branch `main`):

   ```bash
   cd "mobile app dev"
   git init -b main
   git add .
   git commit -m "TheCommunity"
   git remote add origin https://github.com/YOUR-GITHUB-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

2. In the repo go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Go to **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - Name: `API_BASE_URL`
   - Value: your backend address, e.g. `https://YOUR-UNIQUE-APP-NAME.fly.dev` (no trailing slash)
4. Open the **Actions** tab, select **Deploy frontend to GitHub Pages**, and click **Run workflow** (it also runs automatically on every push to `main` that changes `frontend/`).
5. When it finishes, the site is live at `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/`.
6. Open it and choose who you are. The server address is stored only in that browser (avatar menu → *Connection settings* to change it).

Make sure the backend's `ALLOWED_ORIGINS` contains `https://YOUR-GITHUB-USERNAME.github.io`; otherwise the browser blocks the requests.

If you skip step 3, the app simply asks for the server address on first launch.

## 4. The app on your phone

The same frontend is the phone app. Pick either way.

### Way 1 - Install from the website (easiest, no build)

Open your GitHub Pages URL on the phone, then:

- **Android (Chrome):** menu (⋮) → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

It opens full-screen like a native app, and re-uses the same backend.

### Way 2 - Native Android app (APK) with Capacitor

Requirements: Node.js 20+, JDK 21, and Android Studio (for the Android SDK).

```bash
cd mobile
npm install
# Optional: bake the server address into the app (otherwise the app asks for it on first launch)
#   edit ../frontend/js/config.js -> API_BASE_URL: 'https://YOUR-UNIQUE-APP-NAME.fly.dev'
npx cap add android          # first time only
npm run sync                 # copies ../frontend into the app and syncs the Android project
npm run android              # opens Android Studio: press Run to install on a phone/emulator
# or build a debug APK from the command line:
npm run apk                  # -> android/app/build/outputs/apk/debug/app-debug.apk
```

Copy the APK to your phone and open it (allow "install unknown apps" when prompted). Re-run `npm run sync` whenever `frontend/` changes. The backend must be reachable over `https://`, and `ALLOWED_ORIGINS` must include `https://localhost` (already in the Fly command above).

To publish on Google Play you need a signed release build (Android Studio → *Build → Generate Signed Bundle / APK*) and a Play developer account. iOS builds (`npx cap add ios`) require a Mac with Xcode and an Apple developer account.

To use your own app id/name, edit `mobile/capacitor.config.json` (`appId`, `appName`) before `npx cap add android`.

## 5. Using the app

- **My tasks** - tasks assigned to the current member, grouped by Overdue / Today / Next 7 days / Later / No due date. Add tasks for yourself with the box at the top.
- **All issues** - table of issues with owner, due date, progress and dependencies, with each issue's tasks listed right underneath (use the arrow to collapse). Filter Open / Closed / All.
- **Issue page** - one view with everything: owner, due date and status at the top, then the issue's tasks (type in "Add task…" and press Enter; click a circle to complete a task; click a row to open the task panel with assignee, due date, description, comments and delete), then description, **Depends on** (add/remove prerequisite issues; "Blocking" shows who depends on this one) and issue comments. Close, reopen or delete the issue from the top right.
- **Team** - add, edit (name, icon, color) or delete members. Deleting a member unassigns their tasks and issues; their comments remain, shown as "Deleted member".
- **Search** (top bar) finds issues and tasks by title.

## API reference

All paths are under `/api`. JSON in, JSON out. There is no authentication. Dates are `YYYY-MM-DD`.

| Method & path | Notes |
| --- | --- |
| `GET /health` | `{ ok }` |
| `GET /members`, `POST /members` | body: `name`, `icon`, `color` (`#rrggbb`). `icon` is an emoji/short text, or `img:avatars/<file>.png` for a bundled image. |
| `PATCH /members/:id`, `DELETE /members/:id` | |
| `GET /issues`, `POST /issues` | body: `title`, `description`, `owner_id`, `due_date`, `status` (`open`/`closed`), `depends_on` (array of issue ids). Responses include `blocked`, `task_count`, `completed_task_count`. |
| `GET/PATCH/DELETE /issues/:id` | `PATCH` accepts the same fields; `depends_on` replaces the whole list. Cycles → `400`. |
| `GET /tasks?issue_id=&owner_id=` | |
| `POST /issues/:id/tasks` | body: `title`, `description`, `owner_id`, `due_date` |
| `GET/PATCH/DELETE /tasks/:id` | `PATCH { "completed": true }` marks a task finished (sets `completed_at`). |
| `GET /comments?issue_id=` or `?task_id=` | |
| `POST /issues/:id/comments`, `POST /tasks/:id/comments` | body: `owner_id` (the commenting member), `body` |
| `DELETE /comments/:id` | |

## Security notes

- There is no login or access code: anyone who knows the backend address can read and change all data, and the "who are you" choice is trust-based. `ALLOWED_ORIGINS` only restricts which *websites* may call the API from a browser; it does not stop other clients. Suitable for a small trusted team; add authentication before sharing the address widely.
- Always serve the backend over HTTPS, and set `ALLOWED_ORIGINS` in production (the server prints a warning at startup if it is missing).
- The API validates all input, uses parameterized SQL, rate-limits requests, and the frontend renders all user text as plain text (no HTML injection).
