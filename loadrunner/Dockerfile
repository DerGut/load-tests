FROM mcr.microsoft.com/playwright:bionic as builder

WORKDIR /builder/

COPY package.json package-lock.json ./
RUN npm install

COPY tsconfig.json .
COPY src/ src/
RUN npm run build

FROM mcr.microsoft.com/playwright:bionic as runner

WORKDIR /home/pwuser/runner/

COPY --from=builder /builder/package.json /builder/package-lock.json ./
RUN npm ci

USER pwuser

COPY --from=builder /builder/built/ built/

CMD ["node", "built/main.js"]
