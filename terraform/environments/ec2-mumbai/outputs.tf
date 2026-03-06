output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.dentacrm.id
}

output "public_ip" {
  description = "Elastic IP address"
  value       = aws_eip.dentacrm.public_ip
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i ${path.module}/dentacrm-mumbai.pem ec2-user@${aws_eip.dentacrm.public_ip}"
}

output "domain" {
  description = "Application domain"
  value       = var.domain
}

output "ssh_key_path" {
  description = "Path to SSH private key"
  value       = local_file.ssh_key.filename
}

# --- RDS Outputs ---

output "rds_endpoint" {
  description = "RDS endpoint (host:port)"
  value       = aws_db_instance.dentacrm.endpoint
}

output "rds_hostname" {
  description = "RDS hostname"
  value       = aws_db_instance.dentacrm.address
}

output "db_name" {
  description = "Database name"
  value       = var.db_name
}

output "db_username" {
  description = "Database username"
  value       = var.db_username
}

output "db_password_ssm" {
  description = "SSM parameter path for DB password"
  value       = aws_ssm_parameter.db_password.name
}

output "database_url_ssm" {
  description = "SSM parameter path for full DATABASE_URL"
  value       = aws_ssm_parameter.db_url.name
}
