FROM node:20
WORKDIR /app

RUN apt-get update && apt-get install -y \
  python3 python3-pip make g++ libc-dev build-essential python3-dev liburing-dev linux-headers-generic

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
