FROM node:20-bullseye
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
EXPOSE ${VITE_PORT}
CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port $VITE_PORT"]
