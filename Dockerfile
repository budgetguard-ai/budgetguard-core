FROM node:20-bullseye

WORKDIR /app

# Install system dependencies including OPA
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install OPA CLI
RUN OPA_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/opa/releases/latest | grep tag_name | cut -d '"' -f 4) && \
    curl -L -o opa https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static && \
    chmod +x opa && \
    mv opa /usr/local/bin/opa && \
    opa version

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate

# Build OPA policy
RUN bash scripts/ensure-opa-wasm.sh

RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]