# ---------------------------------------------------- dependencias de producao
# Sem modulo nativo desde que o banco virou Postgres: o driver pg e JavaScript
# puro, entao esta etapa nao precisa de compilador nenhum.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --include-workspace-root \
 && npm cache clean --force

# ------------------------------------------------------- compilacao do frontend
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root
COPY web ./web
RUN npm run build

# ---------------------------------------------------------------- imagem final
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
EXPOSE 3000
# Os dados vivem no Postgres (DATABASE_URL), fora do container: subir uma imagem
# nova, reiniciar ou dormir nao perde conta nem lista.
CMD ["node", "server/src/index.js"]
