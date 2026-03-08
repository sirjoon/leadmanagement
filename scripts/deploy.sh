#!/bin/bash
set -e

# DentraCRM Deploy Script
# Usage: ./scripts/deploy.sh [frontend|backend|all]
# Builds amd64 images from latest code, pushes to ECR, and deploys to EKS

COMPONENT=${1:-all}
REGION="us-east-1"
ACCOUNT="675045716724"
REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
CLUSTER="dentacrm-prod"
NAMESPACE="dentacrm"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Get git SHA
SHA=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)
echo "==> Deploying commit: $SHA"

# Pull latest
echo "==> Pulling latest code..."
git -C "$PROJECT_ROOT" pull

# ECR login
echo "==> Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

# Set kubectl context
aws eks update-kubeconfig --name "$CLUSTER" --region "$REGION" --quiet

# Build & push
build_backend() {
  echo "==> Building backend (amd64)..."
  docker build --platform linux/amd64 \
    -t "$REGISTRY/dentacrm-api:$SHA" \
    -t "$REGISTRY/dentacrm-api:latest" \
    -f "$PROJECT_ROOT/backend/Dockerfile" \
    "$PROJECT_ROOT/backend/"
  echo "==> Pushing backend..."
  docker push "$REGISTRY/dentacrm-api:$SHA"
  docker push "$REGISTRY/dentacrm-api:latest"
}

build_frontend() {
  echo "==> Building frontend (amd64)..."
  docker build --platform linux/amd64 \
    -t "$REGISTRY/dentacrm-frontend:$SHA" \
    -t "$REGISTRY/dentacrm-frontend:latest" \
    -f "$PROJECT_ROOT/frontend/Dockerfile" \
    "$PROJECT_ROOT/frontend/"
  echo "==> Pushing frontend..."
  docker push "$REGISTRY/dentacrm-frontend:$SHA"
  docker push "$REGISTRY/dentacrm-frontend:latest"
}

case "$COMPONENT" in
  backend)
    build_backend
    echo "==> Restarting backend..."
    kubectl rollout restart deploy/dentacrm-api -n "$NAMESPACE"
    kubectl rollout status deploy/dentacrm-api -n "$NAMESPACE" --timeout=120s
    ;;
  frontend)
    build_frontend
    echo "==> Restarting frontend..."
    kubectl rollout restart deploy/dentacrm-frontend -n "$NAMESPACE"
    kubectl rollout status deploy/dentacrm-frontend -n "$NAMESPACE" --timeout=120s
    ;;
  all)
    build_backend
    build_frontend
    echo "==> Restarting all deployments..."
    kubectl rollout restart deploy/dentacrm-api deploy/dentacrm-frontend -n "$NAMESPACE"
    kubectl rollout status deploy/dentacrm-api -n "$NAMESPACE" --timeout=120s
    kubectl rollout status deploy/dentacrm-frontend -n "$NAMESPACE" --timeout=120s
    ;;
  *)
    echo "Usage: ./scripts/deploy.sh [frontend|backend|all]"
    exit 1
    ;;
esac

# Health check
echo "==> Health check..."
kubectl exec deploy/dentacrm-api -n "$NAMESPACE" -- wget -qO- http://localhost:3000/health
echo ""
echo "==> Deploy complete! Commit $SHA is live."
