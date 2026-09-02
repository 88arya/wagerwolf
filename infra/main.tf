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
  required_version = ">= 1.5"

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

  # Caddy needs 80 reachable for the Let's Encrypt HTTP-01 challenge, not merely
  # to redirect. Closing it breaks certificate renewal 60 days later — long after
  # anyone would connect the two events.
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
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
