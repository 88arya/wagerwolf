# Remote state, in the bucket infra/bootstrap creates.
#
# State used to live only in infra/terraform.tfstate on one laptop: lose the
# laptop and Terraform no longer knows it owns the instance, the Elastic IP or
# the backup bucket; run it from two places and each clobbers the other.
#
# `bucket` is left out because its name carries a random suffix. It is passed
# at init time, once — see the setup steps at the top of infra/bootstrap/main.tf.
#
# `use_lockfile` is S3's native state locking (Terraform 1.10+). It replaces the
# DynamoDB lock table that used to be required, so there is no second resource
# to create or pay for.
terraform {
  backend "s3" {
    key          = "wagerwolf/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
