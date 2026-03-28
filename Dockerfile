# Stage 1: Build the React frontend
FROM node:20-alpine AS build-frontend
WORKDIR /app/frontend

COPY go_app/frontend/package*.json ./
RUN npm install

COPY go_app/frontend/ ./
RUN npm run build

# Stage 2: Build the Go backend
FROM golang:1.25-alpine AS build-backend
WORKDIR /app

# Install build dependencies for CGO (sqlite3 requires CGO)
RUN apk add --no-cache build-base

COPY go_app/go.mod go_app/go.sum ./
RUN go mod download

COPY go_app/ ./
# Build the binary with CGO enabled for go-sqlite3 compatibility
RUN CGO_ENABLED=1 GOOS=linux go build -o server ./cmd/server/main.go

# Stage 3: Final lightweight image
FROM alpine:latest
WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

# Copy backend binary
COPY --from=build-backend /app/server .

# Copy built frontend statically
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

# Expose port (must match the Go server's default port)
EXPOSE 8080

# Environment variables should be injected by Koyeb at runtime, e.g.
# TURSO_DATABASE_URL=libsql://...

# Run the server
CMD ["./server"]
