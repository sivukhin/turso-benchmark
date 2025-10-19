FROM node:22-bullseye AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bullseye

RUN apt update && apt install curl
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/mstange/samply/releases/download/samply-v0.13.1/samply-installer.sh | sh

WORKDIR /app

COPY server.mjs ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/.env ./
COPY package*.json ./
RUN npm ci --omit=dev

ENV PATH="/root/.cargo/bin:${PATH}"
EXPOSE 8080
CMD ["node", "server.mjs"]
