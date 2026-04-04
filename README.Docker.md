# Gramiphy — Docker setup

This guide shows how to build and run Gramiphy in a container with `ffmpeg`, `yt-dlp`, and optional YouTube cookies for server-side downloads.

## YouTube cookies (`YTDLP_COOKIES_PATH`)

YouTube may block anonymous downloads. The app reads [`YTDLP_COOKIES_PATH`](.env.example) and passes it to `yt-dlp` when set.

1. In your project `.env`, **uncomment and set** `YTDLP_COOKIES_PATH` to the **path inside the container** where the cookie file will be mounted (for example the same value as in [.env.example](.env.example): `/run/secrets/youtube-cookies.txt`).
2. The file on disk must be a **Netscape HTTP Cookie File** (the format `yt-dlp` / browser export tools use for `--cookies`).
3. In **docker-compose**, mount your host cookie file to that path and keep `YTDLP_COOKIES_PATH` in sync (see the example below).

Treat this file like a secret: restrict permissions on the host. Use `:rw` only if you need the container to update the file; otherwise `:ro` is enough for read-only cookie use.

## `Dockerfile` example

The repository root is the build context (not a `www/` folder). Adjust `COPY` if your layout differs.

**Note:** `npx prisma migrate deploy` runs at **image build** time, so `DATABASE_URL` must point to a **reachable PostgreSQL** during `docker build` (same network or host URL). If your database is only available at runtime, remove that `RUN` line and run migrations when the container starts instead (e.g. small entrypoint script: `prisma migrate deploy && npm run start`).

```dockerfile
FROM node:lts AS build
WORKDIR /var/www/app

COPY . ./

RUN apt-get update && apt-get install -y ffmpeg python3 curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

RUN npm install
RUN npx prisma generate
RUN npx prisma migrate deploy

RUN npm run build

RUN ls -al
EXPOSE 3000

CMD npm run start
```

Create a [`.dockerignore`](https://docs.docker.com/build/building/context/#dockerignore-file) so the context stays small and secrets are not copied, for example:

```
node_modules
.next
.git
.env
.env.*
!.env.example
```

## `docker-compose` example

Example with service `web`, fixed container name, explicit `Dockerfile`, bind-mounted **Netscape** cookie file (`:rw` as below; switch to `:ro` if you do not need writes), and `YTDLP_COOKIES_PATH` aligned with `.env`:

```yaml
services:
  web:
    restart: unless-stopped
    container_name: gramiphy
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      YTDLP_COOKIES_PATH: /run/secrets/youtube-cookies.txt
    volumes:
      - ./secrets/youtube-cookies.txt:/run/secrets/youtube-cookies.txt:rw
```

In `.env`, use a `DATABASE_URL` that matches the Compose service name, for example:

```env
DATABASE_URL="postgresql://gramiphy:gramiphy@db:5432/gramiphy"
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
YTDLP_COOKIES_PATH=/run/secrets/youtube-cookies.txt
```

If you build the image **before** `db` exists, either build with a temporary `DATABASE_URL` and run migrations at container startup, or run `docker compose up db` first so `migrate deploy` during `docker build` can succeed.

## Run

```bash
docker compose up --build
```

Then open `http://localhost:3000` (or the host/port you published).

For roles, cleanup cron, and the rest of the configuration, see the main [README.md](README.md).
