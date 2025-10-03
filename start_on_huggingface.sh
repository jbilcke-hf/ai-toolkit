#!/bin/bash
set -e  # Exit the script if any statement returns a non-true return value

echo "=== Starting AI Toolkit ==="
echo "Working directory: $(pwd)"
echo "User: $(whoami)"

# Create base directory
mkdir -p /data/ai-toolkit
    
# Sync all files including frontend but important: we MUST preserve data folders
# (I had a situation where I lost precious data because I didn't had those excludes before...)
echo "Syncing codebase..."
rsync -a  --exclude='config' --exclude='output' --exclude='database' --exclude='aitk_db.db' --exclude='datasets' \
    /app/ /data/ai-toolkit/
echo "✓ Codebase synced"

# Ensure persistent directories exist
echo "Creating persistent directories..."
mkdir -p /data/ai-toolkit/database
echo "✓ Database directory ready"

# Set database URL to use organized persistent directory
export DATABASE_URL="file:/data/ai-toolkit/database/aitk_db.db"
echo "Database URL set to: $DATABASE_URL"

# Set HuggingFace cache directories to writable location
export HF_HOME="/data/huggingface"
export HUGGINGFACE_HUB_CACHE="/data/huggingface/hub"
export TRANSFORMERS_CACHE="/data/huggingface/transformers"
export DIFFUSERS_CACHE="/data/huggingface/diffusers"
echo "HuggingFace cache set to: $HF_HOME"

# Create HuggingFace cache directories
mkdir -p "$HF_HOME"
mkdir -p "$HUGGINGFACE_HUB_CACHE"
mkdir -p "$TRANSFORMERS_CACHE"
mkdir -p "$DIFFUSERS_CACHE"

# Change to the writable UI directory
echo "Changing to writable UI directory..."
cd /data/ai-toolkit/ui
echo "Current directory: $(pwd)"

# Run database migrations/setup if needed
echo "=== Updating dependencies ==="
npm install
echo "✓ Dependencies updated"

# Run database migrations/setup if needed
echo "=== Setting up database ==="

# Generate Prisma client (now with full write access)
echo "Generating Prisma client..."
npx prisma generate --schema prisma/schema.prisma
echo "✓ Prisma client generated"

# Push schema to create database tables
echo "Creating database tables..."
npx prisma db push --schema prisma/schema.prisma --skip-generate
echo "✓ Database tables created"

# Build the app
echo "=== Building app ==="
npm run build
echo "✓ App built"

# Start the application with HuggingFace cache environment variables
echo ""
echo "=== Starting application ==="
echo "Environment variables for HuggingFace:"
echo "  HF_HOME=$HF_HOME"
echo "  HUGGINGFACE_HUB_CACHE=$HUGGINGFACE_HUB_CACHE"
echo "  TRANSFORMERS_CACHE=$TRANSFORMERS_CACHE"
echo "  DIFFUSERS_CACHE=$DIFFUSERS_CACHE"

npm run start