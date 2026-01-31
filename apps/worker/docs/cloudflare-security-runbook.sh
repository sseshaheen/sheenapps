#!/bin/bash
# Cloudflare Tunnel Implementation - Simplified Version
# No SSL certificates needed at origin!

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# ============================================================
# CONFIGURATION - Customize these
# ============================================================
export ROOT_DOMAIN="sheenapps.com"
export WEB_HOST="worker.sheenapps.com"     # Your web app
export SSH_HOST="ssh.sheenapps.com"        # SSH tunnel endpoint
export APP_PORT="3000"                     # Your Node.js app port
export NGINX_LOCAL_PORT="8080"             # Local port for tunnel->nginx (HTTP only)
export SSH_USER="worker"                   # Your SSH username
export YOUR_TRUSTED_IP=$(curl -s https://ifconfig.me)  # Auto-detect current IP

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
# HELPER FUNCTIONS
# ============================================================
print_step() {
    echo -e "\n${GREEN}[STEP]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

confirm() {
    read -p "$(echo -e ${YELLOW}$1 '(y/n): '${NC})" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted by user."
        exit 1
    fi
}

# ============================================================
# PHASE 0: PRE-FLIGHT CHECKS
# ============================================================
print_step "Phase 0: Pre-flight Checks"

# Must run as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root or with sudo"
   exit 1
fi

# Install dependencies
print_info "Installing required dependencies..."
apt-get update >/dev/null 2>&1
apt-get install -y jq net-tools curl wget >/dev/null 2>&1

# Ensure nginx is installed
if ! command -v nginx >/dev/null 2>&1; then
    print_info "Installing nginx..."
    apt-get install -y nginx >/dev/null 2>&1
    systemctl enable --now nginx
fi

# Show current setup
print_info "Current Configuration:"
echo "  - Nginx: $(nginx -v 2>&1 | cut -d/ -f2)"
echo "  - Node.js app: Running on port ${APP_PORT}"
echo "  - Your current IP: ${YOUR_TRUSTED_IP}"
echo ""

# Backup existing nginx config
print_step "Backing up nginx configuration"
cp -r /etc/nginx/sites-available /etc/nginx/sites-available.backup.$(date +%Y%m%d-%H%M%S)

# Critical warning
print_warning "This will transition ${WEB_HOST} to Cloudflare Tunnel"
print_info "The good news: NO SSL certificates needed at origin!"
print_warning "Ensure you have backup access (cloud console, etc)"
confirm "Ready to proceed?"

# ============================================================
# PHASE 1: INSTALL CLOUDFLARED
# ============================================================
print_step "Phase 1: Installing cloudflared"

if ! command -v cloudflared &> /dev/null; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    print_info "cloudflared installed: $(cloudflared --version)"
else
    print_info "cloudflared already installed: $(cloudflared --version)"
fi

# ============================================================
# PHASE 2: CLOUDFLARE AUTHENTICATION
# ============================================================
print_step "Phase 2: Cloudflare Authentication"

print_warning "Browser window will open for Cloudflare login"
confirm "Ready to authenticate?"

cloudflared tunnel login

# ============================================================
# PHASE 3: CREATE WEB TUNNEL
# ============================================================
print_step "Phase 3: Creating Web Tunnel"

# Create tunnel
cloudflared tunnel create web-origin 2>/dev/null || print_warning "Tunnel 'web-origin' may already exist"

# Get tunnel ID (robust method with deduplication)
export WEB_TUNNEL_ID=$(cloudflared tunnel list -o json | jq -r '.[] | select(.name=="web-origin") | .id' | head -n1)
if [ -z "$WEB_TUNNEL_ID" ]; then
    print_error "Failed to get web tunnel ID"
    exit 1
fi
print_info "Web tunnel ID: ${WEB_TUNNEL_ID}"

# Create web tunnel config
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: ${WEB_TUNNEL_ID}
credentials-file: /root/.cloudflared/${WEB_TUNNEL_ID}.json

ingress:
  - hostname: ${WEB_HOST}
    service: http://127.0.0.1:${NGINX_LOCAL_PORT}
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s

  - service: http_status:404
EOF

print_info "Web tunnel configuration created"

# ============================================================
# PHASE 4: SIMPLE NGINX CONFIG (NO SSL!)
# ============================================================
print_step "Phase 4: Configuring Nginx (Simple HTTP-only)"

# Create simplified nginx config - NO SSL NEEDED!
cat > /etc/nginx/sites-available/cloudflare-tunnel <<EOF
# Block all direct access attempts
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;  # Close connection without response
}

# Main application - HTTP only on localhost
# No SSL needed because Cloudflare Tunnel handles encryption!
server {
    listen 127.0.0.1:${NGINX_LOCAL_PORT};
    server_name ${WEB_HOST};

    # Trust Cloudflare tunnel for real IPs
    set_real_ip_from 127.0.0.1;
    real_ip_header CF-Connecting-IP;
    real_ip_recursive on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Block sensitive files
    location ~ /\\.(?!well-known) {
        deny all;
    }

    # Proxy to your app
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # WebSocket support
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts for long polling/websockets
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }
}
EOF

