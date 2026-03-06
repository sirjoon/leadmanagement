terraform {
  backend "s3" {
    bucket         = "dentacrm-terraform-state"
    key            = "shared/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "dentacrm-terraform-lock"
    encrypt        = true
  }
}
