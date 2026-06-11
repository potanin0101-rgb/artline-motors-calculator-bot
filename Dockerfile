FROM node:20-bookworm-slim

WORKDIR /app

ENV DATA_DIR=/app/data

RUN mkdir -p /app/data \
  && chmod 777 /app/data \
  && chown -R 1000:1000 /app/data || true

RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'mkdir -p /app/data' \
  'chmod 777 /app/data' \
  'chown -R $(id -u):$(id -g) /app/data 2>/dev/null || true' \
  'exec "$@"' \
  > /usr/local/bin/entrypoint.sh \
  && chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

COPY package*.json ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm ci --only=production || npm install --only=production

RUN npx playwright install --with-deps chromium

RUN npm cache clean --force || true

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
