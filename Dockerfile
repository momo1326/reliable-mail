FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Copy non-TypeScript files to dist directory
RUN cp src/db/schema.sql dist/db/

EXPOSE 3000

CMD ["npm", "start"]