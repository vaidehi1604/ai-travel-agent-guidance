FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps --omit=optional

COPY . .

EXPOSE 3000

CMD ["npm", "start"]