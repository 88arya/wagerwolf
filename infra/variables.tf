variable "project" {
  description = "Name prefix for every resource, and the directory under /opt on the instance."
  type        = string
  default     = "wagerwolf"
}

variable "region" {
  description = <<-DESC
    MUST MATCH THE SUPABASE PROJECT'S REGION. The database is Supabase and every
    request makes several queries, so a cross-region round trip (~60ms
    us-east-1 <-> us-west-2) compounds into a visibly slow API. The Supabase
    project is in us-west-2, so this is us-west-2.

    Changing it means moving the Supabase project too, not just this.
  DESC
  type        = string
  default     = "us-west-2"
}

variable "instance_type" {
  description = <<-DESC
    t3.small (2 vCPU burstable, 2GB) is the recommendation: Postgres, Redis,
    Node and Caddy fit with room to spare, ~$15/month.

    t3.micro (1GB) is worth a serious look: Postgres is Supabase, so this box
    runs only app + Redis + Caddy — roughly 320MB. If your AWS account still
    carries the classic 12-month free tier, t3.micro is free, which stretches
    the credit balance considerably further than five months.

    t4g.small is ARM and ~20% cheaper, but the CI image build would then need
    arm64: QEMU emulation adds minutes per build, and ARM runners are a paid
    feature on private repos. Not worth it at this scale.
  DESC
  type        = string
  default     = "t3.small"
}

variable "disk_gb" {
  description = "Root volume size. 20GB holds the OS, images and the database comfortably; gp3 is ~$0.08/GB/month."
  type        = number
  default     = 20
}

variable "ssh_public_key" {
  description = <<-DESC
    Contents of the PUBLIC half of the deploy keypair (ssh-ed25519 AAAA...).
    Generate with:  ssh-keygen -t ed25519 -f wagerwolf-deploy -N ""
    The PRIVATE half becomes the SSH_PRIVATE_KEY GitHub secret. Commit neither.
  DESC
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = <<-DESC
    Who may reach port 22. Defaults to the world because GitHub-hosted runners
    have no stable egress IP and the deploy runs over SSH. Key-only auth, so
    this is the ordinary trade — narrow it if you move to a self-hosted runner.
  DESC
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "backup_retention_days" {
  description = "How long nightly database dumps live in S3 before lifecycle expiry."
  type        = number
  default     = 90
}
