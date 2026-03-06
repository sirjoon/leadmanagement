# Green Cluster Configuration (for replication from blue)
# This mirrors the blue setup but uses vpc-cni and 2 nodes in us-east-1
# To create: copy blue/main.tf and blue/backend.tf here, update backend key to "green/"

cluster_name        = "dentacrm-green"
environment         = "green"
aws_region          = "us-east-1"
route53_zone_id     = "Z01213603PUH8MLSQUY6J"
domain              = "geekzlabs.com"
kubernetes_version  = "1.31"
node_instance_types = ["t3.medium"]
node_desired_size   = 2
node_max_size       = 4
node_min_size       = 2
vpc_cidr            = "10.0.0.0/16"
enable_vpc_cni      = true # Green uses AWS VPC CNI (not Calico)
