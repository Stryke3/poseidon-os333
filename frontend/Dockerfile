FROM node:20.20.1-alpine3.23 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20.20.1-alpine3.23 AS builder
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_AVAILITY_SERVICE_URL=/availity-api
ENV NEXT_PUBLIC_AVAILITY_SERVICE_URL=${NEXT_PUBLIC_AVAILITY_SERVICE_URL}
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
