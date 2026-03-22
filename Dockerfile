# Stage 1: Build frontend
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache pandoc texlive texlive-xetex texmf-dist-fontsextra texmf-dist-latexextra git font-noto
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY server/ server/
COPY shared/ shared/
COPY scripts/ scripts/
COPY app/src/help/ app/src/help/
COPY --from=build /app/dist dist/
COPY --from=build /app/dist-admin dist-admin/

ENV PORT=3001
ENV DATA_DIR=/app/data
ENV LOG_DIR=/app/logs
ENV LOG_LEVEL=error

RUN mkdir -p /app/logs

EXPOSE ${PORT}
CMD ["node", "server/index.js"]
