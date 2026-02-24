FROM node:18-alpine

WORKDIR /app
COPY backend /app/backend
RUN cd backend && npm install
