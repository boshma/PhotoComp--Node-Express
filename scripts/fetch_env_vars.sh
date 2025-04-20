#!/bin/bash
# Fetch parameters from AWS Systems Manager Parameter Store and create .env file
echo "Fetching environment variables from Parameter Store..."
cd /var/www/photocomp-api

PARAM_PATH="/photocomp/dev/"
REGION="us-west-2"
ENV_FILE=".env"

# Fetch parameters and format them into KEY=Value pairs
# Using --query to extract Name and Value, text output, and processing with awk
aws ssm get-parameters-by-path --path "$PARAM_PATH" --recursive --with-decryption --region "$REGION" \
  --query "Parameters[].[Name,Value]" --output text | \
  awk -v path="$PARAM_PATH" '{
    key = $1
    sub(path, "", key) # Remove the path prefix from the key name
    # Everything after the first field ($1) is the value
    value = ""
    for (i=2; i<=NF; i++) { value = (value ? value FS : "") $i }
    print key "=" value
  }' > "$ENV_FILE"

if [ $? -eq 0 ]; then
  echo "Successfully fetched parameters and created $ENV_FILE"
  # Optional: Set permissions for the .env file
  # chmod 600 $ENV_FILE
  # chown ec2-user:ec2-user $ENV_FILE # Use 'ubuntu:ubuntu' for Ubuntu
else
  echo "ERROR: Failed to fetch parameters from Parameter Store." >&2
  exit 1
fi

exit 0