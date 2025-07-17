######### Build #########
FROM node:lts-alpine AS build
RUN apk update && apk add --no-cache openssl1.1-compat libc6-compat
WORKDIR /home/app/
COPY . .
RUN yarn install --silent && yarn build

FROM node:lts-alpine
RUN apk update && apk add --no-cache openssl1.1-compat libc6-compat
COPY --from=build /home/app/package.json package.json
COPY --from=build /home/app/dist ./dist
COPY --from=build /home/app/node_modules node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
