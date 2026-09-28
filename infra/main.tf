# One EC2 instance running the whole backend via docker compose.
#
# WHY NOT RDS + ELASTICACHE + ALB. That shape is the AWS default and costs
# roughly $45/month for this workload — ALB ~$16, RDS db.t4g.micro ~$15,
# ElastiCache ~$12 — before the compute. Against a $100 credit balance that is
# two months. The same containers on one instance are ~$18/month all in, which
# is five to six months, and nothing about this app needs a managed Postgres
# failover it will never exercise.
#
# The trade is explicit: you own backups, patching and the single point of
# failure. See .github/DEPLOYMENT.md.

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

# Canonical's official Ubuntu 24.04 LTS. Looked up rather than hardcoded — AMI
# ids are per-region, so a pinned one breaks the moment you change var.region.
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

# The default VPC is enough here: one public instance, no private subnets, and
# therefore no NAT gateway — which at ~$32/month would cost more than everything
# else combined and is the most common way an AWS bill surprises someone.
data "aws_vpc" "default" {
  default = true
}

# Cloudflare's published edge ranges, from https://www.cloudflare.com/ips-v4
# and /ips-v6, checked 28 Sept 2026. Pinned rather than fetched at plan time so
# a plan never changes because a URL answered differently. They change rarely;
# re-check both lists and apply when Cloudflare announces a new range, or
# requests from that range will be refused at the security group.
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

  # GitHub-hosted runners have no stable egress IP, so SSH cannot be locked to a
  # narrow CIDR while the deploy runs over SSH. Password auth is disabled on the
  # Ubuntu AMI, so this is key-only. To close it: AWS SSM Session Manager (no
  # inbound port at all) or a self-hosted runner. Neither is required to launch.
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  # 80 AND 443 ADMIT CLOUDFLARE ONLY. The origin serves a Cloudflare Origin CA
  # certificate (see deploy/Caddyfile), which no browser trusts, so every
  # legitimate request already arrives through Cloudflare. Open to 0.0.0.0/0,
  # anyone who found the instance IP could skip Cloudflare's WAF, DDoS
  # protection and rate limiting and talk to Caddy directly. The old note here
  # kept 80 open for Let's Encrypt's HTTP-01 challenge; there is no ACME any
  # more, so nothing outside Cloudflare needs either port.
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
    # gp3 bills capacity and IOPS separately and includes 3000 IOPS free, far
    # more than Postgres needs here. Do not "upgrade" this to io2.
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

  # Forces a replacement when user_data changes. Without it, a bootstrap edit
  # silently applies to nothing — user_data runs once, at first boot.
  user_data_replace_on_change = true

  tags = {
    Name    = var.project
    Project = var.project
  }
}

# A static IP, so stopping the instance to conserve credits does not change the
# address in DNS or in the EC2_HOST secret.
#
# COSTS MONEY WHEN IDLE: AWS bills every public IPv4 at ~$3.60/month, and an
# Elastic IP not attached to a *running* instance is billed on top. Stopping the
# instance for a month still costs a few dollars.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Project = var.project
  }
}
