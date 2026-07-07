# ShadowPaste V8 runtime server image.
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install server deps (packages/ is imported directly, no build step)
COPY server/package.json server/package.json
RUN cd server && npm install --omit=dev

# App source
COPY packages ./packages
COPY server ./server

# Drop root
RUN addgroup -S sp && adduser -S sp -G sp
USER sp

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
WORKDIR /app/server
CMD ["node", "server.mjs"]
