variable "cluster_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "oidc_provider_arn" {
  type = string
}

variable "oidc_provider_url" {
  type        = string
  description = "OIDC provider URL without https:// prefix"
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

variable "create_ebs_csi_addon" {
  type        = bool
  default     = true
  description = "Whether to create the EBS CSI addon. Set to false during Calico bootstrap (no nodes yet)."
}