print_info "Nginx configured with simple HTTP-only setup"

# ============================================================
# PHASE 5: START WEB TUNNEL
# ============================================================
print_step "Phase 5: Starting Web Tunnel"

# Route DNS
cloudflared tunnel route dns web-origin ${WEB_HOST} || print_warning "DNS route may already exist"

# Install and start service
cloudflared service install
systemctl enable cloudflared
systemctl restart cloudflared

sleep 3
if systemctl is-active cloudflared >/dev/null; then
    print_info "✓ Web tunnel service running"
else
    print_error "Web tunnel service failed"
    journalctl -u cloudflared -n 20
    exit 1
fi

# ============================================================
# PHASE 6: SWITCH NGINX
# ============================================================
print_step "Phase 6: Activating New Nginx Configuration"

# Enable new config
ln -sf /etc/nginx/sites-available/cloudflare-tunnel /etc/nginx/sites-enabled/default

# Remove old config if exists
if [ -L /etc/nginx/sites-enabled/worker.sheenapps.com ]; then
    rm -f /etc/nginx/sites-enabled/worker.sheenapps.com
fi

# Test and reload
if nginx -t; then
    systemctl reload nginx
    print_info "✓ Nginx switched to tunnel mode"
else
    print_error "Nginx config test failed"
    exit 1
fi

# Test local connectivity
sleep 2
if curl -s http://127.0.0.1:${NGINX_LOCAL_PORT} -H "Host: ${WEB_HOST}" | grep -q "<!DOCTYPE\|<html"; then
    print_info "✓ Local proxy working"
fi

# ============================================================
# PHASE 7: TEST WEB ACCESS
# ============================================================
print_step "Phase 7: Testing Web Access"

print_info "Waiting for DNS propagation..."
sleep 5

if curl -sI https://${WEB_HOST} --max-time 10 | grep -q "HTTP"; then
    print_info "✓ Website accessible via Cloudflare: https://${WEB_HOST}"
else
    print_warning "Website may still be propagating, check in a few minutes"
fi

# ============================================================
# PHASE 8: SSH TUNNEL (OPTIONAL)
# ============================================================
print_step "Phase 8: SSH Tunnel Setup"

confirm "Setup SSH access via Cloudflare? (Recommended)"

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Create SSH tunnel
    cloudflared tunnel create ssh-origin 2>/dev/null || print_warning "SSH tunnel may already exist"

    export SSH_TUNNEL_ID=$(cloudflared tunnel list -o json | jq -r '.[] | select(.name=="ssh-origin") | .id' | head -n1)
    if [ -z "$SSH_TUNNEL_ID" ]; then
        print_error "Failed to get SSH tunnel ID"
    else
        print_info "SSH tunnel ID: ${SSH_TUNNEL_ID}"

        # SSH tunnel config
        cat > /etc/cloudflared/ssh-config.yml <<EOF
tunnel: ${SSH_TUNNEL_ID}
credentials-file: /root/.cloudflared/${SSH_TUNNEL_ID}.json

ingress:
  - hostname: ${SSH_HOST}
    service: ssh://localhost:22
  - service: http_status:404
EOF

        # Route DNS
        cloudflared tunnel route dns ssh-origin ${SSH_HOST}

        # Create systemd service with path flexibility
        cat > /etc/systemd/system/cloudflared-ssh.service <<'EOF'
[Unit]
Description=Cloudflare SSH Tunnel
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared --config /etc/cloudflared/ssh-config.yml tunnel run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

        # Optional: Add systemd hardening (comment out if troubleshooting)
        # sed -i '/^\[Service\]/a ProtectSystem=full\nProtectHome=true\nPrivateTmp=true\nNoNewPrivileges=true' /etc/systemd/system/cloudflared-ssh.service

        systemctl daemon-reload
        systemctl enable cloudflared-ssh
        systemctl start cloudflared-ssh

        sleep 3
        if systemctl is-active cloudflared-ssh >/dev/null; then
            print_info "✓ SSH tunnel running"
            print_warning "Configure Cloudflare Access for ${SSH_HOST} in dashboard"
            print_info "On your laptop: cloudflared access ssh-config --hostname ${SSH_HOST}"
        fi
    fi
fi

# ============================================================
# PHASE 9: FIREWALL
# ============================================================
print_step "Phase 9: Firewall Configuration"

print_warning "Configuring firewall (SSH remains open from ${YOUR_TRUSTED_IP})"

# Configure UFW
ufw --force disable
ufw --force reset

# Defaults
ufw default deny incoming
ufw default allow outgoing

# Keep SSH from trusted IP during transition
ufw allow from ${YOUR_TRUSTED_IP} to any port 22 comment "Backup SSH"

# Cloudflared outbound
ufw allow out 7844/tcp comment "Cloudflare QUIC"
ufw allow out 7844/udp comment "Cloudflare QUIC"
ufw allow out 443/tcp comment "HTTPS outbound"

