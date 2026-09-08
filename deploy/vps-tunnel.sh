#!/bin/bash
# Start the BAW bridge and Cloudflare quick-tunnel. Saves the public URL
# to /opt/twinticker-bridge/TUNNEL_URL so other scripts can find it.

set -e
LOG=/var/log/twinticker-bridge.log
CLOG=/var/log/cloudflared.log
URL_FILE=/opt/twinticker-bridge/TUNNEL_URL

# Load env
set -a; source /opt/twinticker-bridge/.env; set +a

# Kill any old
pkill -9 -f 'node server.mjs' 2>/dev/null || true
pkill -9 cloudflared 2>/dev/null || true
sleep 2

# Start bridge
cd /opt/twinticker-bridge
nohup node server.mjs >> "$LOG" 2>&1 &
BRIDGE_PID=$!
echo "Bridge PID: $BRIDGE_PID"
sleep 3

# Confirm bridge is up
if ! curl -s --max-time 3 http://127.0.0.1:8088/health > /dev/null; then
  echo "Bridge failed to start. See $LOG"
  exit 1
fi
echo "Bridge is up on 127.0.0.1:8088"

# Start tunnel
nohup cloudflared tunnel --url http://127.0.0.1:8088 --no-autoupdate >> "$CLOG" 2>&1 &
TUNNEL_PID=$!
echo "Tunnel PID: $TUNNEL_PID"

# Wait for the URL
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  URL=$(grep -oE 'https://[a-z-]+\.trycloudflare\.com' "$CLOG" 2>/dev/null | tail -1)
  if [ -n "$URL" ]; then
    echo "$URL" > "$URL_FILE"
    echo "Tunnel URL: $URL"
    echo "Saved to $URL_FILE"
    exit 0
  fi
  sleep 1
done
echo "Tunnel failed to come up in 20s. See $CLOG"
exit 1
