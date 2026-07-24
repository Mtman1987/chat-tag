FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG GITHUB_SHA=unknown
ARG GH_SHA=unknown
ARG BUILD_SHA=unknown
LABEL org.opencontainers.image.revision=$GITHUB_SHA
LABEL com.github.sha=$GH_SHA
LABEL app.build_sha=$BUILD_SHA
LABEL GITHUB_SHA=$GITHUB_SHA
LABEL GH_SHA=$GH_SHA
LABEL BUILD_SHA=$BUILD_SHA
RUN apk add --no-cache fontconfig ttf-dejavu
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
