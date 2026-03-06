variable "cluster_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "kubernetes_version" {
  type    = string
  default = "1.31"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}

variable "node_desired_size" {
  type    = number
  default = 1
}

variable "node_min_size" {
  type    = number
  default = 1
}

variable "node_max_size" {
  type    = number
  default = 2
}

variable "node_disk_size" {
  type    = number
  default = 30
}

variable "enable_vpc_cni" {
  type        = bool
  default     = false
  description = "Whether to install the VPC CNI addon. Set to false for Calico."
}

variable "create_node_group" {
  type        = bool
  default     = true
  description = "Whether to create the managed node group. Set to false for first phase of Calico setup."
}
