FROM node:20-slim

# System deps for sharp
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      tzdata \
      tini \
      python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Create state dir
RUN mkdir -p /app/state
VOLUME ["/app/state"]

ENV NODE_ENV=production
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
