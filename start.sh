#!/bin/bash

linebot="line-oa-bot"


echo "🛑 Stopping old PM2 processes if running..."
pm2 delete $linebot 2>/dev/null

echo "🚀 Starting line-oa-bot..."
pm2 start server.js --name "$linebot"


echo "💾 Saving PM2 process list..."
pm2 save

echo "✅ System started with PM2!"

echo -e "\n📜 Opening logs for $linebot...\n"
pm2 logs $linebot
