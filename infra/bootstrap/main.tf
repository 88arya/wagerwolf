# The bucket that holds infra/'s Terraform state.
#
# Separate from infra/ because a configuration cannot create the bucket its own
# backend lives in: the backend has to exist before `terraform init` can run.
# This one keeps LOCAL state, which is fine for exactly one bucket that never
# changes; lose that file and `terraform import` gets it back.
#
# One-time setup, then never again:
#
#   terraform -chdir=infra/bootstrap init
#   terraform -chdir=infra/bootstrap apply
#   terraform -chdir=infra init -migrate-state \
#     -backend-config="bucket=$(terraform -chdir=infra/bootstrap output -raw state_bucket)"
#
# The last step copies infra/terraform.tfstate into the bucket. Keep the local
# file until a `terraform -chdir=infra plan` against the remote state shows no
# changes, then delete it.

terraform {
  required_version = ">= 1.10"

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

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "wagerwolf"
}

provider "aws" {
  region = var.region
}

resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-tfstate-${random_id.suffix.hex}"

  # State holds every secret Terraform has seen. Destroying the bucket by
  # accident would orphan the whole stack from its configuration.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Every apply writes a new version, so a corrupted or clobbered state can be
# rolled back to the previous one.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}
