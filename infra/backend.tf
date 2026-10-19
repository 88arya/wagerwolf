# Remote state in the bucket created by infra/bootstrap.
terraform {
  backend "s3" {
    key          = "wagerwolf/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
