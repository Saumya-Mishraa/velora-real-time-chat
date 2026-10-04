# Velora

**Conversations, in real time.**

A full-stack real-time chat application built with React (Vite + Tailwind + Framer Motion) on the
frontend, and Node/Express + Socket.IO + MongoDB on the backend.

This README is written for someone setting this up for the first time — follow it top to bottom.

---

## 1. What's actually implemented

Being upfront about scope, since a spec this size always has trade-offs. Everything below is
real, wired end-to-end (MongoDB persistence + Socket.IO events, not timers or mock data) unless
explicitly marked otherwise.

**Messaging core**
- Real-time 1:1 and group messaging over Socket.IO (instant delivery, no polling)
- WhatsApp-style message states: **sent** (single tick) → **delivered** (double grey tick, the
  moment the recipient's device receives it) → **seen** (double tick, colored, once they've
  actually viewed the conversation) — tracked per-message in MongoDB (`deliveredTo` / `readBy`)
- Typing indicators (including "X and Y are typing…" in groups)
- Online/offline presence with last-seen, respecting each user's privacy setting
- Message replies with a quoted preview; clicking it scrolls to and highlights the original
- Edit your own text messages (with an "edited" label), delete for me / delete for everyone
- Emoji reactions (react, change, remove), synced live
- "Message info" (sent/delivered/seen timestamps, or "seen by" for groups)
- Unread counters, an unread separator in the thread, and a floating "↓ N new messages" button
  that only appears when you've scrolled up and new messages arrive
- In-conversation message search with next/previous navigation and highlight-and-scroll
- Pin/unpin messages (group pin is admin-only), with a pinned-messages bar and list

**Media**
- Image upload with a preview-before-sending step (cancel or send)
- File sharing (PDF, Office docs, zip, plain text) with name/size/download
- Voice messages — real browser `MediaRecorder` recording, with a live timer, cancel, and
  play/pause/progress on both the sender's preview and the received bubble
- Drag-and-drop file sharing on desktop (a file picker is used on mobile, as usual there)
- Per-conversation shared Media / Files / Links, browsable from chat info

**Chat & contact management**
- Pin chats (stay at the top of the sidebar), archive chats (hidden, collapsible, fully
  restorable), mute (1h/8h/1w/always, persisted per user per chat)
- Per-chat custom wallpaper (upload an image from your device; persists across refresh/reopen;
  doesn't touch the app's existing theme system)
- Clear chat (hides history for you only), block/unblock a user (server-enforced — a blocked
  relationship stops messaging and presence visibility in both directions, doesn't delete history)
- Groups: create, add/remove members, promote/demote admins, group description & avatar, leave

**Profile & privacy**
- Editable name, username (read-only after signup), bio, profile picture, free-text status
- Privacy controls (last seen / online status / profile picture / who can message you —
  everyone or nobody) that actually gate what the backend returns and what the socket broadcasts,
  not just what the UI hides
- Blocked-users list with unblock

**Notifications**
- Browser `Notification` API for new messages, respecting mute state, blocks, and whether you're
  already looking at that conversation

**Platform**
- 4 premium dark themes (Nebula Ember default, Sakura Dream, Ocean Pulse, Midnight Aurora),
  persisted per-browser, unrelated code paths from the wallpaper feature above
- Mobile-first responsive pass: full-width single-pane navigation under 640px, a bottom-sheet
  emoji picker below 480px (rather than a floating panel that could overflow a 320px viewport),
  safe-area padding for notches/home indicators, and a global `overflow-x: hidden` guard
- Code-split emoji picker bundle (loaded on first open, not in the initial bundle)

**Simplified / explicitly not built** (documented, not faked):
- **Forgot/reset password** works end-to-end but doesn't send a real email (no SMTP provider
  configured) — the API returns the reset token directly and the UI shows it as a clickable
  link, so the flow is fully visible without standing up an email service.
- **Light mode** is not implemented — the app ships with 4 dark themes (Settings → Appearance).
- **Voice/video calling** (as opposed to voice *messages*, which are implemented) is out of
  scope — no call signaling exists.
- Read receipts, presence, and message info are per-user-privacy-aware, but there is no
  granular "read receipts off" toggle independent of the "who can see online status" ones.

---

## 2. A note on how this was tested

