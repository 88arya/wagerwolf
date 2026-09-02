output "public_ip" {
  description = "Static IP. This is the EC2_HOST GitHub secret, and the A record for your API hostname."
  value       = aws_eip.app.public_ip
}

output "ssh_command" {
  description = "Copy-paste to get a shell on the box."
  value       = "ssh -i wagerwolf-deploy ubuntu@${aws_eip.app.public_ip}"
}

output "instance_id" {
  description = "For `aws ec2 stop-instances --instance-ids <id>` when conserving credits."
  value       = aws_instance.app.id
}

output "backup_bucket" {
  description = "S3 bucket for database dumps. This is the BACKUP_BUCKET GitHub variable."
  value       = aws_s3_bucket.backups.bucket
}
