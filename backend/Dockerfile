# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: postinstall runs `prisma generate`, which needs the schema (not copied yet)
RUN npm ci --ignore-scripts && npm rebuild @prisma/engines

# ---- development: hot reload, source is bind-mounted over /app ----
FROM deps AS dev
COPY --chown=node:node . .
RUN chown node:node /app && chown -R node:node node_modules/@prisma/engines  # prisma CLI wants to write here
USER node
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev"]

# ---- build ----
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# ---- one-off migration job (needs the prisma CLI, so it lives on the full build stage) ----
FROM build AS migrate
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=peer --ignore-scripts && npm cache clean --force

# ---- production runtime ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
