FROM node:22-slim
# Install openssl for Prisma
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -sf http://localhost:5000/api/health || exit 1

RUN chmod +x entrypoint.sh
CMD ["sh", "entrypoint.sh"]
