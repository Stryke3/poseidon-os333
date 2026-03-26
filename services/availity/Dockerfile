FROM node:22.14.0-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:22.14.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json package-lock.json ./
EXPOSE 8005
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8005/live || exit 1
CMD ["sh", "-c", "set -e; npx prisma migrate deploy || { \
  npx prisma migrate resolve --applied 001_availity_tables || true; \
  npx prisma migrate resolve --applied 002_availity_cuid_datetime || true; \
  npx prisma migrate resolve --applied 003_prior_auth_packets || true; \
  npx prisma migrate resolve --applied 004_prior_auth_packet_document_models || true; \
  npx prisma migrate resolve --applied 005_payer_behavior_engine || true; \
  npx prisma migrate resolve --applied 006_payer_behavior_schema_v2 || true; \
  npx prisma migrate resolve --applied 007_prior_auth_payer_score_snapshot_link || true; \
  npx prisma migrate resolve --applied 008_payer_playbooks || true; \
  npx prisma migrate resolve --applied 009_playbook_model_simplify || true; \
  npx prisma migrate resolve --applied 010_playbook_execution_optional_playbook || true; \
  npx prisma migrate resolve --applied 011_governance_layer || true; \
  npx prisma migrate resolve --applied 012_governance_drafts || true; \
  npx prisma migrate resolve --applied 013_governance_models_v2 || true; \
  npx prisma migrate resolve --applied 014_payer_manual_content_fingerprint || true; \
  npx prisma migrate resolve --applied 015_manual_requirement_review || true; \
  npx prisma migrate resolve --applied 016_pre_submit_validation_results || true; \
  npx prisma migrate resolve --applied 017_pre_submit_validation_results_nullable_packet_id || true; \
  npx prisma migrate resolve --applied 018_denial_automation_engine || true; \
  npx prisma migrate deploy; \
}; exec node dist/index.js"]
