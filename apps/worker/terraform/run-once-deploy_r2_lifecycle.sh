#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# run-once-deploy_r2_lifecycle.sh
#
# One-shot helper to:
#   1. Load CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID & R2_BUCKET_NAME from .env
#   2. terraform init -upgrade
#   3. Import your existing bucket into state (jurisdiction=default)
#   4. terraform plan & apply
# -----------------------------------------------------------------------------
set -euo pipefail

# 1. locate paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # terraform/
ROOT_DIR="$(dirname "$SCRIPT_DIR")"                          # project root
ENV_FILE="$ROOT_DIR/.env"

# 2. load .env & export TF_VARS
if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌  .env not found at $ENV_FILE"
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${CLOUDFLARE_API_TOKEN:?please set CLOUDFLARE_API_TOKEN in .env}"
: "${CLOUDFLARE_ACCOUNT_ID:?please set CLOUDFLARE_ACCOUNT_ID in .env}"
: "${R2_BUCKET_NAME:?please set R2_BUCKET_NAME in .env}"

export TF_VAR_cloudflare_api_token="$CLOUDFLARE_API_TOKEN"
export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID"
export TF_VAR_r2_bucket_name="$R2_BUCKET_NAME"

# 3. terraform workflow
cd "$SCRIPT_DIR"

echo "🔄  terraform init -upgrade"
terraform init -upgrade

echo "🔗  Importing existing bucket “${TF_VAR_r2_bucket_name}” (jurisdiction=default)"
terraform import \
  cloudflare_r2_bucket.artifacts \
  "${TF_VAR_cloudflare_account_id}/${TF_VAR_r2_bucket_name}/default" || true

echo "📝  terraform plan"
terraform plan -out=tfplan

read -rp $'\n❓  Apply this plan? [y/N] ' yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
  echo "🚀  terraform apply tfplan"
  terraform apply tfplan
  echo "✅  Bucket imported into Terraform state."
else
  echo "ℹ️  Aborted—no changes applied."
fi
