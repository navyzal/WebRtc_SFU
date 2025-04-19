FROM node:20-bullseye
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
EXPOSE ${VITE_PORT}
CMD ["sh", "-c", "npm run dev -- --host --port $VITE_PORT"]
