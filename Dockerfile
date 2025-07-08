# Dockerfile
FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN bash scripts/ensure-opa-wasm.sh

RUN npm run build

CMD ["node", "dist/index.js"]

