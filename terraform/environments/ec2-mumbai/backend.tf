terraform {
  backend "s3" {
    bucket         = "dentacrm-terraform-state"
    key            = "ec2-mumbai/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "dentacrm-terraform-lock"
    encrypt        = true
  }
}
