ARG BUILD_FROM=node:22-bookworm-slim
FROM ${BUILD_FROM} AS source
WORKDIR /src
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth=1 https://github.com/montaque22/AI-Email-Labeling-App.git .

FROM source AS deps
WORKDIR /src
RUN npm ci

FROM deps AS build
WORKDIR /src
RUN npm run build

FROM ${BUILD_FROM}
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=source /src/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /src/dist ./dist
COPY --from=build /src/server ./server
COPY --from=build /src/prisma ./prisma
COPY run.sh /run.sh
RUN chmod a+x /run.sh
EXPOSE 3000
CMD ["/run.sh"]
