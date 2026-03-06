variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.small"
}

variable "key_name" {
  description = "SSH key pair name"
  type        = string
  default     = "dentacrm-mumbai"
}

variable "domain" {
  description = "Subdomain for the app"
  type        = string
  default     = "magiccrm.geekzlabs.com"
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for geekzlabs.com"
  type        = string
  default     = "Z01213603PUH8MLSQUY6J"
}

# --- RDS ---

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "dentacrm"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "dentacrm_admin"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}
