#!/bin/bash
# Stop and delete the existing application process managed by PM2
echo "Stopping PhotoComp API server..."
export PM2_HOME=/home/ec2-user/.pm2 # Specify PM2 home for the runas user (use /home/ubuntu/.pm2 for Ubuntu)
pm2 stop photocomp-api || true
pm2 delete photocomp-api || true
echo "PhotoComp API server stopped."
exit 0 # Ensure the script exits successfully