This build was written and verified in a sandboxed environment with **no live MongoDB instance
and no browser** available to it — network access there is limited to package registries
(npm/GitHub), so it can't reach MongoDB Atlas, Cloudinary, or a real Socket.IO client. What was
actually verified there:
- `node --check` on every backend source file (syntax), plus a full module-import smoke test
  (`import()`'d `server.js` end-to-end — every controller/model/socket-handler import resolves
  with no circular-import or missing-export errors; the only failure was the expected "can't
  reach a fake Mongo URI").
- `npm run build` for the frontend (Vite/esbuild) — a clean production build with no import,
  syntax, or JSX errors.
- Manual code review of every Socket.IO event against its emitter/listener pair on the other side.

What that means practically: the code is structurally sound and everything above is real,
non-stubbed logic — but a live end-to-end pass (two real browsers, a real MongoDB Atlas cluster,
watching delivery/seen ticks flip in real time, clicking through the emoji picker at 320px) has
not been physically run by this process. Please do that pass yourself the first time you run it
locally — see §9 for exactly what to click through.

---

## 3. Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion, Lucide icons, Socket.IO client, Axios
- **Backend:** Node.js, Express, Socket.IO
- **Database:** MongoDB with Mongoose
- **Auth:** JWT + bcrypt
- **File storage:** Local disk by default, Cloudinary optional (also used for voice-message and
  wallpaper uploads — same endpoint, same switch)

---

## 4. Project structure

```
velora/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Sidebar, ChatWindow, MessageBubble, ChatInfoPanel, modals, etc.
│   │   ├── pages/          # Landing, Login, Register, Dashboard, etc.
│   │   ├── context/        # AuthContext, SocketContext, ThemeContext
│   │   └── services/       # axios instance
│   └── package.json
├── server/                  # Express + Socket.IO backend
│   ├── src/
│   │   ├── config/          # db.js, cloudinary.js
│   │   ├── models/          # User, Conversation, Message
│   │   ├── controllers/     # auth, user, conversation, message, chatSettings
│   │   ├── routes/
│   │   ├── middleware/      # auth.js (JWT), upload.js (multer)
│   │   └── socket/          # socketHandler.js
│   ├── .env.example
│   └── package.json
├── .env.example
├── .gitignore
└── package.json              # root convenience scripts
```

---

## 5. Prerequisites

1. **Node.js** v18 or later — https://nodejs.org (the LTS installer is fine)
2. **A MongoDB connection string** — either a local MongoDB install, or a free MongoDB Atlas
   cluster (see §6 below)
3. (Optional) **A Cloudinary account** if you want cloud file storage instead of local disk
   (see §7)

Check your Node version:
```bash
node -v
```

---

## 6. MongoDB Atlas setup (free tier)

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a new **Project**, then click **Build a Database** → choose the **free M0 cluster**.
3. Pick a cloud provider/region close to you and create the cluster (takes a couple of minutes).
4. Under **Database Access**, click **Add New Database User**. Create a username and password
   (use a strong, URL-safe password — avoid `@`, `/`, `:` characters, or URL-encode them).
5. Under **Network Access**, click **Add IP Address** → **Allow Access From Anywhere**
   (`0.0.0.0/0`) for local development. Lock this down for production.
6. Go back to **Database** → click **Connect** on your cluster → **Drivers** → copy the
   connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Replace `<username>` and `<password>` with your database user's credentials, and add a
   database name before the `?`, e.g. `.../velora?retryWrites=true...`.
8. Paste the full string into `MONGO_URI` in your `.env` file (see §8).

---

## 7. Cloudinary setup (optional — local storage works out of the box)

By default, Velora stores uploaded images/files/voice-messages/wallpapers on the server's local
disk under `server/src/uploads/`, which works with zero extra setup. Switch to Cloudinary if you
want uploads to live in the cloud (e.g. for a real deployment where the server's disk isn't
persistent).

1. Create a free account at https://cloudinary.com/users/register/free
2. On your Cloudinary dashboard, copy: **Cloud Name**, **API Key**, **API Secret**
3. In your `.env`, set:
   ```
   USE_CLOUDINARY=true
   CLOUDINARY_CLOUD_NAME=<your cloud name>
   CLOUDINARY_API_KEY=<your api key>
   CLOUDINARY_API_SECRET=<your api secret>
   ```
4. Restart the server. Uploads (images, files, voice messages, wallpapers, avatars — everything
   goes through the same `/api/upload` endpoint) will now go to Cloudinary automatically.

---

## 8. Installation

### Step 1 — Get the code
Extract the ZIP and open the resulting `velora/` folder in your editor of choice.

### Step 2 — Configure environment variables
```bash
cp server/.env.example server/.env
```
Open `server/.env` and fill in:
- `MONGO_URI` — from §6
- `JWT_SECRET` — any long random string, e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `CLIENT_URL` — leave as `http://localhost:5173` for local dev
- Cloudinary vars — only if you set `USE_CLOUDINARY=true` (see §7)

### Step 3 — Install dependencies
From the project root:
```bash
npm install
npm run install:all
```
This installs the root `concurrently` package plus both `client/` and `server/` dependencies.

### Step 4 — Run the app
From the project root:
```bash
npm run dev
```
This starts both the backend (port 5000) and frontend (port 5173) together.

Or, in two separate terminals:
```bash
# Terminal 1
cd server
npm install
npm run dev
```
```bash
# Terminal 2
cd client
npm install
npm run dev
```

### Step 5 — Open the app
- Frontend: **http://localhost:5173**
- Backend health check: **http://localhost:5000/api/health**

Register a new account, open the app in a second browser (or incognito window) with a second
account, and start a conversation to see real-time delivery/seen ticks, typing indicators, and
presence working between the two.

---

## 9. A manual test pass worth running yourself

Since this build couldn't be clicked through in a live browser (see §2), here's a concrete list
to run through once you have it up locally with two accounts in two windows:

- [ ] Send a message → single tick appears immediately; opens to double grey tick on the other
      window without a refresh; double tick turns colored once that window actually opens the chat
- [ ] Type in one window → "is typing…" appears in the other, disappears after you stop/send
- [ ] Close one window entirely → the other shows "Offline" / a last-seen time within a few seconds
- [ ] Reply to a message, click the quoted preview → scrolls to and briefly highlights the original
- [ ] Edit a sent message, delete for me vs. delete for everyone → confirm the other window only
      loses the "everyone" one
- [ ] React with an emoji, change it, remove it
- [ ] Record a voice message (grant mic permission), cancel one, send one, play it back on both ends
- [ ] Select an image → preview appears before it's actually sent; cancel and re-pick
- [ ] Drag a file onto the chat window on desktop
- [ ] Pin a chat, archive a chat, mute a chat for 1h, set a chat wallpaper, then refresh the page —
      all four should still be exactly as you left them
- [ ] Block the other user → they get an error trying to message you; unblock and confirm it works again
- [ ] Create a group, add/remove a member, promote an admin, confirm a non-admin can't do admin actions
- [ ] Resize the browser (or use device toolbar) down to 320/360/375/390/430px — check the emoji
      picker (should become a bottom sheet under 480px), chat input, and modals never cause
      horizontal scrolling
- [ ] Search inside a conversation, step through results
- [ ] Open chat info → Media/Files/Links tabs show what you've actually shared

---

## 10. Troubleshooting

**MongoDB connection errors**
- `MongoNetworkError` / timeout → check Network Access in Atlas allows your IP (or `0.0.0.0/0`).
- `Authentication failed` → check your database user's username/password in the connection
  string, and that any special characters are URL-encoded.

**CORS errors in the browser console**
- Make sure `CLIENT_URL` in `server/.env` exactly matches the URL you're opening the frontend
  at (`http://localhost:5173`, no trailing slash).

**Socket.IO won't connect / stuck on "Reconnecting"**
- Confirm the backend is actually running on port 5000 (`npm run server`).
- If you changed the backend port, update the Vite proxy in `client/vite.config.js`.

**Voice messages don't record**
- Voice recording needs `getUserMedia`, which browsers only allow on `https://` or `localhost` —
  it will fail on a plain `http://` LAN IP. Local dev on `localhost:5173` is fine.
- Check the browser's site permissions if you previously denied microphone access.

**Wallpaper/avatar upload fails**
- Same upload pipeline as file sharing — check `USE_CLOUDINARY` and the 15MB size limit
  (`server/src/middleware/upload.js`); wallpaper/avatar uploads separately cap at ~5-8MB
  client-side before they're even sent.

**Port already in use**
- macOS/Linux: `lsof -i :5000` then `kill -9 <PID>` (or use a different `PORT` in `.env`).
- Windows: `netstat -ano | findstr :5000` then `taskkill /PID <PID> /F`.

**"Missing environment variables" / server crashes on start**
- Double check `server/.env` exists (not just `.env.example`) and `MONGO_URI` / `JWT_SECRET` are set.

**npm install errors**
- Delete `node_modules` and `package-lock.json` in the affected folder (`client/` or `server/`)
  and re-run `npm install`.
- Make sure you're on Node 18+ (`node -v`).

**Cloudinary upload errors**
- Confirm `USE_CLOUDINARY=true` and all three Cloudinary env vars are set correctly.
- Check the file is under the 15MB limit and an allowed type (see `server/src/middleware/upload.js`).

**Authentication errors ("Not authorized")**
- Your JWT may have expired (default 7 days) — log out and back in.
- If you changed `JWT_SECRET` after users already had tokens, all existing tokens become invalid —
  that's expected.

---

## 11. Production build & deployment

Build the frontend:
```bash
cd client
npm run build
```
This outputs static files to `client/dist/`.

**Recommended deployment targets:**
- **Frontend:** Vercel or Netlify (serve `client/dist`, or use their Vite preset)
- **Backend:** Render or Railway (Node web service running `server/src/server.js`)
- **Database:** MongoDB Atlas (already cloud-hosted)
- **File storage:** Cloudinary (recommended for production — see §7; a server's local disk
  on most PaaS platforms is not persistent across deploys)

In production, set the same environment variables as `server/.env.example` on your hosting
provider's dashboard (never commit real values), update `CLIENT_URL` on the backend to your
deployed frontend URL, and point the frontend's API base URL (`client/src/services/api.js`,
`client/.env` → `VITE_API_URL` / `VITE_SOCKET_URL`) at your backend's public URL.

