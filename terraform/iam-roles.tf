# IAM Roles for DentraCRM EKS IRSA
# These roles allow Kubernetes service accounts to access AWS resources

# ─────────────────────────────────────────────────────────────
# Data sources
# ─────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

data "aws_eks_cluster" "cluster" {
  name = var.cluster_name
}

# OIDC provider for the EKS cluster
data "aws_iam_openid_connect_provider" "eks" {
  url = data.aws_eks_cluster.cluster.identity[0].oidc[0].issuer
}

locals {
  oidc_provider_arn = data.aws_iam_openid_connect_provider.eks.arn
  oidc_issuer       = replace(data.aws_eks_cluster.cluster.identity[0].oidc[0].issuer, "https://", "")
}

# ─────────────────────────────────────────────────────────────
# external-dns IAM Role
# ─────────────────────────────────────────────────────────────

resource "aws_iam_role" "external_dns" {
  name = "${var.cluster_name}-external-dns"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${local.oidc_issuer}:aud" = "sts.amazonaws.com"
            "${local.oidc_issuer}:sub" = "system:serviceaccount:kube-system:external-dns"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.cluster_name}-external-dns"
    Environment = var.environment
    Terraform   = "true"
  }
}

resource "aws_iam_role_policy" "external_dns" {
  name = "${var.cluster_name}-external-dns-policy"
  role = aws_iam_role.external_dns.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets"
        ]
        Resource = [
          "arn:aws:route53:::hostedzone/${var.route53_zone_id}"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "route53:ListHostedZones",
          "route53:ListResourceRecordSets",
          "route53:ListTagsForResource"
        ]
        Resource = ["*"]
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────
# cert-manager IAM Role
# ─────────────────────────────────────────────────────────────

resource "aws_iam_role" "cert_manager" {
  name = "${var.cluster_name}-cert-manager"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${local.oidc_issuer}:aud" = "sts.amazonaws.com"
            "${local.oidc_issuer}:sub" = "system:serviceaccount:cert-manager:cert-manager"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.cluster_name}-cert-manager"
    Environment = var.environment
    Terraform   = "true"
  }
}

resource "aws_iam_role_policy" "cert_manager" {
  name = "${var.cluster_name}-cert-manager-policy"
  role = aws_iam_role.cert_manager.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "route53:GetChange"
        ]
        Resource = "arn:aws:route53:::change/*"
      },
      {
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets",
          "route53:ListResourceRecordSets"
        ]
        Resource = "arn:aws:route53:::hostedzone/${var.route53_zone_id}"
      },
      {
        Effect = "Allow"
        Action = [
          "route53:ListHostedZonesByName"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────────────────────

output "external_dns_role_arn" {
  description = "IAM role ARN for external-dns"
  value       = aws_iam_role.external_dns.arn
}

output "cert_manager_role_arn" {
  description = "IAM role ARN for cert-manager"
  value       = aws_iam_role.cert_manager.arn
}
