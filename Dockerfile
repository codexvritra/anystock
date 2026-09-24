# Game API (server/). The web app is deployed separately (Vercel) and proxies /api here.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
# only the server workspace's dependencies; tsx runs the TypeScript directly
RUN npm ci --workspace server --include=dev --no-audit --no-fund
COPY shared shared
COPY server server
WORKDIR /app/server
ENV DB_PATH=/data/streetstock.db HOST=0.0.0.0
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
