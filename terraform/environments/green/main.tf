# Green environment - same structure as blue
# Copy from blue/main.tf when ready to create green cluster
# Key differences: enable_vpc_cni=true, 2 nodes, us-east-1

variable "cluster_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "route53_zone_id" {
  type = string
}

variable "domain" {
  type = string
}

variable "kubernetes_version" {
  type = string
}

variable "node_instance_types" {
  type = list(string)
}

variable "node_desired_size" {
  type = number
}

variable "node_max_size" {
  type = number
}

variable "node_min_size" {
  type = number
}

variable "vpc_cidr" {
  type = string
}

variable "enable_vpc_cni" {
  type    = bool
  default = true
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source       = "../../modules/vpc"
  cluster_name = var.cluster_name
  environment  = var.environment
  vpc_cidr     = var.vpc_cidr
  aws_region   = var.aws_region
}

module "eks" {
  source              = "../../modules/eks-cluster"
  cluster_name        = var.cluster_name
  environment         = var.environment
  kubernetes_version  = var.kubernetes_version
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  public_subnet_ids   = module.vpc.public_subnet_ids
  node_instance_types = var.node_instance_types
  node_desired_size   = var.node_desired_size
  node_max_size       = var.node_max_size
  node_min_size       = var.node_min_size
  enable_vpc_cni      = var.enable_vpc_cni
}

module "irsa" {
  source            = "../../modules/iam-irsa"
  cluster_name      = var.cluster_name
  environment       = var.environment
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.oidc_provider_url
  route53_zone_id   = var.route53_zone_id
}
