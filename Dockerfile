# Turfly production image (Next.js standalone server).
#   docker build -t turfly .
# Stages: deps (npm ci) → build (prisma generate + next build) → run (small runtime, non-root user).
# The "build" stage keeps the full toolchain and is also used by docker-compose for migrations and seeding.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd -r turfly && useradd -r -g turfly -u 1001 turfly
COPY --from=build --chown=turfly:turfly /app/.next/standalone ./
COPY --from=build --chown=turfly:turfly /app/.next/static ./.next/static
COPY --from=build --chown=turfly:turfly /app/public ./public
# Prisma query engine for this platform (traced files may miss the native engine)
COPY --from=build --chown=turfly:turfly /app/node_modules/.prisma ./node_modules/.prisma
USER turfly
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
