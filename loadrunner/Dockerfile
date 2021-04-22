FROM mcr.microsoft.com/playwright:bionic as builder

WORKDIR /builder/

COPY package.json package-lock.json ./
RUN npm install

COPY tsconfig.json .
COPY src/ src/
RUN npm run build

FROM mcr.microsoft.com/playwright:bionic as runner

USER pwuser
WORKDIR /home/pwuser/runner/
COPY --from=builder /builder/package.json /builder/package-lock.json ./

USER root
RUN npm ci

USER pwuser
COPY --from=builder /builder/built/ built/

VOLUME [ "/home/pwuser/runner/errors" ]

CMD ["node", "built/main.js"]
