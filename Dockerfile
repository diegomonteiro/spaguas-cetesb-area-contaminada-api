FROM node:20-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public

RUN mkdir -p data/datasets uploads \
  && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http'); const port=process.env.PORT||3000; const req=http.get({host:'127.0.0.1',port,path:'/api/openapi.json',timeout:4000},res=>process.exit(res.statusCode===200?0:1)); req.on('error',()=>process.exit(1)); req.on('timeout',()=>{req.destroy(); process.exit(1);});"

CMD ["node", "src/server.js"]
