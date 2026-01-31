###############################################################################
# R2 Bucket – SheenApps Artifact Storage
#
# We import the existing bucket into Terraform state only.
# Lifecycle rules continue to live in the Cloudflare dashboard.
###############################################################################
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_api_token" {
  description = "Cloudflare API Token with R2 Storage:Edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "r2_bucket_name" {
  description = "Name of the existing R2 bucket for build artifacts"
  type        = string
}

# Import this bucket once:
#   terraform import cloudflare_r2_bucket.artifacts \
#     ${var.cloudflare_account_id}/${var.r2_bucket_name}/default
resource "cloudflare_r2_bucket" "artifacts" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name
  # jurisdiction defaults to "default"
}

output "r2_bucket_summary" {
  description = "R2 bucket is now under Terraform management; lifecycle rules remain manual"
  value = {
    bucket       = cloudflare_r2_bucket.artifacts.name
    jurisdiction = "default"
    note         = "Lifecycle rules configured via Cloudflare dashboard"
  }
}
