# Stage 1: Build the React client
FROM node:22-slim AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Stage 2: Nginx reverse proxy + static files
FROM nginx:1.25-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy the built React SPA so nginx can serve it
COPY --from=client-builder /client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
