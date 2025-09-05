FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY .env ./.env

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
