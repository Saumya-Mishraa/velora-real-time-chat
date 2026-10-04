# ✦ Velora

### **Conversations, in real time.**

A full-stack real-time communication platform: instant messaging, group chats, voice and video calls, disappearing Status updates, and shared Moments. It runs in the browser on desktop, tablet and mobile.

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 5" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 18+" />
  <img src="https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 4" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.IO 4" />
  <img src="https://img.shields.io/badge/MongoDB-Mongoose_8-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 3" />
  <img src="https://img.shields.io/badge/WebRTC-calls-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
</p>

---

## ✨ Overview

Velora combines a React single-page app with a Node.js/Express API, MongoDB for persistence and Socket.IO for real-time events. Audio and video calls run peer-to-peer over WebRTC.

### Main areas

| Area          | What it does                                                              |
| ------------- | ------------------------------------------------------------------------- |
| 💬 **Chats**  | 1:1 and group messaging with replies, reactions, media and voice messages |
| 🟣 **Status** | Text, photo or video updates that disappear after 24 hours                |
| ✨ **Moments** | Shared collections of photos, videos and written memories                 |
| 📞 **Calls**  | One-to-one voice and video calls with call history                        |

---

# 🚀 Features

### 💬 Messaging

* Real-time 1:1 and group chat
* Sent, delivered and seen states
* Typing indicators and online/offline presence
* Replies, editing and message deletion
* Emoji reactions
* Message search and pinning
* Unread counters
* Browser notifications

### 👥 Chat & Groups

* Private chats and groups
* Group admins and member management
* Pin, archive and mute chats
* Custom chat wallpapers
* Block and unblock users

### 🖼️ Media & Files

* Image, video and file sharing
* Image previews and lightbox
* Drag & drop and clipboard paste
* Voice messages with recording controls

### 🟣 Status

* Text, photo and video updates
* Audience controls
* Automatic 24-hour expiry
* Status viewer and replies

### ✨ Moments

* Create and share Moments
* Add photos, videos and written memories
* Custom cover photos
* Share Moments into chats

### 📞 Voice & Video Calls

* One-to-one voice and video calls
* Mute and camera controls
* Front/back camera switching
* Minimize calls while chatting
* Call history and missed calls
* WebRTC with optional TURN support

### 🎨 Profile & Appearance

* Editable profile, bio and avatar
* Privacy controls
* Blocked users list
* Four dark themes:

  * **Nebula Ember**
  * **Sakura Dream**
  * **Ocean Pulse**
  * **Midnight Aurora**

### 📱 Responsive Design

* Desktop, tablet and mobile support
* Mobile-friendly navigation
* Safe-area support
* Responsive emoji picker

---

# 🛠️ Tech Stack

**Frontend**

React 18 · Vite 5 · Tailwind CSS 3 · Framer Motion · React Router · Axios · Socket.IO Client

**Backend**

Node.js · Express 4 · Socket.IO 4 · Mongoose 8 · JWT · bcryptjs · Multer

**Database & Storage**

MongoDB · MongoDB Atlas · Cloudinary

**Real-time Communication**

Socket.IO · WebRTC · STUN / TURN

---

# 🏗️ Architecture

```text
        ┌─────────────────────┐
        │    React + Vite     │
        │ Chats · Status      │
        │ Moments · Calls     │
        └──────────┬──────────┘
                   │
             REST + Socket.IO
                   │
        ┌──────────▼──────────┐
        │  Node.js + Express  │
        │     Socket.IO       │
        └──────────┬──────────┘
                   │
              ┌────▼────┐
              │ MongoDB │
              └─────────┘

       Voice / Video → WebRTC
       Media Storage → Cloudinary
```

---

# 📁 Project Structure

```text
velora/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│
├── server/                 # Express + Socket.IO backend
│   └── src/
│       ├── config/
│       ├── models/
│       ├── controllers/
│       ├── routes/
│       ├── middleware/
│       ├── socket/
│       └── utils/
│
├── package.json
└── .env.example
```

---

# ⚡ Getting Started

### Prerequisites

* Node.js 18 or later
* MongoDB local instance or MongoDB Atlas
* Modern browser
* Optional: Cloudinary account

### 1. Clone

```bash
git clone https://github.com/Saumya-Mishraa/velora-real-time-chat.git
cd velora-real-time-chat
```

### 2. Install

```bash
npm install
npm run install:all
```

### 3. Configure

Create `server/.env`:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
CLIENT_URL=http://localhost:5173
```

### 4. Run

```bash
npm run dev
```

| Service      | URL                                |
| ------------ | ---------------------------------- |
| Frontend     | `http://localhost:5173`            |
| Backend      | `http://localhost:5000`            |
| Health Check | `http://localhost:5000/api/health` |

---

# 📜 Scripts

| Command               | Purpose                  |
| --------------------- | ------------------------ |
| `npm run dev`         | Run frontend and backend |
| `npm run server`      | Run backend              |
| `npm run client`      | Run frontend             |
| `npm run build`       | Build frontend           |
| `npm run install:all` | Install all dependencies |

---

# ☁️ Deployment

Velora can be deployed using:

| Part     | Platform         |
| -------- | ---------------- |
| Frontend | Vercel / Netlify |
| Backend  | Render / Railway |
| Database | MongoDB Atlas    |
| Media    | Cloudinary       |

> For production deployments, Cloudinary is recommended for persistent media storage.

---

# 📊 Feature Status

| Feature              | Status     |
| -------------------- | ---------- |
| Registration & Login | ✅          |
| Private & Group Chat | ✅          |
| Real-time Messaging  | ✅          |
| Typing & Presence    | ✅          |
| Replies & Reactions  | ✅          |
| Media & File Sharing | ✅          |
| Voice Messages       | ✅          |
| Voice & Video Calls  | ✅          |
| Status               | ✅          |
| Moments              | ✅          |
| Profile & Privacy    | ✅          |
| Responsive Layout    | ✅          |
| Multiple Dark Themes | ✅          |
| Cloudinary Storage   | ✅ Optional |
| Group Calls          | ❌          |
| Light Mode           | ❌          |
| Automated Tests      | ❌          |

---

# 🛣️ Roadmap

* Real email-based password recovery
* Stronger REST security checks
* Rate limiting and login throttling
* Redis support for Socket.IO scaling
* Automated tests
* Light theme
* Group calls
* Infinite scroll for older messages

---

# 👩‍💻 Author

### Saumya Mishra

**Full-Stack Development Project**

**React · Node.js · Express · MongoDB · Socket.IO · WebRTC**

---

<p align="center">
  <strong>Velora</strong><br/>
  Conversations, in real time.
</p>
