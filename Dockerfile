FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
USER node
CMD ["node", "server/index.mjs"]