---

## 12. Security notes

- Passwords are hashed with bcrypt (10 salt rounds) — never stored in plain text.
- JWTs are signed with `JWT_SECRET` and expire (`JWT_EXPIRES_IN`, default 7 days).
- Every conversation/message/chat-settings route checks the requesting user is actually a member
  (and, for admin-only actions, actually an admin) server-side before doing anything — never
  trusting a frontend-only permission check.
- Blocking is enforced in the Socket.IO message handler itself, not just hidden in the UI.
- File uploads are restricted by MIME type and capped at 15MB.
- No secrets are committed — `.env` is gitignored, only `.env.example` (with placeholders) ships.

---

## 13. Features checklist

| Feature | Status |
|---|---|
| Register / Login / Logout, JWT auth | ✅ |
| Forgot/reset password (token returned directly, no email) | ✅ (simplified) |
| Private 1:1 chat, group chat (create/add/remove/admin/leave) | ✅ |
| Real-time messaging via Socket.IO | ✅ |
| Sent / delivered / seen message states | ✅ |
| Typing indicators (incl. multi-user in groups) | ✅ |
| Online/offline presence + last seen (privacy-aware) | ✅ |
| Reply, edit, delete-for-me, delete-for-everyone | ✅ |
| Reactions | ✅ |
| Message info (sent/delivered/seen detail) | ✅ |
| Unread counts, unread separator, "new messages" jump button | ✅ |
| In-conversation message search | ✅ |
| Pin/unpin messages, pinned-messages bar | ✅ |
| Image preview-before-send, file sharing, drag & drop | ✅ |
| Voice messages (record/cancel/send/playback) | ✅ |
| Shared Media/Files/Links | ✅ |
| Pin/archive/mute chats, clear chat | ✅ |
| Per-chat custom wallpaper | ✅ |
| Block/unblock (server-enforced) | ✅ |
| Full profile (bio, status, avatar, privacy controls) | ✅ |
| Browser notifications (mute/block/focus aware) | ✅ |
| Mobile responsive incl. bottom-sheet emoji picker | ✅ |
| 4 animated dark themes | ✅ |
| Light mode | ❌ not built |
| Voice/video calling | ❌ not built (voice *messages* are) |

---

Built as a complete, runnable full-stack project — not a mockup.
