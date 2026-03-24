FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production=false
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:24-alpine

WORKDIR /app
RUN addgroup -S jarvis && adduser -S jarvis -G jarvis

COPY package.json package-lock.json* ./
RUN npm ci --production && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY openapi.yaml ./

USER jarvis

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server.js"]
