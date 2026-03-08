# Green Cluster Replication Guide

This document describes how to replicate the blue cluster setup for the green cluster.

## Architecture Differences

| Aspect | Blue (Current) | Green (To Create) |
|--------|---------------|-------------------|
| Cluster Name | dentacrm-blue | dentacrm-green |
| Region | ap-south-1 (Mumbai) | us-east-1 (N. Virginia) |
| CNI | Calico (VXLAN overlay) | AWS VPC CNI |
| Nodes | 1x t3.medium | 2x t3.medium |
| VPC CIDR | 10.1.0.0/16 | 10.0.0.0/16 |
| ECR Registry | 675045716724.dkr.ecr.ap-south-1.amazonaws.com | 675045716724.dkr.ecr.us-east-1.amazonaws.com |
| HPA | Disabled | Enabled (min 2 replicas) |

## Step 1: Terraform

```bash
cd terraform/environments/green

# The main.tf and backend.tf are already configured
# Update terraform.tfvars if needed

terraform init
terraform plan -out=plan.tfplan
terraform apply plan.tfplan
```

Key terraform.tfvars settings for green:
- `enable_vpc_cni = true` (uses AWS VPC CNI, NOT Calico)
- `node_desired_size = 2`
- `aws_region = "us-east-1"`

## Step 2: Configure kubectl

```bash
aws eks update-kubeconfig --name dentacrm-green --region us-east-1 --alias dentacrm-green
```

## Step 3: Skip Calico (Green uses VPC CNI)

Green cluster uses the default AWS VPC CNI, so NO Calico installation needed.

## Step 4: Deploy Infrastructure

```bash
cd helm/infrastructure
helm dependency update
helm upgrade --install dentacrm-infra . \
  --namespace emissary-system --create-namespace \
  --values values-green.yaml \
  --wait --timeout 10m
```

Create `helm/infrastructure/values-green.yaml`:
```yaml
aws:
  region: us-east-1
  externalDnsRoleArn: ""  # From terraform output
  certManagerRoleArn: ""  # From terraform output
domain: geekzlabs.com
email: admin@geekzlabs.com
emissary-ingress:
  enabled: true
  replicaCount: 2
external-dns:
  txtOwnerId: dentacrm-green-external-dns
  aws:
    region: us-east-1
```

## Step 5: Build and Push Images

```bash
/deploy build green
```

## Step 6: Deploy Application

```bash
/deploy deploy green
```

## Step 7: Run Database Migration

```bash
kubectl exec -it deploy/dentacrm-api -n dentacrm -- npx prisma db push
```

## Step 8: Seed Database

Same seed script as blue. Run via kubectl exec.

## Step 9: DNS Failover

Configure Route53 weighted/failover routing:
- Blue (ap-south-1): weight 50 or primary
- Green (us-east-1): weight 50 or secondary

## Notes

- Green cluster ECR repos already exist in us-east-1
- The same Helm charts work for both clusters, only values files differ
- Use `/deploy status green` to verify deployment
