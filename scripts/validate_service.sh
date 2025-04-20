#!/bin/bash
# Validate that the service is running and responding
echo "Validating PhotoComp API service..."
# Check if the app is listening on the specified port (e.g., 3000)
# Use curl to check a basic endpoint (adjust port and path if needed)
# Exit with 1 if validation fails, 0 if successful
if curl -f http://localhost:3000/; then # Replace 3000 with your PORT if different
  echo "Service validation successful."
  exit 0
else
  echo "ERROR: Service validation failed." >&2
  exit 1
fi