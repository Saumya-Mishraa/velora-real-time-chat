# ✨ Velora — Real-Time Chat & Social Communication Platform

<p align="center">
  <strong>Conversations, in real time.</strong>
</p>

<p align="center">
  A modern full-stack communication platform built for fast, interactive and responsive messaging across desktop and mobile devices.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Express.js-4-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-8-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

---

## 🌌 About Velora

**Velora** is a full-stack real-time chat and social communication platform designed to provide a smooth and engaging messaging experience.

It combines a modern **React frontend** with a **Node.js + Express backend**, **MongoDB** for persistent data, and **Socket.IO** for real-time communication.

The platform supports private conversations, group chats, media sharing, voice messages, message reactions, profile management, privacy controls, browser notifications and multiple visual themes.

> **Built as a complete runnable application — not just a UI mockup.**

---

## 🚀 Highlights

| 💬 Real-Time Messaging           | 👥 Group Conversations           |
| -------------------------------- | -------------------------------- |
| Instant messaging with Socket.IO | Create groups and manage members |
| Sent / delivered / seen states   | Admin & member controls          |
| Typing indicators                | Group descriptions & avatars     |
| Replies & reactions              | Add / remove members             |

| 📎 Media Sharing             | 🎨 Personalization          |
| ---------------------------- | --------------------------- |
| Images & files               | 4 animated dark themes      |
| Voice messages               | Custom chat wallpapers      |
| Drag & drop uploads          | Responsive mobile interface |
| Shared media / files / links | Smooth UI animations        |

---

## ✨ Features

### 💬 Messaging

* Real-time 1-to-1 messaging
* Real-time group messaging
* Sent, delivered and seen message states
* Typing indicators
* Online / offline presence
* Last-seen information
* Message replies with quoted previews
* Edit sent text messages
* Delete messages for yourself or everyone
* Emoji reactions
* Message information
* Unread message counters
* Unread separator
* New-message jump button
* In-conversation message search
* Pin / unpin messages
* Pinned messages section

### 👥 Chat & Contact Management

* Create private conversations
* Create group conversations
* Add / remove group members
* Promote / demote group admins
* Leave groups
* Pin chats
* Archive chats
* Mute conversations
* Clear chat history for the current user
* Block / unblock users
* Custom wallpaper for individual conversations

### 📎 Media & File Sharing

* Image sharing with preview before sending
* File sharing
* PDF, Office, ZIP and text file support
* Drag & drop file uploads on desktop
* Voice message recording
* Voice message playback
* Recording timer
* Cancel recording
* Shared Media / Files / Links sections

### 👤 Profile & Privacy

* Editable profile name
* Username
* Bio
* Profile picture
* Custom status message
* Last-seen privacy
* Online-status privacy
* Profile-picture privacy
* Messaging privacy
* Blocked users management

### 🔔 Notifications

Velora uses the browser's Notification API to provide message notifications while respecting:

* Conversation mute settings
* Blocked users
* Current active conversation
* Browser permissions

### 🎨 Themes & UI

Velora includes four premium dark themes:

* 🌋 **Nebula Ember**
* 🌸 **Sakura Dream**
* 🌊 **Ocean Pulse**
* 🌌 **Midnight Aurora**

The application also includes:

* Responsive desktop / tablet / mobile UI
* Mobile single-pane navigation
* Mobile-friendly emoji picker
* Safe-area support
* Smooth Framer Motion animations
* Custom chat wallpapers
* Code-split emoji picker loading

---

## 🛠️ Tech Stack

### Frontend

* React 18
* Vite
* Tailwind CSS
* Framer Motion
* Lucide React
* Axios
* Socket.IO Client
* React Router

### Backend

* Node.js
* Express.js
* Socket.IO
* Mongoose
* JWT Authentication
* bcryptjs
* Multer

### Database & Storage

* MongoDB
* MongoDB Atlas
* Local file storage
* Optional Cloudinary integration

---

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │       User          │
                    │ Desktop / Mobile    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   React Frontend    │
                    │ Vite + Tailwind CSS │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        ┌────────────────┐          ┌────────────────┐
        │   REST API     │          │   Socket.IO    │
        │ Axios / JWT    │          │ Real-time Data │
        └───────┬────────┘          └────────┬───────┘
                │                            │
                └─────────────┬──────────────┘
                              ▼
                    ┌─────────────────────┐
                    │ Node + Express      │
                    │ Application Server  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      MongoDB         │
                    │ Persistent Storage   │
                    └─────────────────────┘
```

---

## 📁 Project Structure

```text
velora/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   └── services/
│   │
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── models/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── socket/
│   │
│   ├── .env.example
│   └── package.json
│
├── .gitignore
├── .env.example
└── package.json
```

---

## ⚙️ Getting Started

### Prerequisites

Make sure you have:

* **Node.js 18+**
* **MongoDB / MongoDB Atlas**
* Git
* A modern web browser

Cloudinary is optional for cloud-based media storage.

### 1. Clone the repository

```bash
git clone https://github.com/Saumya-Mishraa/velora-real-time-chat.git

