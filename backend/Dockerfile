FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/taskflow.db \
    TRUST_PROXY=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
