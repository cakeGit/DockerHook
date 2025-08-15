# DockerHook Frontend (Express)

Small Express service that exposes a read-only view of a docker-compose YAML
file and a secure webhook endpoint which writes a trigger file (no SSH, no
docker control). Intended to be run on the same host as your containers (Debian)
and consumed by CI/GitHub to notify the server to update.

Quick start

1. Install dependencies:

```powershell
cd C:\GitHub\DockerHook
npm install
```

2. Copy and edit `.env.example` to `.env` and set `AUTH_TOKEN`, `COMPOSE_PATH`,
   and `TRIGGER_DIR`.

3. Start the service:

```powershell
npm start
```

Endpoints

- GET /compose — returns parsed compose as JSON with metadata (mtime, size).
- GET /compose/raw — returns raw YAML (content-type: text/yaml).
- POST /webhook — write a trigger file into `TRIGGER_DIR` (requires auth token).
  Returns 202.
- GET /health — basic health check.

Security

- Token auth: set `AUTH_TOKEN` and include header
  `Authorization: Bearer <token>` or `x-api-token: <token>` for protected
  endpoints.
- Rate limiting is enabled per-IP.

Systemd example

Save the file `systemd/dockerhook.service` as
`/etc/systemd/system/dockerhook.service` and edit paths as needed.

Watcher

This repo includes `src/watcher.js` — a simple polling watcher that consumes
`trigger_*.json` files from the `TRIGGER_DIR`, moves them into a `processing/`
folder, runs an update command (default
`docker compose pull && docker compose up -d`) and then moves the trigger into
`processed/` or `failed/`.

Configure via environment variables in the systemd unit or `.env`:

- `COMPOSE_DIR` — working directory for the update command (defaults to the
  directory containing `COMPOSE_PATH`).
- `UPDATE_CMD` — command to run when processing a trigger (defaults to
  `docker compose pull && docker compose up -d`).

Be careful: the watcher actually runs the update command, so run it under a user
with appropriate Docker permissions and test carefully.