cd velora-real-time-chat
```

### 2. Install dependencies

```bash
npm install
npm run install:all
```

### 3. Configure environment variables

Create:

```text
server/.env
```

Add your environment configuration:

```env
PORT=5000
NODE_ENV=development

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d

CLIENT_URL=http://localhost:5173

USE_CLOUDINARY=false
```

If using Cloudinary:

```env
USE_CLOUDINARY=true
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> ⚠️ Never commit your `.env` file or real API credentials to GitHub.

### 4. Start the application

From the project root:

```bash
npm run dev
```

This starts:

```text
Frontend → http://localhost:5173
Backend  → http://localhost:5000
```

Backend health check:

```text
http://localhost:5000/api/health
```

---

## 🧪 Testing

Velora's backend source files can be syntax-checked and the frontend can be production-built using Vite.

For a complete manual test, use two separate accounts/browser windows and verify:

* Real-time message delivery
* Delivered / seen states
* Typing indicators
* Online / offline presence
* Message replies
* Editing and deletion
* Emoji reactions
* Voice messages
* Image uploads
* File sharing
* Group management
* Chat pinning / archiving / muting
* User blocking
* Search
* Responsive mobile layouts

---

## 🔐 Security

Velora implements several server-side security mechanisms:

* Password hashing using bcrypt
* JWT-based authentication
* Protected API routes
* Server-side conversation membership checks
* Admin authorization for group actions
* Server-enforced user blocking
* Upload type and size restrictions
* Environment variables for secrets
* `.env` excluded through `.gitignore`

---

## 📱 Responsive Design

Velora is designed to work across:

```text
Desktop
   ↓
Tablet
   ↓
Mobile
```

The mobile experience includes:

* Single-pane chat navigation
* Responsive message composer
* Mobile-friendly emoji picker
* Safe-area support
* Responsive modals
* No intentional horizontal overflow
* Touch-friendly controls

---

## ☁️ Deployment

A recommended production architecture is:

```text
Frontend
   │
   └── Vercel / Netlify

Backend
   │
   └── Render / Railway

Database
   │
   └── MongoDB Atlas

Media Storage
   │
   └── Cloudinary
```

For production deployments, configure the appropriate environment variables on the hosting platform rather than committing them to the repository.

---

## 📊 Feature Checklist

| Feature                   |   Status   |
| ------------------------- | :--------: |
| User Registration / Login |      ✅     |
| JWT Authentication        |      ✅     |
| Private Chat              |      ✅     |
| Group Chat                |      ✅     |
| Real-Time Messaging       |      ✅     |
| Sent / Delivered / Seen   |      ✅     |
| Typing Indicators         |      ✅     |
| Online / Offline Presence |      ✅     |
| Message Replies           |      ✅     |
| Message Editing           |      ✅     |
| Delete for Me / Everyone  |      ✅     |
| Emoji Reactions           |      ✅     |
| Message Search            |      ✅     |
| Message Pinning           |      ✅     |
| Image Sharing             |      ✅     |
| File Sharing              |      ✅     |
| Voice Messages            |      ✅     |
| Chat Pin / Archive / Mute |      ✅     |
| Custom Wallpapers         |      ✅     |
| User Blocking             |      ✅     |
| Profile Management        |      ✅     |
| Privacy Controls          |      ✅     |
| Browser Notifications     |      ✅     |
| Responsive UI             |      ✅     |
| Animated Dark Themes      |      ✅     |
| Cloudinary Support        | ✅ Optional |
| Light Mode                |      ⏳     |
| Voice / Video Calling     |      ⏳     |

---

## 🔮 Future Scope

Possible future improvements include:

* 📞 Voice and video calling
* 🌤️ Light theme
* 📧 Real email-based password recovery
* 🔔 Advanced notification preferences
* 🔒 Additional security hardening
* ☁️ Improved production media infrastructure
* 📈 Advanced analytics and usage insights
* 🧑‍🤝‍🧑 Larger-scale group communication support

---

## 🎯 Project Goals

Velora was developed with the following goals:

1. Build a real-world full-stack communication application.
2. Implement real-time communication using WebSockets.
3. Provide a responsive experience across devices.
4. Practice secure authentication and authorization.
5. Work with persistent NoSQL data using MongoDB.
6. Build reusable and maintainable React components.
7. Create a modern and polished user interface.

---

## 👩‍💻 Author

### Saumya Mishra

**Full-Stack Development Project**

Connect. Chat. Communicate. ✨

**React • Node.js • Express • MongoDB • Socket.IO**

---

## ⭐ Support

If you find Velora interesting, consider giving the repository a ⭐ on GitHub.

It helps support the project and future improvements.

---

<p align="center">
  <strong>Velora</strong>
  <br />
  Conversations, in real time.
</p>
