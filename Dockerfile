FROM node:18-alpine

WORKDIR /app

# Копируем зависимости отдельно для кэширования слоёв
COPY package*.json ./
RUN npm ci --omit=dev

# Копируем исходники
COPY server.js ./
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
