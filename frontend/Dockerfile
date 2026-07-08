FROM node:22-alpine AS build

WORKDIR /app/frontend

ARG EXPO_PUBLIC_BACKEND_URL=""
ARG EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ENV EXPO_PUBLIC_BACKEND_URL=${EXPO_PUBLIC_BACKEND_URL}
ENV EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY}

COPY package.json ./
RUN corepack enable \
    && yarn install --non-interactive

COPY . .
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
