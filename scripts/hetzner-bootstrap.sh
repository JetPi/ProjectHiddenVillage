#!/usr/bin/env bash
# One-time bootstrap for the Project Hidden Village host (Hetzner CPX02, Ubuntu 26.04).
# Run as root on the server:  bash hetzner-bootstrap.sh
#
# Installs Docker Engine + the compose plugin, sets a swap-friendly sysctl profile and
# schedules a capped Docker prune. It deliberately does NOT install Coolify, does not open
# firewall ports, and does not build anything: images arrive from GHCR.
# See plans/small-box-deployment-tuning.md for the reasoning behind each step.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "run as root" >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "== packages =="
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg

echo "== docker engine =="
if command -v docker >/dev/null 2>&1; then
    echo "docker already present: $(docker --version)"
else
    # Ubuntu's own package first: Docker's apt repo usually lags a fresh Ubuntu release
    # like 26.04, and docker.io is recent enough for this workload.
    apt-get install -y -qq docker.io
fi

echo "== compose plugin =="
if docker compose version >/dev/null 2>&1; then
    echo "compose already present: $(docker compose version)"
else
    apt-get install -y -qq docker-compose-v2 2>/dev/null \
        || apt-get install -y -qq docker-compose-plugin 2>/dev/null \
        || apt-get install -y -qq docker-compose 2>/dev/null \
        || echo "WARNING: no compose package found; install docker-compose-v2 manually" >&2
fi

systemctl enable --now docker

echo "== swap posture =="
# The 4 GB /swapfile is a backstop, not a working tier: default swappiness 60 evicts hot
# pages long before it is needed, which is exactly the stutter we are avoiding.
if [ ! -f /etc/sysctl.d/99-phv.conf ] || ! grep -q '^vm.swappiness' /etc/sysctl.d/99-phv.conf; then
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-phv.conf
fi
sysctl --system >/dev/null

if [ -f /swapfile ] && ! grep -q '^/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== weekly docker prune (never -volumes: that would take pgdata) =="
cat > /etc/systemd/system/phv-docker-prune.service <<'UNIT'
[Unit]
Description=Prune unused Docker images and build cache

[Service]
Type=oneshot
ExecStart=/usr/bin/docker image prune -af --filter until=336h
ExecStart=-/usr/bin/docker builder prune -f
UNIT

cat > /etc/systemd/system/phv-docker-prune.timer <<'UNIT'
[Unit]
Description=Weekly Docker prune for the small disk

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now phv-docker-prune.timer

echo "== baseline =="
docker --version
docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || true
echo
free -m
echo
df -h /
echo
swapon --show || true
echo
echo "bootstrap done"
