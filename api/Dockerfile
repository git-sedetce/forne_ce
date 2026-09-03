FROM node:20-bookworm-slim

# Diretório da aplicação dentro do container
WORKDIR /app

# Evita executar o Node em modo de desenvolvimento
ENV NODE_ENV=production

# Copia primeiro os arquivos de dependências.
# Isso aproveita o cache do Docker.
COPY package.json package-lock.json ./

# Instala exatamente as versões do package-lock.json.
# Mantemos o sequelize-cli disponível para migrations.
RUN npm ci

# Copia o restante da API
COPY . .

# Porta utilizada pela API
EXPOSE 3108

# Inicializa a aplicação
CMD ["npm", "start"]