FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
COPY --chown=node:node app/ /app/
USER node
EXPOSE 4173
CMD ["node", "server.mjs"]
