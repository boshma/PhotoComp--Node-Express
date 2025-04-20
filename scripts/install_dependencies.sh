#!/bin/bash
# Install production dependencies
echo "Installing production dependencies..."
cd /var/www/photocomp-api
npm ci --production --omit=dev # Install only production deps, faster than install
echo "Dependencies installed."
# Optional: Set permissions if needed
# chown -R ec2-user:ec2-user /var/www/photocomp-api # Use 'ubuntu:ubuntu' for Ubuntu
exit 0