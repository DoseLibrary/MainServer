FROM oven/bun:1.3.10-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.10-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg \
  && addgroup -S dose \
  && adduser -S dose -G dose \
  && mkdir -p /config /transcode \
  && chown -R dose:dose /app /config /transcode
COPY --from=build --chown=dose:dose /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build --chown=dose:dose /app/dist ./dist
COPY --from=build --chown=dose:dose /app/drizzle ./drizzle
COPY --from=build --chown=dose:dose /app/src/server ./src/server
USER dose
EXPOSE 3000
CMD ["sh", "-c", "bun src/server/migrate.ts && exec bun src/server/index.ts"]
