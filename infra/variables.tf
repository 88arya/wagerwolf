variable "project" {
  description = "Name prefix for every resource, and the directory under /opt on the instance."
  type        = string
  default     = "wagerwolf"
}

variable "region" {
  description = <<-DESC
    MUST MATCH THE SUPABASE PROJECT'S REGION. The database is Supabase and every
    request makes several queries, so a cross-region round trip (~60ms coast to
    coast) compounds into an API that is slow forever, in a way that reads as an
    application problem rather than a config one.

    us-east-1 as of 10 Sept 2026, chosen because that is where the operator and
    the early audience are. Cost is identical either way — t3.small is $0.0208/hr
    and gp3 $0.08/GB in both — so the pairing is the only thing that matters,
    not the coast.

    IT USED TO DEFAULT TO us-west-2 WHILE terraform.tfvars.example SUGGESTED
    us-east-1, which meant leaving the example file alone put the instance on the
    opposite coast from the Supabase project the docs told you to match. Both say
    us-east-1 now, and the example states it rather than commenting it out.

    Changing it means moving the Supabase project too, not just this.
  DESC
  type        = string
  default     = "us-east-1"
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
