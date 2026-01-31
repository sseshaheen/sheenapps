#!/bin/bash
# Grafana Alloy Installation Script for Ubuntu/Debian
# This script installs and configures Grafana Alloy on the VM

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ALLOY_VERSION="latest"
ALLOY_USER="alloy"
ALLOY_GROUP="alloy"
ALLOY_CONFIG_DIR="/etc/alloy"
ALLOY_DATA_DIR="/var/lib/alloy"
ALLOY_LOG_DIR="/var/log/alloy"
SECRETS_DIR="/etc/sheenapps/secrets"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    log_error "Please run as root (use sudo)"
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    log_error "Cannot detect OS"
fi

log_info "Detected OS: $OS $VER"

# Install dependencies
log_info "Installing dependencies..."
apt-get update
apt-get install -y \
    curl \
    wget \
    gnupg \
    software-properties-common \
    apt-transport-https \
    ca-certificates

# Add Grafana repository
log_info "Adding Grafana repository..."
wget -q -O - https://apt.grafana.com/gpg.key | apt-key add -
add-apt-repository "deb https://apt.grafana.com stable main"
apt-get update

# Install Grafana Alloy
log_info "Installing Grafana Alloy..."
apt-get install -y alloy

# Create user and group
log_info "Creating alloy user and group..."
if ! id -u "$ALLOY_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$ALLOY_DATA_DIR" --shell /bin/false "$ALLOY_USER"
fi

# Create directories
log_info "Creating directories..."
mkdir -p "$ALLOY_CONFIG_DIR"
mkdir -p "$ALLOY_DATA_DIR"
mkdir -p "$ALLOY_LOG_DIR"
mkdir -p "$SECRETS_DIR"

# Set permissions
chown -R "$ALLOY_USER:$ALLOY_GROUP" "$ALLOY_DATA_DIR"
chown -R "$ALLOY_USER:$ALLOY_GROUP" "$ALLOY_LOG_DIR"
chmod 700 "$SECRETS_DIR"

# Copy configuration file
log_info "Installing configuration..."
if [ -f "../config/alloy/config.yaml" ]; then
    cp ../config/alloy/config.yaml "$ALLOY_CONFIG_DIR/config.yaml"
    chown root:root "$ALLOY_CONFIG_DIR/config.yaml"
    chmod 644 "$ALLOY_CONFIG_DIR/config.yaml"
else
    log_warn "Configuration file not found. Please copy manually."
fi

# Create environment file
log_info "Creating environment file..."
cat > "$SECRETS_DIR/alloy.env" << 'EOF'
# Grafana Alloy Environment Variables
# IMPORTANT: Replace these with your actual values!

# Environment
ENVIRONMENT=production
HOSTNAME=$(hostname)

# Grafana Cloud Endpoints (from your Grafana Cloud stack)
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-2.grafana.net/otlp

# Grafana Cloud Authentication
# Get this from: Grafana Cloud > Connections > OpenTelemetry > Configure
GRAFANA_OTLP_AUTH=Basic Z2xjX2V5Sm9Jam9pTVRRM01ESXlNaUlzSW00aU9pSjNiM0pyWlhJdGQzSnBkR1V0YldWMGNtbGpjeTFzYjJkekxYUnlZV05sY3kxM2IzSnJaWEl0ZDNKcGRHVXRiV1YwY21samN5MXNiMmR6TFhSeVlXTmxjeUlzSW1zaU9pSkVNemRXUTNwM05UUXdNbVpVVmpFMU4yTjJZbXh4TUdVaUxDSnRJanA3SW5JaU9pSndjbTlrTFdWMUxYZGxjM1F0TWlKOWZR==

# Log level
LOG_LEVEL=info
EOF

chmod 600 "$SECRETS_DIR/alloy.env"
chown root:root "$SECRETS_DIR/alloy.env"

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/grafana-alloy.service << 'EOF'
[Unit]
Description=Grafana Alloy
Documentation=https://grafana.com/docs/alloy/latest/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=alloy
Group=alloy
EnvironmentFile=/etc/sheenapps/secrets/alloy.env
ExecStart=/usr/bin/alloy run --config.file=/etc/alloy/config.yaml --storage.path=/var/lib/alloy
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=grafana-alloy

# Enhanced Security Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/alloy /var/log/alloy
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictRealtime=true
RestrictNamespaces=true
RestrictSUIDSGID=true
PrivateDevices=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

# Network restrictions - only allow localhost and required IPs
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
IPAddressDeny=any
IPAddressAllow=127.0.0.1/8 ::1/128
# Add Grafana Cloud IPs if needed (example):
# IPAddressAllow=<grafana-cloud-ip-range>

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096
LimitMEMLOCK=0

# Remove all capabilities - Alloy doesn't need CAP_NET_BIND_SERVICE for high ports
AmbientCapabilities=
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF

# Create log rotation config
log_info "Configuring log rotation..."
cat > /etc/logrotate.d/alloy << 'EOF'
/var/log/alloy/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 alloy alloy
    postrotate
        systemctl reload grafana-alloy 2>/dev/null || true
    endscript
}
EOF

# Configure firewall (if ufw is installed)
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall..."
    # Allow OTLP ports only from localhost
    ufw allow from 127.0.0.1 to any port 4317 comment 'Alloy OTLP gRPC'
    ufw allow from 127.0.0.1 to any port 4318 comment 'Alloy OTLP HTTP'
    # Health check port (restrict as needed)
    ufw allow from 127.0.0.1 to any port 13133 comment 'Alloy Health'
    # Metrics port (restrict as needed)
    ufw allow from 127.0.0.1 to any port 8888 comment 'Alloy Metrics'
fi

# Reload systemd
log_info "Reloading systemd..."
systemctl daemon-reload

# Enable service
log_info "Enabling Grafana Alloy service..."
systemctl enable grafana-alloy

# Start service
log_info "Starting Grafana Alloy..."
systemctl start grafana-alloy

# Wait for service to start
sleep 5

# Check status
if systemctl is-active --quiet grafana-alloy; then
    log_info "Grafana Alloy is running!"
    
    # Test health endpoint
    if curl -s http://localhost:13133/healthz > /dev/null; then
        log_info "Health check passed!"
    else
        log_warn "Health check failed. Check logs: journalctl -u grafana-alloy -f"
    fi
else
    log_error "Grafana Alloy failed to start. Check logs: journalctl -u grafana-alloy -f"
fi

# Print next steps
echo ""
echo "========================================="
echo "Grafana Alloy Installation Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Update credentials in: $SECRETS_DIR/alloy.env"
echo "2. Verify configuration: alloy fmt --check $ALLOY_CONFIG_DIR/config.yaml"
echo "3. Restart service: systemctl restart grafana-alloy"
echo "4. Check logs: journalctl -u grafana-alloy -f"
echo "5. Test OTLP endpoint: curl -X POST http://localhost:4318/v1/traces"
echo "6. View metrics: curl http://localhost:8888/metrics"
echo "7. Health check: curl http://localhost:13133/healthz"
echo ""
echo "Documentation: https://grafana.com/docs/alloy/latest/"
echo ""