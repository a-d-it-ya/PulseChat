# ==============================================================================
# Stage 1: Build C++ epoll Reactor Server
# ==============================================================================
FROM alpine:3.19 AS cpp-builder
RUN apk add --no-cache build-base cmake

WORKDIR /build
COPY CMakeLists.txt ./
COPY include/ ./include/
COPY src/ ./src/

RUN cmake -B build -S . -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --target pulsechat_reactor -j$(nproc)

# ==============================================================================
# Stage 2: Build Node.js TypeScript Gateway
# ==============================================================================
FROM node:20-alpine AS node-builder
WORKDIR /app/gateway

COPY gateway/package*.json ./
RUN npm install

COPY gateway/ ./
RUN npm run build

# ==============================================================================
# Stage 3: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runtime

# Install runtime libraries for C++ binary
RUN apk add --no-cache libstdc++

WORKDIR /app

# Copy compiled C++ server binary
COPY --from=cpp-builder /build/build/pulsechat_reactor ./build/pulsechat_reactor

# Copy built Node.js Gateway & dependencies
COPY --from=node-builder /app/gateway/node_modules ./gateway/node_modules
COPY --from=node-builder /app/gateway/dist ./gateway/dist
COPY --from=node-builder /app/gateway/package.json ./gateway/package.json
COPY gateway/data ./gateway/data

# Copy and setup entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh ./build/pulsechat_reactor

ENV NODE_ENV=production
ENV PORT=3001
ENV TCP_HOST=127.0.0.1
ENV TCP_PORT=9000

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
