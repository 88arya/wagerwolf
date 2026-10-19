# One EC2 instance running the whole stack with docker compose.
# RDS + ElastiCache + an ALB would be ~$45/month before compute.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # Only to suffix the S3 bucket name, which must be globally unique.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# Looked up rather than hardcoded; AMI ids differ per region.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Default VPC: one public instance, so no NAT gateway.
data "aws_vpc" "default" {
  default = true
}

# Cloudflare's published IP ranges. Pinned; re-check occasionally.
locals {
  cloudflare_ipv4 = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]
  cloudflare_ipv6 = [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ]
}

resource "aws_key_pair" "deploy" {
  key_name   = "${var.project}-deploy"
  public_key = var.ssh_public_key
}

resource "aws_security_group" "app" {
  name        = "${var.project}-sg"
  description = "Wagerwolf backend: SSH, HTTP, HTTPS"
  vpc_id      = data.aws_vpc.default.id

  # SSH stays open because GitHub runners have no fixed IP. Key-only.
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  # 80/443 only from Cloudflare, so the WAF can't be bypassed via the IP.
  ingress {
    description      = "HTTP from Cloudflare"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = local.cloudflare_ipv4
    ipv6_cidr_blocks = local.cloudflare_ipv6
  }

  ingress {
    description      = "HTTPS from Cloudflare"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = local.cloudflare_ipv4
    ipv6_cidr_blocks = local.cloudflare_ipv6
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = var.project
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.app.id]

  # Lets the box write backups to S3 with no credentials stored anywhere.
  iam_instance_profile = aws_iam_instance_profile.instance.name

  root_block_device {
    volume_size = var.disk_gb
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-BOOTSTRAP
    #!/bin/bash
    set -euxo pipefail

    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get upgrade -y

    # Docker's own installer, which also lays down the compose v2 plugin.
    # Ubuntu's packaged docker.io lags and has shipped without the plugin.
    curl -fsSL https://get.docker.com | sh

    # So the deploy can run docker without sudo. The workflow connects as
    # `ubuntu`, never as root — an SSH key that lives in a GitHub secret should
    # not be a root key.
    usermod -aG docker ubuntu

    # For the nightly backup upload. Uses the instance profile above, so there
    # is nothing to configure and no key to leak.
    snap install aws-cli --classic || apt-get install -y awscli

    install -d -o ubuntu -g ubuntu /opt/${var.project}
    install -d -o ubuntu -g ubuntu /opt/${var.project}/backups

    # 2GB of swap. Postgres, Redis, Node and Caddy on a 2GB instance are
    # comfortable until something transient spikes — an ESPN sync over a big
    # week, an image pull. Without swap the kernel OOM-kills, and what it picks
    # is usually Postgres.
    if [ ! -f /swapfile ]; then
      fallocate -l 2G /swapfile
      chmod 600 /swapfile
      mkswap /swapfile
      swapon /swapfile
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
      echo 'vm.swappiness=10' >> /etc/sysctl.conf
    fi

    # Security patches apply themselves. This box has no configuration
    # management and nobody is going to log in monthly to run apt upgrade.
    apt-get install -y unattended-upgrades
    dpkg-reconfigure -f noninteractive unattended-upgrades
  BOOTSTRAP

  # user_data only runs at first boot, so changes need a new instance.
  user_data_replace_on_change = true

  # Ignore AMI updates; otherwise a new Ubuntu build would replace the instance.
  lifecycle {
    ignore_changes = [ami]
  }

  tags = {
    Name    = var.project
    Project = var.project
  }
}

# Static IP, so DNS survives a stop/start. Billed when not attached to a running instance.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Project = var.project
  }
}
