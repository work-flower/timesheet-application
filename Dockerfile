# Stage 1: Build frontend
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont git
WORKDIR /app
COPY package.json package-lock.json* ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN npm ci --omit=dev
# Alpine (musl) cannot load onnxruntime-node's glibc-linked native binding
# (and the gcompat shim segfaults at import), so force @xenova/transformers
# onto the pure-WASM onnxruntime-web backend: stub the nested native package
# and patch the hardcoded under-Node backend chooser. Single-threaded WASM is
# configured in server/services/embeddingService.js (numThreads=1 — Node
# cannot spawn ort-web's blob: workers). The trailing grep fails the BUILD
# loudly if a package update ever changes the chooser line.
RUN STUB=node_modules/@xenova/transformers/node_modules/onnxruntime-node \
 && rm -rf "$STUB" && mkdir -p "$STUB" \
 && printf '{"name":"onnxruntime-node","version":"0.0.0-wasm-stub","main":"index.js"}' > "$STUB/package.json" \
 && printf 'module.exports = require("onnxruntime-web");\n' > "$STUB/index.js" \
 && sed -i 's/typeof process !== .undefined. && process?.release?.name === .node./false/' node_modules/@xenova/transformers/src/backends/onnx.js \
 && grep -q "if (false)" node_modules/@xenova/transformers/src/backends/onnx.js
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

RUN mkdir -p /app/logs /app/data

EXPOSE ${PORT}
CMD ["node", "server/index.js"]
