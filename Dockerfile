FROM node:20-alpine AS build

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY backend/package.json ./

# Prisma client needs these at runtime for migrate + query
RUN npm install -g prisma@^6.0.0
RUN npm install -g tsx@^4.0.0

EXPOSE 3000

# Google OAuth config is already seeded in DB, so seed script gracefully skips
# when GOOGLE_CLIENT_ID is empty — no crash either way
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/scripts/seed-google-config-if-present.ts && node dist/server.js"]
