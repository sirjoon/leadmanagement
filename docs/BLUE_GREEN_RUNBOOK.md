# Blue-Green Deployment Runbook

## Overview

- **Blue Cluster**: `dentacrm-blue` in ap-south-1 (Mumbai), 1 node, Calico CNI
- **Green Cluster**: `dentacrm-prod`/`dentacrm-green` in us-east-1, 2 nodes, VPC CNI
- **Domain**: `dentacrm.geekzlabs.com`
- **DNS**: Route53 weighted routing between clusters

## Deploying a New Release

### Option A: Canary Deployment (Recommended)

```bash
# 1. Start canary with 10% traffic
/deploy canary-start blue 10

# 2. Monitor for errors (check logs, health, metrics)
/deploy status blue

# 3. Increase traffic gradually
/deploy canary-start blue 25
/deploy canary-start blue 50

# 4. If everything looks good, promote
/deploy canary-promote blue

# 5. If issues found, rollback immediately
/deploy canary-rollback blue
```

### Option B: Full Deployment

```bash
# Build and deploy directly
/deploy build blue
/deploy deploy blue
```

## Switching Traffic Between Clusters

### Make Blue Primary

Update Route53 `dentacrm.geekzlabs.com` to point to blue cluster's NLB:
```bash
# Get blue NLB
kubectl --context dentacrm-blue get svc -n emissary-system emissary-ingress \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### Make Green Primary

Update Route53 `dentacrm.geekzlabs.com` to point to green cluster's NLB.

### Weighted Routing (Both Active)

Create weighted Route53 records:
- Blue NLB: weight 50, set-identifier "blue"
- Green NLB: weight 50, set-identifier "green"

## Emergency Rollback

If the active cluster is failing:

1. Check which cluster is failing: `/deploy status blue` and `/deploy status green`
2. Update Route53 to point 100% to the healthy cluster
3. Investigate and fix the failing cluster
4. Resume weighted routing once fixed

## Useful Commands

```bash
# Check blue cluster
/deploy status blue

# Check green cluster
/deploy status green

# Build for blue
/deploy build blue

# Deploy to blue
/deploy deploy blue

# Start canary on blue with 20% traffic
/deploy canary-start blue 20

# Promote canary
/deploy canary-promote blue

# Rollback canary
/deploy canary-rollback blue
```

## Terraform

```bash
# Blue cluster infrastructure
cd terraform/environments/blue
terraform plan
terraform apply

# Green cluster infrastructure
cd terraform/environments/green
terraform plan
terraform apply

# Shared resources (ECR repos)
cd terraform/environments/shared
terraform plan
terraform apply
```
