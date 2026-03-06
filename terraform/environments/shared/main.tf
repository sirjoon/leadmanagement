terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
  alias  = "us_east_1"
}

provider "aws" {
  region = "ap-south-1"
  alias  = "ap_south_1"
}

# --- ECR Repositories (us-east-1, existing) ---
resource "aws_ecr_repository" "api" {
  provider             = aws.us_east_1
  name                 = "dentacrm-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project   = "dentacrm"
    Terraform = "true"
  }
}

resource "aws_ecr_repository" "frontend" {
  provider             = aws.us_east_1
  name                 = "dentacrm-frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project   = "dentacrm"
    Terraform = "true"
  }
}

# --- ECR Repositories (ap-south-1, for blue cluster) ---
resource "aws_ecr_repository" "api_mumbai" {
  provider             = aws.ap_south_1
  name                 = "dentacrm-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project   = "dentacrm"
    Terraform = "true"
  }
}

resource "aws_ecr_repository" "frontend_mumbai" {
  provider             = aws.ap_south_1
  name                 = "dentacrm-frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project   = "dentacrm"
    Terraform = "true"
  }
}

# Lifecycle policies - keep last 10 images
resource "aws_ecr_lifecycle_policy" "api" {
  provider   = aws.us_east_1
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  provider   = aws.us_east_1
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "api_mumbai" {
  provider   = aws.ap_south_1
  repository = aws_ecr_repository.api_mumbai.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend_mumbai" {
  provider   = aws.ap_south_1
  repository = aws_ecr_repository.frontend_mumbai.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# --- Route53 Zone (data source) ---
data "aws_route53_zone" "main" {
  provider = aws.us_east_1
  zone_id  = "Z01213603PUH8MLSQUY6J"
}

output "ecr_registry_us_east_1" {
  value = split("/", aws_ecr_repository.api.repository_url)[0]
}

output "ecr_registry_ap_south_1" {
  value = split("/", aws_ecr_repository.api_mumbai.repository_url)[0]
}

output "route53_zone_id" {
  value = data.aws_route53_zone.main.zone_id
}

output "route53_zone_name" {
  value = data.aws_route53_zone.main.name
}
