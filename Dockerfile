ARG VERSION=0.0.0
FROM --platform=$BUILDPLATFORM node:22 AS uibuilder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm && corepack install -g pnpm@latest-9

WORKDIR /src
#COPY ui/package.json ui/pnpm-lock.yaml /src
#RUN pnpm fetch 

COPY ui .
RUN pnpm install && pnpm build

FROM golang:bookworm AS gobuilder
ARG VERSION
WORKDIR /src

# Cairo draws the PDF of notebooks written by firmware 3.x (v6 .rm files)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY . .
COPY --from=uibuilder /src/dist ./ui/dist
RUN go generate ./... && CGO_ENABLED=1 go build -tags cairo -ldflags "-s -w -X main.version=${VERSION}" -o rmfakecloud-docker ./cmd/rmfakecloud/

FROM debian:bookworm-slim
EXPOSE 3000

# libcairo2 is needed to run; the fonts are used for typed text in notebooks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcairo2 \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=gobuilder /src/rmfakecloud-docker /
ENTRYPOINT ["/rmfakecloud-docker"]
