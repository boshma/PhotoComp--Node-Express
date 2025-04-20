#!/bin/bash
# Start the application using PM2
echo "Starting PhotoComp API server with PM2..."
cd /var/www/photocomp-api
export PM2_HOME=/home/ec2-user/.pm2 # Specify PM2 home (use /home/ubuntu/.pm2 for Ubuntu)
# Start the application using the built JS file in dist/
# Ensure NODE_ENV is set correctly for dotenv to potentially load .env if needed,
# although parameters are fetched directly here. PM2 can manage NODE_ENV.
pm2 start dist/src/index.js --name photocomp-api --env production --update-env
# Optional: Configure PM2 to restart on crashes/reboots
# pm2 startup # Run this manually once or in user data to generate command
# pm2 save    # Save the current process list
echo "PhotoComp API server started."
exit 0