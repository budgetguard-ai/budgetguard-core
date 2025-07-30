#!/bin/bash
set -e

echo "🚀 Setting up BudgetGuard..."

# Install OPA automatically
if ! command -v opa &> /dev/null; then
    echo "📦 Installing OPA..."
    export OPA_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/opa/releases/latest | grep tag_name | cut -d '"' -f 4)
    curl -L -o opa https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static
    chmod +x opa && sudo mv opa /usr/local/bin/opa
fi

# Build policy bundle
bash scripts/build-opa-wasm.sh

# Setup environment files
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  EDIT .env with your API keys before continuing!"
    echo "   Required: OPENAI_KEY, ADMIN_API_KEY"
    exit 1
fi

# Setup dashboard env
mkdir -p src/dashboard
if [ ! -f src/dashboard/.env ]; then
    ADMIN_API_KEY_VALUE=$(grep '^ADMIN_API_KEY=' .env | cut -d '=' -f2-)
    if [ -z "$ADMIN_API_KEY_VALUE" ]; then
        echo "❌ Error: ADMIN_API_KEY not found or empty in .env file."
        exit 1
    fi
    cat > src/dashboard/.env << EOF
VITE_ADMIN_API_KEY=${ADMIN_API_KEY_VALUE//\"/}
# Default base URL for API requests. Update this value for production or other environments.
VITE_API_BASE_URL=http://localhost:3000
EOF
fi

# Start services
docker compose up -d postgres redis
sleep 5

# Setup database
npx prisma migrate dev --name init
npm run seed

# Build dashboard with environment variables
npm run build

echo "✅ Setup complete! Run 'npm run dev' to start"