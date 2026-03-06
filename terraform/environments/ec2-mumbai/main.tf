terraform {
  required_version = ">= 1.2"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# --- Data Sources ---

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Latest Amazon Linux 2023 AMI
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-arm64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# --- SSH Key Pair ---

resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "this" {
  key_name   = var.key_name
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_file" "ssh_key" {
  content         = tls_private_key.ssh.private_key_pem
  filename        = "${path.module}/dentacrm-mumbai.pem"
  file_permission = "0400"
}

# --- Security Group ---

resource "aws_security_group" "dentacrm" {
  name        = "dentacrm-ec2-sg"
  description = "DentraCRM EC2 - HTTP, HTTPS, SSH"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "dentacrm-ec2-sg"
    Environment = "production"
    Terraform   = "true"
  }
}

# --- IAM Role for EC2 (S3 backup access) ---

resource "aws_iam_role" "ec2" {
  name = "dentacrm-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "dentacrm-ec2-role"
    Environment = "production"
    Terraform   = "true"
  }
}

resource "aws_iam_role_policy" "ec2_permissions" {
  name = "dentacrm-ec2-permissions"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Backup"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::dentacrm-backups-675045716724",
          "arn:aws:s3:::dentacrm-backups-675045716724/*"
        ]
      },
      {
        Sid    = "SSMReadSecrets"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:aws:ssm:ap-south-1:675045716724:parameter/dentacrm/*"
      },
      {
        Sid    = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "dentacrm-ec2-profile"
  role = aws_iam_role.ec2.name
}

# --- EC2 Instance ---

resource "aws_instance" "dentacrm" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.this.key_name
  vpc_security_group_ids = [aws_security_group.dentacrm.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  subnet_id              = data.aws_subnets.default.ids[0]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Update system
    dnf update -y

    # Install Docker + AWS CLI + Git
    dnf install -y docker git aws-cli
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ec2-user

    # Install Docker Compose plugin
    mkdir -p /usr/local/lib/docker/cli-plugins
    DOCKER_COMPOSE_VERSION="v2.29.1"
    curl -fsSL "https://github.com/docker/compose/releases/download/$${DOCKER_COMPOSE_VERSION}/docker-compose-linux-aarch64" -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose

    # Install Node.js 20 (for backup script)
    dnf install -y nodejs20

    # Create app directory
    mkdir -p /home/ec2-user/dentacrm
    chown ec2-user:ec2-user /home/ec2-user/dentacrm

    # Fetch DB credentials from SSM and create .env.production
    REGION="ap-south-1"
    DB_URL=$(aws ssm get-parameter --name "/dentacrm/prod/database-url" --with-decryption --region $REGION --query 'Parameter.Value' --output text)

    cat > /home/ec2-user/dentacrm/.env.production << ENVEOF
    DATABASE_URL=$DB_URL
    PLATFORM_DATABASE_URL=$DB_URL
    JWT_SECRET=$(openssl rand -hex 32)
    JWT_EXPIRY=24h
    FRONTEND_URL=https://magiccrm.geekzlabs.com
    DOMAIN=magiccrm.geekzlabs.com
    BACKUP_S3_BUCKET=dentacrm-backups-675045716724
    AWS_REGION=ap-south-1
    ENVEOF

    chown ec2-user:ec2-user /home/ec2-user/dentacrm/.env.production
    chmod 600 /home/ec2-user/dentacrm/.env.production

    echo "Setup complete!" > /home/ec2-user/setup-done.txt
  EOF

  tags = {
    Name        = "dentacrm-prod"
    Environment = "production"
    Terraform   = "true"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

# --- Elastic IP ---

resource "aws_eip" "dentacrm" {
  instance = aws_instance.dentacrm.id
  domain   = "vpc"

  tags = {
    Name        = "dentacrm-prod-eip"
    Environment = "production"
    Terraform   = "true"
  }
}

# --- RDS PostgreSQL (Free Tier) ---

resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "dentacrm" {
  name       = "dentacrm-db-subnet"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name        = "dentacrm-db-subnet"
    Environment = "production"
    Terraform   = "true"
  }
}

resource "aws_security_group" "rds" {
  name        = "dentacrm-rds-sg"
  description = "DentraCRM RDS - PostgreSQL access from EC2 only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "PostgreSQL from EC2"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.dentacrm.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "dentacrm-rds-sg"
    Environment = "production"
    Terraform   = "true"
  }
}

resource "aws_db_instance" "dentacrm" {
  identifier     = "dentacrm-prod"
  engine         = "postgres"
  engine_version = "15.13"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 20
  storage_type          = "gp2"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.dentacrm.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  skip_final_snapshot       = false
  final_snapshot_identifier = "dentacrm-final-snapshot"
  deletion_protection       = true

  performance_insights_enabled = false

  tags = {
    Name        = "dentacrm-prod"
    Environment = "production"
    Terraform   = "true"
  }

  lifecycle {
    ignore_changes = [password]
  }
}

# Store DB password in SSM Parameter Store
resource "aws_ssm_parameter" "db_password" {
  name  = "/dentacrm/prod/db-password"
  type  = "SecureString"
  value = random_password.db.result

  tags = {
    Environment = "production"
    Terraform   = "true"
  }
}

resource "aws_ssm_parameter" "db_url" {
  name  = "/dentacrm/prod/database-url"
  type  = "SecureString"
  value = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.dentacrm.endpoint}/${var.db_name}"

  tags = {
    Environment = "production"
    Terraform   = "true"
  }
}

# --- Route53 DNS Record ---

resource "aws_route53_record" "app" {
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.dentacrm.public_ip]
}
