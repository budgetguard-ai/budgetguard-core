#!/bin/bash
set -e

echo "=== BudgetGuard Core Startup ==="

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "ERROR: dist directory not found. Build may have failed."
    exit 1
fi

# Check if main files exist
if [ ! -f "dist/index.js" ]; then
    echo "ERROR: dist/index.js not found. Build may have failed."
    exit 1
fi

if [ ! -f "dist/worker.js" ]; then
    echo "ERROR: dist/worker.js not found. Build may have failed."
    exit 1
fi

# Run Prisma migrations (connects to external DATABASE_URL)
echo "Running database migrations..."
npx prisma migrate deploy || {
    echo "ERROR: Database migration failed"
    exit 1
}

# Seed initial data (tenant, API keys, model pricing)
echo "Seeding initial data..."
npm run seed || echo "Warning: Seeding failed, but continuing startup"

# Start the background worker in the background
echo "Starting background worker..."
node dist/worker.js &
WORKER_PID=$!
echo "Background worker started with PID: $WORKER_PID"

# Start the Node.js application
echo "Starting main application on 0.0.0.0:3000..."
exec node dist/index.js