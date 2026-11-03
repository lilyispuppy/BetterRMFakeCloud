FROM debian:bookworm-slim
EXPOSE 3000

# libcairo2 is needed to run; the fonts are used for typed text in notebooks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcairo2 \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

#ENV RMAPI_HWR_HMAC
#ENV RM_SMTP_SERVER=""
#ENV RM_SMTP_USERNAME=""
#ENV RM_SMTP_PASSWORD=""
COPY dist/rmfakecloud-docker .
ENTRYPOINT ["/rmfakecloud-docker"]
