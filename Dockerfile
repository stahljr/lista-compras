# ---------------------------------------------------- dependencias de producao
# better-sqlite3 e modulo nativo: o instalador tenta baixar um binario pronto e,
# se nao existir para esta plataforma, compila -- e a node:22-slim nao vem com
# compilador. As ferramentas ficam so nesta etapa; a imagem final nao as leva.
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace server --include-workspace-root \
 && npm cache clean --force

# ------------------------------------------------------- compilacao do frontend
# Instala so o workspace do front: assim o modulo nativo nem entra aqui, e esta
# etapa dispensa compilador.
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
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
# O banco vive fora da imagem: atualizar a imagem nao perde a lista.
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
