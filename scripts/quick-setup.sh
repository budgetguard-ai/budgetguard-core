#!/bin/bash
set -e

echo "🚀 Setting up BudgetGuard..."

# Install OPA automatically
if ! command -v opa &> /dev/null; then
    echo "📦 Installing OPA..."
    OPA_VERSION=$(curl -s https://api.github.com/repos/open-policy-agent/opa/releases/latest | grep tag_name | cut -d '"' -f 4)
    echo "Detected OPA version: $OPA_VERSION"
    
    if [ -z "$OPA_VERSION" ]; then
        echo "❌ Failed to detect OPA version. Using fallback v0.70.0"
        OPA_VERSION="v0.70.0"
    fi
    
    echo "Detecting system architecture and OS..."
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case "$ARCH" in
        x86_64) ARCH="amd64" ;;
        armv7l) ARCH="arm" ;;
        aarch64) ARCH="arm64" ;;
        *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    BINARY="opa_${OS}_${ARCH}_static"
    echo "Downloading OPA $OPA_VERSION for $OS/$ARCH..."
    curl -L -o /tmp/opa "https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/${BINARY}"
    
    # Verify download
    if [ ! -f /tmp/opa ] || [ ! -s /tmp/opa ]; then
        echo "❌ Failed to download OPA binary"
        exit 1
    fi
    
    chmod +x /tmp/opa && sudo mv /tmp/opa /usr/local/bin/opa
    echo "✅ OPA installed successfully"
    opa version
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
VITE_API_BASE_URL=
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