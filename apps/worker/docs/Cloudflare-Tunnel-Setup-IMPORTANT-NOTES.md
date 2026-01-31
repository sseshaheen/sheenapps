# Important Operational Notes for Cloudflare Tunnel Setup

## 🔑 KEY INSIGHT: You Don't Need SSL Certificates at Origin with Tunnel!

When using Cloudflare Tunnel, your nginx only listens on `127.0.0.1:8080` (localhost). The tunnel handles all encryption between Cloudflare and your server. This means:

- **No SSL certificates needed at origin**
- **No certificate renewal issues**
- **No Let's Encrypt complexity**
- **Simpler configuration**

### The Simplest & Most Secure Approach (RECOMMENDED)

```nginx
# Nginx only needs this - no SSL configuration at all!
server {
    listen 127.0.0.1:8080;
    server_name worker.sheenapps.com;

    # Trust Cloudflare tunnel for real IPs
    set_real_ip_from 127.0.0.1;
    real_ip_header CF-Connecting-IP;
    real_ip_recursive on;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**That's it!** No SSL certificates, no renewal worries.

---

## If You Still Want SSL at Origin (Not Recommended with Tunnel)

There might be edge cases where you want SSL at origin (e.g., compliance requirements, multiple services). Here are your options:

### Option 1: DNS-01 Challenge with Scoped API Token (Most Secure)

**Never use Global API Key!** Create a scoped token instead:

1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create Token with these permissions:
   - `Zone:DNS:Edit`
   - `Zone:Zone:Read`
   - Scope to: `sheenapps.com`

3. Setup DNS-01:
```bash
# Install Cloudflare DNS plugin
sudo apt-get install python3-certbot-dns-cloudflare

# Use scoped token (NOT global API key)
cat > ~/.secrets/cloudflare.ini <<'EOF'
dns_cloudflare_api_token = YOUR_SCOPED_API_TOKEN_HERE
EOF
chmod 600 ~/.secrets/cloudflare.ini

# Test renewal
certbot renew --dry-run --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini
```

### Option 2: Cloudflare Origin Certificates (Only for Direct HTTPS)

**Important:** Origin Certificates are only useful if Cloudflare connects to your server via public HTTPS. With Tunnel, this is unnecessary since traffic goes through `cloudflared` on localhost.

Only use if you're NOT using Tunnel and need Cloudflare → Origin HTTPS.

### ❌ What NOT to Do

- **Don't use HTTP-01 challenge** with Tunnel - it won't work since Cloudflare proxies the traffic
- **Don't temporarily open port 80** for renewal - requests won't reach your server
- **Don't use Global API Key** - scoped tokens are much safer

---

## Cloudflared Auto-Updates

```bash
# Weekly update via cron
(crontab -l 2>/dev/null || true; echo "0 4 * * 1 /usr/local/bin/cloudflared update >> /var/log/cloudflared-update.log 2>&1") | crontab -
```

---

## Monitoring & Health Checks

### Essential Monitor Script
```bash
cat > /usr/local/bin/tunnel-monitor.sh <<'EOF'
#!/bin/bash
# CRITICAL: Add PATH for cron environment
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
(crontab -l 2>/dev/null || true; echo "*/5 * * * * /usr/local/bin/tunnel-monitor.sh") | crontab -
```

### Robust Tunnel ID Lookup
```bash
# Always use this method for scripts
WEB_TID=$(cloudflared tunnel list -o json | jq -r '.[] | select(.name=="web-origin") | .id')
SSH_TID=$(cloudflared tunnel list -o json | jq -r '.[] | select(.name=="ssh-origin") | .id')
```

---

## Performance Tuning

### Nginx Settings for WebSockets/Long Polling
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;

    # Increase for websockets/long polling
    proxy_read_timeout 90s;
    proxy_connect_timeout 90s;
    proxy_send_timeout 90s;

    # WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### Optional: Cloudflared Metrics (Advanced Users)
```yaml
# In /etc/cloudflared/config.yml
metrics: 127.0.0.1:49312

# Then access metrics at http://127.0.0.1:49312/metrics
```

---

## Emergency Procedures

### If Website Goes Down
```bash
# 1. Check tunnel
systemctl status cloudflared
journalctl -u cloudflared -n 50

# 2. Test local connectivity
curl -I http://127.0.0.1:8080 -H "Host: worker.sheenapps.com"

# 3. Restart services
systemctl restart cloudflared nginx

# 4. Check Cloudflare Dashboard for tunnel status
```

### If Locked Out of SSH
1. Use cloud provider console
2. `sudo ufw disable`
3. Check logs: `journalctl -u cloudflared-ssh -n 50`

### Complete Rollback
```bash
# From console access:
systemctl stop cloudflared cloudflared-ssh
ufw disable
ln -sf /etc/nginx/sites-available/worker.sheenapps.com /etc/nginx/sites-enabled/
systemctl reload nginx
```

---

## Security Best Practices

1. **Use scoped API tokens**, never Global API Key
2. **Don't expose tunnel credentials** (`/root/.cloudflared/*.json`)
3. **Enable Cloudflare Access** with appropriate identity providers
4. **Set session duration** in Zero Trust (e.g., 12 hours for SSH)
5. **Monitor access logs** regularly
6. **Enable 2FA** on your Cloudflare account

---

## Quick Decision Guide

| Scenario | Recommendation |
|----------|---------------|
| **Using Cloudflare Tunnel** | No SSL needed at origin, nginx on localhost:8080 only |
| **Direct HTTPS without Tunnel** | Use Cloudflare Origin Certificates |
| **Need Let's Encrypt** | Use DNS-01 with scoped API token |
| **Compliance requires origin SSL** | DNS-01 with scoped token + Tunnel |

---

## TL;DR - The Simplest Path

1. **Use Cloudflare Tunnel** ✓
2. **Nginx listens only on 127.0.0.1:8080** ✓
3. **No SSL certificates at origin** ✓
4. **No renewal headaches** ✓
5. **Maximum security** ✓

This is the way.