ufw --force enable
print_info "Firewall configured"
ufw status numbered

# ============================================================
# PHASE 10: MONITORING
# ============================================================
print_step "Phase 10: Setting up Monitoring"

# Create monitor script with PATH
cat > /usr/local/bin/tunnel-monitor.sh <<'EOF'
#!/bin/bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

check_service() {
    local service=$1
    if ! systemctl is-active $service >/dev/null 2>&1; then
        echo "[$(date)] $service down, restarting..." >> /var/log/tunnel-monitor.log
        systemctl restart $service
    fi
}

check_service cloudflared
[ -f /etc/systemd/system/cloudflared-ssh.service ] && check_service cloudflared-ssh
check_service nginx
EOF

chmod +x /usr/local/bin/tunnel-monitor.sh

# Add to crontab
(crontab -l 2>/dev/null || true; echo "*/5 * * * * /usr/local/bin/tunnel-monitor.sh") | crontab -

# Add cloudflared auto-update
(crontab -l 2>/dev/null || true; echo "0 4 * * 1 /usr/local/bin/cloudflared update >> /var/log/cloudflared-update.log 2>&1") | crontab -

print_info "Monitoring configured"

# ============================================================
# PHASE 11: FINAL VERIFICATION
# ============================================================
print_step "Phase 11: System Verification"

echo ""
echo "Service Status:"
echo "---------------"
systemctl is-active cloudflared >/dev/null && echo "✓ Web tunnel: Running" || echo "✗ Web tunnel: Not running"
systemctl is-active cloudflared-ssh >/dev/null 2>&1 && echo "✓ SSH tunnel: Running" || echo "○ SSH tunnel: Not configured"
systemctl is-active nginx >/dev/null && echo "✓ Nginx: Running" || echo "✗ Nginx: Not running"

echo ""
echo "Connectivity:"
echo "-------------"
curl -sI https://${WEB_HOST} --max-time 5 | grep -q "HTTP" && echo "✓ Website: https://${WEB_HOST}" || echo "⚠ Website: Check DNS propagation"

# Direct IP should fail
SERVER_IP=$(curl -s ifconfig.me)
curl -sI http://${SERVER_IP} --max-time 2 2>/dev/null | grep -q "HTTP" && echo "⚠ Direct IP accessible" || echo "✓ Direct IP blocked"

# ============================================================
# COMPLETE!
# ============================================================
print_step "Setup Complete!"

cat > /root/cloudflare-setup-summary.txt <<EOF
Cloudflare Tunnel Setup Summary
================================
Date: $(date)
Web Tunnel ID: ${WEB_TUNNEL_ID}
SSH Tunnel ID: ${SSH_TUNNEL_ID:-"Not configured"}
Web Host: ${WEB_HOST}
SSH Host: ${SSH_HOST}

NO SSL CERTIFICATES NEEDED!
The tunnel handles all encryption.
Nginx only listens on localhost:${NGINX_LOCAL_PORT} (HTTP).

Services:
- systemctl status cloudflared
- systemctl status cloudflared-ssh
- systemctl status nginx

Logs:
- journalctl -u cloudflared -f
- journalctl -u cloudflared-ssh -f
- tail -f /var/log/nginx/access.log
EOF

echo ""
echo "================== IMPORTANT =================="
echo ""
echo "✓ NO SSL CERTIFICATES NEEDED AT ORIGIN!"
echo "✓ Cloudflare Tunnel handles all encryption"
echo "✓ No certificate renewal worries ever!"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. TEST YOUR WEBSITE:"
echo "   https://${WEB_HOST}"
echo ""
echo "2. IF YOU SETUP SSH TUNNEL:"
echo "   - Configure Cloudflare Access for ${SSH_HOST}"
echo "   - On laptop: cloudflared access ssh-config --hostname ${SSH_HOST}"
echo "   - Test from multiple networks before closing port 22"
echo ""
echo "3. FINAL LOCKDOWN (after SSH tunnel works):"
echo "   sudo ufw delete allow from ${YOUR_TRUSTED_IP} to any port 22"
echo "   sudo ufw deny 22/tcp"
echo ""
echo "4. MONITOR:"
echo "   - Real IPs in logs: tail -f /var/log/nginx/access.log"
echo "   - Tunnel status: journalctl -u cloudflared -f"
echo ""
echo "==============================================="

print_info "Summary saved to /root/cloudflare-setup-summary.txt"

# Final reminder about SSH Access setup
if [ ! -z "${SSH_TUNNEL_ID:-}" ]; then
    echo ""
    print_warning "SSH Access Setup Reminder:"
    echo "1. Go to Cloudflare Dashboard → Zero Trust → Access → Applications"
    echo "2. Create application for ${SSH_HOST}"
    echo "3. Enable 'Service Auth' for SSH short-lived certificates"
    echo "4. On your laptop run:"
    echo "   cloudflared access ssh-config --hostname ${SSH_HOST} >> ~/.ssh/config"
fi
