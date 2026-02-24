# DentraCRM EKS Deployment Guide

Complete guide to deploying DentraCRM on Amazon EKS with NGINX Ingress, automatic TLS via cert-manager, and Route53 DNS management via external-dns.

## Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **kubectl** installed and configured
3. **Helm 3.x** installed
4. **Terraform** (optional, for infrastructure provisioning)
5. **EKS Cluster** with OIDC provider enabled

## Architecture Overview

```
Internet
    ↓
Route 53 (dentacrm.in) ← [external-dns auto-manages]
    ↓
AWS NLB (Network Load Balancer)
    ↓
NGINX Ingress Controller
    ↓ (TLS termination via cert-manager)
┌─────────────────────────────────────┐
│  /api/*     → dentacrm-api (3000)   │
│  /avmsmiles/* → frontend + API      │
│  /*         → dentacrm-frontend(80) │
└─────────────────────────────────────┘
```

## Step 1: Create IAM Roles (IRSA)

First, create IAM roles for external-dns and cert-manager to access Route53.

```bash
cd terraform

# Initialize Terraform
terraform init

# Set your Route53 zone ID
export TF_VAR_route53_zone_id="Z0123456789ABCDEF"
export TF_VAR_cluster_name="dentacrm-prod"

# Apply IAM roles
terraform apply -target=aws_iam_role.external_dns -target=aws_iam_role.cert_manager

# Note the output ARNs
terraform output external_dns_role_arn
terraform output cert_manager_role_arn
```

## Step 2: Deploy Infrastructure Components

Deploy NGINX Ingress, cert-manager, and external-dns:

```bash
cd helm/infrastructure

# Add Helm repositories
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo update

# Update dependencies
helm dependency update

# Create values override file
cat > values-prod.yaml << EOF
aws:
  region: ap-south-1
  externalDnsRoleArn: "arn:aws:iam::YOUR_ACCOUNT:role/dentacrm-prod-external-dns"
  certManagerRoleArn: "arn:aws:iam::YOUR_ACCOUNT:role/dentacrm-prod-cert-manager"

domain: dentacrm.in
email: admin@dentacrm.in
EOF

# Install infrastructure
helm upgrade --install dentacrm-infra . \
  --namespace kube-system \
  --values values-prod.yaml \
  --wait
```

## Step 3: Verify Infrastructure

```bash
# Check NGINX Ingress
kubectl get pods -n kube-system -l app.kubernetes.io/name=ingress-nginx
kubectl get svc -n kube-system -l app.kubernetes.io/name=ingress-nginx

# Check cert-manager
kubectl get pods -n cert-manager
kubectl get clusterissuers

# Check external-dns
kubectl get pods -n kube-system -l app.kubernetes.io/name=external-dns
kubectl logs -n kube-system -l app.kubernetes.io/name=external-dns

# Get the Load Balancer hostname
kubectl get svc -n kube-system ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

## Step 4: Build and Push Docker Images

```bash
# Set your ECR registry
export ECR_REGISTRY="123456789.dkr.ecr.ap-south-1.amazonaws.com"

# Login to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $ECR_REGISTRY

# Build and push API
cd backend
docker build -t $ECR_REGISTRY/dentacrm-api:latest .
docker push $ECR_REGISTRY/dentacrm-api:latest

# Build and push Frontend
cd ../frontend
docker build -t $ECR_REGISTRY/dentacrm-frontend:latest .
docker push $ECR_REGISTRY/dentacrm-frontend:latest
```

## Step 5: Deploy DentraCRM Application

```bash
cd helm/dentacrm

# Update dependencies
helm dependency update

# Create production values file
cat > values-prod.yaml << EOF
global:
  domain: dentacrm.in
  environment: production

namespace: dentacrm

image:
  registry: "123456789.dkr.ecr.ap-south-1.amazonaws.com"

api:
  secrets:
    jwtSecret: "$(openssl rand -hex 32)"
    platformDatabaseUrl: "postgres://user:pass@neon.tech/dentacrm_platform"

tenants:
  - id: avmsmiles
    name: "AVM Smiles"
    plan: starter
    databaseUrl: "postgres://user:pass@neon.tech/avmsmiles"

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: "arn:aws:iam::YOUR_ACCOUNT:role/dentacrm-app-role"
EOF

# Install DentraCRM
helm upgrade --install dentacrm . \
  --namespace dentacrm \
  --create-namespace \
  --values values-prod.yaml \
  --wait
```

## Step 6: Verify Deployment

```bash
# Check pods
kubectl get pods -n dentacrm

# Check services
kubectl get svc -n dentacrm

# Check ingress
kubectl get ingress -n dentacrm

# Check certificate
kubectl get certificates -n dentacrm
kubectl describe certificate dentacrm-wildcard-cert -n dentacrm

# Check Route53 (should show new records)
aws route53 list-resource-record-sets --hosted-zone-id YOUR_ZONE_ID | grep dentacrm
```

## Step 7: Test the Application

```bash
# Test health endpoint
curl https://dentacrm.in/api/v1/health

# Test tenant route
curl https://dentacrm.in/avmsmiles/api/v1/health

# Open in browser
open https://dentacrm.in
```

## Troubleshooting

### Certificate not issuing

```bash
# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Check certificate status
kubectl describe certificate dentacrm-tls -n dentacrm

# Check certificate request
kubectl get certificaterequest -n dentacrm
```

### DNS not updating

```bash
# Check external-dns logs
kubectl logs -n kube-system -l app.kubernetes.io/name=external-dns

# Verify IAM permissions
aws sts get-caller-identity
aws route53 list-hosted-zones
```

### Ingress not working

```bash
# Check ingress controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=ingress-nginx

# Check ingress resource
kubectl describe ingress -n dentacrm
```

## Adding New Tenants

To add a new tenant:

1. **Create Neon database** for the tenant
2. **Update values file**:

```yaml
tenants:
  - id: avmsmiles
    name: "AVM Smiles"
    databaseUrl: "postgres://..."
  - id: newclient    # Add new tenant
    name: "New Client"
    databaseUrl: "postgres://..."
```

3. **Upgrade Helm release**:

```bash
helm upgrade dentacrm ./helm/dentacrm -n dentacrm --values values-prod.yaml
```

The ingress will automatically add routes for `/newclient/*`.

## Scaling

### Manual scaling

```bash
kubectl scale deployment dentacrm-api -n dentacrm --replicas=5
```

### Autoscaling is enabled by default

HPA will scale based on CPU/Memory:
- API: 2-10 replicas
- Frontend: 2-5 replicas

## Monitoring

Recommended additions:
- **Prometheus** + **Grafana** for metrics
- **AWS CloudWatch** Container Insights
- **Sentry** for error tracking

## Cost Optimization

- Use **Karpenter** for spot instances
- Enable **scale-to-zero** for Neon databases
- Use **AWS Savings Plans** for consistent workloads
