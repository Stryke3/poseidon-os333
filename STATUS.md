# POSEIDON Status

Last updated: 2026-04-18

## Deployment posture

- Canonical production target is now DigitalOcean droplet + docker compose + nginx.
- DO cutover scripts:
  - `scripts/do_big_bang_cutover.sh` (deploys stack to droplet over ssh/rsync)
  - `scripts/audit_no_render_pointers.sh` (fails if DNS or headers still indicate Render)
- Hardening/runbook updated in `PRODUCTION_HARDENING.md`.

## Current external state (last audit run)

- `api.strykefox.com` still resolves through `*.onrender.com` and returns 503.
- `dashboard.strykefox.com` still resolves through `*.onrender.com` and returns `rndr-id` header.
- `trident/intake/ml` return 502 through Cloudflare.
- `edi.strykefox.com` has no DNS record.

## Blocker to full live cutover from this workstation

- Non-interactive ssh to `root@157.230.145.247` fails (`Permission denied (publickey,password)`), so automated deployment script cannot execute here until key access is granted.