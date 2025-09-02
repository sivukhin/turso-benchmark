FROM debian:bookworm-slim as cert

RUN apt update
RUN apt install -y ca-certificates
RUN update-ca-certificates

FROM golang:1.24 as builder

COPY . /app/
WORKDIR /app
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -o turso-benchmark ./


FROM debian:bookworm-slim

# Install unzip and cargo in the runtime image
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y build-essential curl
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y

COPY --from=cert /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/turso-benchmark turso-benchmark

CMD ["/bin/bash", "-l", "-c", "/turso-benchmark"]
