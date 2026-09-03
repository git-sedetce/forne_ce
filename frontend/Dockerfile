# ============================================================
# ETAPA 1 - BUILD DO ANGULAR
# ============================================================
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Localiza automaticamente a pasta que contém o index.html.
# Funciona tanto com dist/frontend quanto com dist/frontend/browser.
RUN npm run build -- --configuration production \
    && mkdir -p /app/deploy \
    && BUILD_INDEX="$(find /app/dist -type f -name index.html | head -n 1)" \
    && test -n "$BUILD_INDEX" \
    && cp -a "$(dirname "$BUILD_INDEX")/." /app/deploy/


# ============================================================
# ETAPA 2 - SERVIDOR WEB
# ============================================================
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/deploy/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
