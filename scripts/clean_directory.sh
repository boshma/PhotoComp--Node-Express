#!/bin/bash
# Clean the deployment directory except for hidden files like .env potentially
echo "Cleaning deployment directory /var/www/photocomp-api..."
shopt -s extglob # Enable extended globbing
rm -rf /var/www/photocomp-api/!(.|..?|.env) # Remove everything except hidden files/dirs and .env
echo "Deployment directory cleaned."
exit 0