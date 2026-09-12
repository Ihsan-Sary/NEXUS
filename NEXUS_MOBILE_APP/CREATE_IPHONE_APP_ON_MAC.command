#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "NEXUS iPhone setup"
echo "Installing packages..."
npm install
if [ ! -d "ios" ]; then
  npx cap add ios
fi
npx cap sync ios
npx cap open ios
