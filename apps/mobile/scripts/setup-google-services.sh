#!/bin/bash
# Script: Decode google-services.json từ EAS Secret trước khi build
# EAS Secret "GOOGLE_SERVICES_JSON_BASE64" chứa nội dung base64-encoded

set -e

if [ -z "$GOOGLE_SERVICES_JSON_BASE64" ]; then
  echo "⚠️  GOOGLE_SERVICES_JSON_BASE64 not set — skipping google-services.json generation"
  
  # Fallback: nếu file đã tồn tại (dev local), dùng luôn
  if [ -f "google-services.json" ]; then
    echo "✅ Using existing local google-services.json"
  else
    echo "❌ No google-services.json found! FCM push notifications will not work."
  fi
  exit 0
fi

echo "$GOOGLE_SERVICES_JSON_BASE64" | base64 --decode > google-services.json
echo "✅ google-services.json decoded from EAS Secret successfully"
