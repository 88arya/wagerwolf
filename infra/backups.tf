# Off-instance backups.
#
# A dump sitting on the instance's own disk protects against "I dropped a
# table". It does nothing about the instance dying, which is the failure a
# single-box deployment actually has. So the dumps go to S3, and the instance
# gets an IAM role that can write there — no AWS keys in GitHub secrets, no keys
# on the box, nothing to rotate.
#
# Cost is negligible: a few MB per night, lifecycled to 90 days. S3 is billed
# per GB-month and this will not reach one GB.

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "backups" {
  # S3 bucket names are globally unique across every AWS account, so a plain
  # "wagerwolf-backups" would very likely already be taken.
  bucket = "${var.project}-backups-${random_id.bucket_suffix.hex}"

  tags = {
    Project = var.project
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning plus a delete marker is what makes ransomware or a bad script
# survivable — an object overwritten in place is not a backup.
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    filter {}

    expiration {
      days = var.backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  depends_on = [aws_s3_bucket_versioning.backups]
}

# The instance assumes this role, so `aws s3 cp` on the box needs no credentials
# at all. Scoped to this one bucket, and to put/list only — a compromised
# instance must not be able to delete the backups that would recover from it.
resource "aws_iam_role" "instance" {
  name = "${var.project}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "backups" {
  name = "${var.project}-backup-write"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.backups.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.backups.arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.project}-instance"
  role = aws_iam_role.instance.name
}
