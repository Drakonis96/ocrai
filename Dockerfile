FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first for better layer reuse.
COPY package*.json ./

# Install dependencies from the lockfile with retries to make registry fetches
# more resilient during multi-arch release builds.
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci --no-audit --fund=false

# Copy the rest of the source tree.
COPY . .

# Build the frontend assets.
RUN npm run build

# Expose the application port.
EXPOSE 5037

# Start the production server.
CMD ["npm", "start"]
