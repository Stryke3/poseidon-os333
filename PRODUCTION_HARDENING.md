# POSEIDON - Production hardening (DigitalOcean only)

Canonical production is a single DigitalOcean droplet running the full compose stack in [`docker-compose.yml`](docker-compose.yml), with [`nginx/nginx.conf`](nginx/nginx.conf) as the only public front door.

This runbook is DO-only. No other managed-host or edge-hosted frontend paths are supported. `scripts/audit_no_render_left.sh` enforces that repo-level regression.

---

## 1. Preflight and local validation

From repo root:

```bash
bash poseidon-deploy.sh
bash scripts/verify_deploy_readiness.sh --strict-env
bash scripts/audit_no_render_left.sh
```

This validates compose syntax, pinned containers, Python syntax, and frontend production build, and confirms no Render references have regressed into tracked files.

For a single-command end-to-end cutover on a prepared droplet, use `bash scripts/do_prod_cutover_do_only.sh`.

---

## 2. Droplet bootstrap

On a new Ubuntu droplet:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Clone repo and configure environment:

```bash
sudo mkdir -p /opt/poseidon
sudo chown -R "$USER":"$USER" /opt/poseidon
git clone <your-repo-url> /opt/poseidon
cd /opt/poseidon
cp .env.template .env
```

Critical env contract for this DO shape:

- Leave `POSEIDON_DATABASE_URL` unset to use bundled compose `postgres`.
- Keep `DATABASE_URL` as host-side loopback for scripts (`127.0.0.1:5432`).
- Set production secrets (`JWT_SECRET`, `SECRET_KEY`, `NEXTAUTH_SECRET`, `INTERNAL_API_KEY`, `REDIS_PASSWORD`, `MINIO_*`).
- Set `NEXTAUTH_URL=https://dashboard.strykefox.com`.
- Set `ISA_TEST_INDICATOR=P` for production claim traffic.

---

## 3. Deploy stack on droplet

```bash
cd /opt/poseidon
docker compose up -d --build
docker compose ps
```

Health verification on droplet:

```bash
curl -fsS http://127.0.0.1:8001/ready
curl -fsS http://127.0.0.1:8002/ready
curl -fsS http://127.0.0.1:8003/ready
curl -fsS http://127.0.0.1:8004/ready
curl -fsS http://127.0.0.1:8005/live
curl -fsS http://127.0.0.1:8006/health
curl -fsS http://127.0.0.1/healthz
```

---

## 4. Big-bang DNS cutover

At DNS provider:

1. Replace all legacy managed-host CNAME targets for live POSEIDON hosts.
2. Point `api`, `dashboard`, `trident`, `intake`, `ml`, `edi` at the DigitalOcean droplet target.
3. Remove stale `availity` and `status` records if not used, or point them explicitly.
4. Keep Cloudflare proxy-mode policy consistent across all active hosts.

Post-change verification from laptop:

```bash
bash scripts/audit_no_render_pointers.sh   # DNS / HTTP check
bash scripts/audit_no_render_left.sh       # repo regression guard
```

---

## 5. Legacy managed-host shutdown

After DNS is confirmed to no longer point to the legacy host and endpoints are healthy through DO:

- Suspend or delete the legacy managed-host services for POSEIDON.
- Confirm no production hostname resolves to the legacy host (see `scripts/audit_no_render_pointers.sh`).

---

## 6. Ongoing operations

Before each release:

```bash
bash scripts/verify_deploy_readiness.sh --strict-env
```

Deploy update:

```bash
cd /opt/poseidon
git pull
docker compose up -d --build
```

Backup routines:

```bash
bash scripts/backup_postgres.sh
bash scripts/backup_stateful_storage.sh
```

Restore routines:

```bash
bash scripts/restore_postgres.sh backups/postgres/<file>.dump
bash scripts/restore_stateful_storage.sh backups/stateful/<timestamp>
```

