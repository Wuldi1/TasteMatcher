# syntax=docker/dockerfile:1

# Build the two workspace packages needed at runtime. Keeping the build context
# at repository root makes the shared package available to the API image.
FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .nvmrc ./
COPY common/package.json common/package.json
COPY webapi/package.json webapi/package.json
RUN pnpm install --frozen-lockfile

COPY common common
COPY webapi webapi
RUN pnpm --filter @tastematcher/common build \
  && pnpm --filter @tastematcher/webapi build \
  && pnpm --filter @tastematcher/webapi --prod deploy --legacy /out

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=prd
WORKDIR /app

COPY --from=build /out ./

USER node
EXPOSE 8080

CMD ["node", "build/main.js"]
