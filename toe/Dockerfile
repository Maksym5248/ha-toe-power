FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 TOE_ADDON=true DATA_DIR=/data/toe
COPY --chown=node:node app/ /app/
COPY run.sh /run.sh
EXPOSE 4173
CMD ["sh", "/run.sh"]
