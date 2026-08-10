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

# Google OAuth config is already seeded in DB from the previous Render deployment,
# so the seed script is skipped. If config needs to be refreshed, run:
#   npx tsx src/scripts/seed-google-config-if-present.ts
# from a pod shell, or set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI
# in TOSE env vars and the startup script will pick them up.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
