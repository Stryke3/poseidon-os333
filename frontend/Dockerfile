FROM node:20.20.1-alpine3.23 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci

FROM node:20.20.1-alpine3.23 AS builder
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_AVAILITY_SERVICE_URL=/availity-api
ENV NEXT_PUBLIC_AVAILITY_SERVICE_URL=${NEXT_PUBLIC_AVAILITY_SERVICE_URL}
# Build-time secrets (overridden at runtime by real env vars)
ENV NEXTAUTH_SECRET=build-placeholder
ENV NEXTAUTH_URL=http://localhost:3000
ENV CORE_API_URL=http://localhost:8001
ENV TRIDENT_API_URL=http://localhost:8002
ENV INTAKE_API_URL=http://localhost:8003
ENV ML_API_URL=http://localhost:8004
ENV EDI_API_URL=http://localhost:8006
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20.20.1-alpine3.23 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
