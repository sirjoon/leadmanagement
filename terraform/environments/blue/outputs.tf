output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_ca" {
  value     = module.eks.cluster_certificate_authority
  sensitive = true
}

output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "cert_manager_role_arn" {
  value = module.irsa.cert_manager_role_arn
}

output "external_dns_role_arn" {
  value = module.irsa.external_dns_role_arn
}

output "ebs_csi_role_arn" {
  value = module.irsa.ebs_csi_role_arn
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

# --- Deployment Commands ---
output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region} --alias dentacrm-blue"
}

output "calico_install_command" {
  value = "helm install calico projectcalico/tigera-operator --namespace tigera-operator --create-namespace --set installation.kubernetesProvider=EKS --set installation.cni.type=Calico --set installation.calicoNetwork.bgp=Disabled --set 'installation.calicoNetwork.ipPools[0].cidr=10.244.0.0/16' --set 'installation.calicoNetwork.ipPools[0].encapsulation=VXLAN'"
}
