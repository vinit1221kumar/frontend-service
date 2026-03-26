# D-Lite Frontend Service

Next.js frontend for D-Lite chat and calling features.

## Overview

This app provides:
- Email/password and Google sign-in via Firebase Auth
- Direct messaging (1:1) with recent chats, presence, media support, and message actions
- Group chat with membership management, member actions, and group photo support
- Direct audio/video calling using WebRTC + Firebase Realtime Database signaling
- Room-based video calling flow backed by Firestore signaling documents
- Optional MongoDB backup for messages through an internal API route

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- Firebase (Auth, Realtime Database, Firestore, Storage)
- MongoDB (optional message backup)
- TypeScript + JavaScript mixed codebase

## App Routes

- `/` – landing page
- `/login` – login
- `/register` – registration
- `/dashboard` – direct chat (protected)
- `/groups` – group chat (protected)
- `/call` – direct voice/video call UI (protected)
- `/video-call` – redirects to `/call` with default `mode=video`
- `/webrtc-call` – protected call page using `CallUI`
- `/health` – health endpoint (`{"status":"ok","app":"d-lite-next"}`)

## Internal API Routes

- `POST /api/message-backup`
	- Stores/updates a message backup document in MongoDB when configured.
	- Returns `202` with `skipped: true` if Mongo backup is not configured.

## Environment Variables

Create `.env.local` in the project root.

### Required for app functionality (Firebase)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
```

> Minimum required by runtime checks: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.

### Optional (Mongo backup)

```bash
NEXT_PUBLIC_MONGODB_URI=
NEXT_PUBLIC_MONGODB_DB_NAME=d_lite_backup
```

If Mongo variables are not provided, message backup requests are accepted but skipped.

## Local Development

### Prerequisites

- Node.js 20+
- npm
- Firebase project configured for:
	- Authentication (Email/Password and Google if used)
	- Realtime Database
	- Firestore
	- Storage

### Install and run

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Available Scripts

- `npm run dev` – start dev server on port 3000
- `npm run build` – production build
- `npm run start` – start production server on port 3000
- `npm run lint` – run Next.js linting

## Docker (Standalone Next.js build)

The `Dockerfile` builds Next.js in standalone mode (`output: 'standalone'`).

### Build image

```bash
docker build \
	--build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... \
	--build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
	--build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=... \
	--build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=... \
	--build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=... \
	--build-arg NEXT_PUBLIC_FIREBASE_APP_ID=... \
	--build-arg NEXT_PUBLIC_FIREBASE_DATABASE_URL=... \
	-t d-lite-frontend-service .
```

### Run container

```bash
docker run --rm -p 3000:3000 d-lite-frontend-service
```

Health check endpoint: `http://localhost:3000/health`

## Project Structure

```text
src/
	app/               # Next.js App Router pages and route handlers
	components/        # Shared UI + feature components
	context/           # React providers (theme, auth, socket)
	hooks/             # Custom hooks (auth, video call)
	lib/               # Core call/webRTC/Firebase helpers
	services/          # Firebase auth/chat/video data services
	views/             # Page-level view components
	styles/            # Global styles
	types/             # Type definitions
```

## Notes

- Protected pages use `PrivateRoute` and redirect unauthenticated users to `/login`.
- Theme preference is persisted in local storage using key `d-lite-theme`.
- Remote avatar images are allowed from `https://api.dicebear.com`.

## Troubleshooting

- **Login/registration fails immediately**: check Firebase env vars in `.env.local`.
- **Realtime chat/presence issues**: verify Realtime Database rules and URL.
- **Video signaling issues**: verify Firestore is enabled and readable/writable for your auth model.
- **Message backup not persisted**: set `NEXT_PUBLIC_MONGODB_URI` and confirm Mongo connectivity.
