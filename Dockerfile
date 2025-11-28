# Stage 1: Build React Frontend
FROM node:18-alpine as frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH="${PYTHONPATH}:/app/backend"

# Install system dependencies if needed (e.g. for building some python packages)
# RUN apt-get update && apt-get install -y build-essential

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ backend/
COPY gtfs_subway/ gtfs_subway/

# Copy built frontend assets
COPY --from=frontend-build /app/frontend/dist /app/static

# Expose port
EXPOSE 8080

# Copy startup script
COPY start_prod.sh .
RUN chmod +x start_prod.sh

# Run the application using the production script
CMD ["./start_prod.sh"]
