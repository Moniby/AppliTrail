# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b AS runtime

ARG APPLITRAIL_RELEASE=container
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    APPLITRAIL_DATA_DIR=/data \
    APPLITRAIL_RELEASE=${APPLITRAIL_RELEASE}

RUN groupadd --gid 10001 applitrail \
    && useradd --uid 10001 --gid applitrail --shell /usr/sbin/nologin --create-home applitrail

WORKDIR /app
COPY --from=build --chown=applitrail:applitrail /app/dist/standalone/ ./
RUN mkdir -p /data && chown applitrail:applitrail /data

USER applitrail
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
