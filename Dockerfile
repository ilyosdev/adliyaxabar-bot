######### Build #########
FROM node:lts-alpine as build
WORKDIR /home/app/
COPY . .
RUN yarn install --silent && yarn build

######### Production #########
FROM node:lts-alpine
COPY --from=build /home/app/package.json package.json
COPY --from=build /home/app/dist ./dist
COPY --from=build /home/app/node_modules node_modules
EXPOSE 3000
CMD ["node", "dist/run.js"]
