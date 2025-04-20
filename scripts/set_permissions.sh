#!/bin/bash
# Validate that the service is running and responding
echo "Validating PhotoComp API service..."

# Wait a few seconds for the Node.js process to fully start
sleep 5

echo "Attempting validation check via curl..."
# Use curl to check the root endpoint on the configured port
# -f: Fail silently (no output) on HTTP errors (status >= 400)
# --connect-timeout: Max time allowed for connection
# -s: Silent mode (suppress progress meter)
# -o /dev/null: Discard response body
if curl -f -s --connect-timeout 5 http://localhost:3000/ -o /dev/null; then
    echo "Service validation successful. Endpoint / responded with 2xx."
    exit 0
else
    echo "ERROR: Service validation failed. curl command exited with status $?." >&2
    # Provide more debugging info if curl fails
    echo "Checking PM2 status..."
    export PM2_HOME=/home/ec2-user/.pm2 # Ensure PM2 env is set for this user
    pm2 list
    echo "Fetching recent PM2 logs for photocomp-api..."
    pm2 logs photocomp-api --lines 20 --nostream # Show last 20 lines without streaming
    exit 1
fi