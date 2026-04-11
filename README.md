# Gramiphy

Gramiphy is a self-hosted web app for building a music library (including tracks sourced from YouTube URLs), managing playlists (with collaboration and pinning), and exporting **mixes** as MP3 files stored in S3. It uses accounts with role-based access and an admin area for user management.

## Features

- **Library** — Add and browse tracks; server-side download pipeline (requires `yt-dlp`).
- **Playlists** — Create playlists, invite collaborators, pin playlists in the sidebar.
- **Mixes** — Combine tracks into a single audio file (requires `ffmpeg`); optional expiry and cleanup.
- **Authentication** — Email and password; optional **Discord** OAuth when credentials are configured.
- **Roles** — `visitor`, `user`, `dj`, and `admin` (see [User roles](#user-roles) for self-hosting).

## Prerequisites

- **Node.js** 20 or newer (LTS recommended)
- **PostgreSQL**
- **AWS S3** — Bucket and IAM credentials for storing audio assets
- **`yt-dlp`** — On the `PATH` of the machine running the Next.js server (used for track downloads)
- **`ffmpeg`** — On the `PATH` (used when exporting mixes)

## Installation

1. Clone the repository and install dependencies:

   ```bash
   git clone <repository-url>
   cd lawless-gramiphy
   npm install
   ```

   You can use `pnpm` or `yarn` instead if you prefer.

2. Copy the environment template and fill in the values:

   ```bash
   cp .env.example .env
   ```

   See [Environment variables](#environment-variables) for the essentials.

3. Apply database migrations:

   ```bash
   npx prisma migrate deploy
   ```

   For local development, you may use `npx prisma migrate dev` instead.

### Docker

For a container image (`Dockerfile`), `docker-compose`, and **YouTube cookies** via `YTDLP_COOKIES_PATH`, see [README.Docker.md](README.Docker.md).

## Environment variables

Copy [.env.example](.env.example) to `.env` and configure at least:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret for session signing (use a long random string) |
| `BETTER_AUTH_URL` | Public base URL of the app (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Same base URL as above (used by the client) |
| `NEXT_PUBLIC_APP_ENV` | `dev` or `prod` |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | S3 storage |
| `TRACKS_S3_PREFIX`, `MIXES_S3_PREFIX` | Optional key prefixes inside the bucket |

Optional:

- **Discord login** — `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`
- **Mix duration limit** — `NEXT_PUBLIC_MIX_DISABLE_DURATION_LIMIT` (`1` to disable limit, `0` to enforce)
- **Mix encoding** — `MIX_MP3_DEFAULT_BITRATE` (e.g. `96k`)
- **Auto visitor on sign-up** — `ACCESS_ON_CREATE` set to `true` or `1`: every new user after the first gets role **`visitor`** (library access) instead of the default **`user`**

## Running the app

**Development:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Production:**

```bash
npm run build
npm run start
```

Deploy on any host that provides Node.js, your PostgreSQL database, and the external binaries (`yt-dlp`, `ffmpeg`) on the server.

## User roles

The **first user** created on an empty database (any method: Discord OAuth, email sign-up, etc.) is automatically assigned the **`admin`** role.

Everyone after that gets the Better Auth admin plugin default role **`user`** (no “gramophone” access) unless **`ACCESS_ON_CREATE`** is set to **`true`** or **`1`** in the environment: then they are assigned **`visitor`** instead, so they can use the library without manual promotion. Otherwise, limited-access users need an admin to assign **`visitor`**, **`dj`**, or **`admin`** (e.g. from the admin UI).

## Expired mixes cleanup

If you use time-limited mixes, call the cleanup endpoint on a schedule (e.g. cron or GitHub Actions):

- **URL:** `POST /api/mixes/cleanup-expired`
- **Header:** `Authorization: Bearer <MIX_CLEANUP_CRON_SECRET>`

Set `MIX_CLEANUP_CRON_SECRET` in `.env` to the same value as the Bearer token. A sample workflow lives in [.github/workflows/mixes-cleanup-expired.yml](.github/workflows/mixes-cleanup-expired.yml).

## Tests

```bash
npm test
```

## Legal notice

You are responsible for complying with the terms of service of any platform whose content you access, and with applicable copyright law. Gramiphy and `yt-dlp` are technical tools only; how you use them is your obligation.

## License

This project is released under the [MIT License](LICENSE). You may use, change, and redistribute it freely. You must keep the copyright and permission notice from the `LICENSE` file in copies or derivatives so the original project is credited.
