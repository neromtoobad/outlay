# Syncly on Railway: one container runs the API (server/, internal :8790) and the site (web/, public $PORT).
# Live books sit on a volume (OUTLAY_DATA=/data). The agents' mnemonic comes from OUTLAY_MNEMONIC.
FROM node:24-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci

COPY . .
ENV OUTLAY_API_URL=http://127.0.0.1:8790
RUN cd web && npm run build

ENV NODE_ENV=production
CMD ["bash", "start.sh"]
