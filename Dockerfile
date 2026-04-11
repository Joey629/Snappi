# When Docker Hub is unreachable, set SNAPPI_BASE_IMAGE to a real pullable ref
# (registry host + path + tag). Use ASCII hostname/path only — no placeholder text.
# Examples (use a mirror you can reach; do not copy literally if they do not resolve):
#   export SNAPPI_BASE_IMAGE=docker.m.daocloud.io/library/node:20-alpine
#   export SNAPPI_BASE_IMAGE=mirror.gcr.io/library/node:20-alpine
ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE}
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY server.js ./
COPY lib ./lib
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
