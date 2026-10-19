variable "project" {
  description = "Name prefix for every resource, and the directory under /opt on the instance."
  type        = string
  default     = "wagerwolf"
}

variable "region" {
  description = "Must match the Supabase project's region; every request makes several DB round trips."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "t3.small (2 vCPU, 2GB). Runs app, web, Redis and Caddy; Postgres is on Supabase."
  type        = string
  default     = "t3.small"
}

variable "disk_gb" {
  description = "Root volume size in GB."
  type        = number
  default     = 20
}

variable "ssh_public_key" {
  description = "Public half of the deploy keypair. The private half is the SSH_PRIVATE_KEY secret."
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "Who may reach port 22. Open because GitHub-hosted runners have no fixed IP; key-only auth."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "backup_retention_days" {
  description = "How long nightly database dumps live in S3 before lifecycle expiry."
  type        = number
  default     = 90
}
