#!/bin/bash

linebot="line-oa-bot"

echo "🛑 Stopping application '$linebot'..."

# ลบ process แค่ครั้งเดียวก็เพียงพอ
pm2 delete $linebot 2>/dev/null || true

echo "✅ PM2 process stopped."