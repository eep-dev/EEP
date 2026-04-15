FROM node:22-alpine

# EEP repo root is the build context (see compose.yml). Paths mirror local dev under examples/eep-reference-implementation/node.
WORKDIR /app/examples/eep-reference-implementation/node

COPY examples/eep-reference-implementation/node/package.json examples/eep-reference-implementation/node/package-lock.json* ./
COPY packages/@eep-dev/gates /app/packages/@eep-dev/gates
COPY packages/@eep-dev/signer /app/packages/@eep-dev/signer

RUN npm install

COPY examples/eep-reference-implementation/node /app/examples/eep-reference-implementation/node

EXPOSE 3100

CMD ["npm", "start"]
