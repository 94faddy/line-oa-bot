const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// ฟังก์ชันคำนวณเวลาที่เหลือ
function getRemainingTime(userId, userMessageHistory, getCooldownPeriod) {
  const lastSentTime = userMessageHistory.get(userId);
  if (!lastSentTime) return 0;
  
  const currentTime = Date.now();
  const timeDiff = currentTime - lastSentTime;
  const remaining = getCooldownPeriod() - timeDiff;
  
  return remaining > 0 ? remaining : 0;
}

// ฟังก์ชันแปลงมิลลิวินาทีเป็นชั่วโมงและนาที
function formatTime(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours} ชั่วโมง ${minutes} นาที`;
}

// Dashboard Route
function setupDashboardRoute(requireLogin, appConfig, userMessageHistory, getCooldownPeriod, promotionsConfig) {
  router.get('/', requireLogin, (req, res) => {
    // ดึงข้อมูลผู้ใช้
    const users = Array.from(userMessageHistory.entries()).map(([userId, timestamp]) => {
      const date = new Date(timestamp);
      const remaining = getRemainingTime(userId, userMessageHistory, getCooldownPeriod);
      const canSend = remaining === 0;
      
      return {
        userId,
        lastSent: date.toLocaleString('th-TH'),
        canSend,
        remainingTime: canSend ? 'สามารถส่งได้' : formatTime(remaining)
      };
    });

    // เรียงตามเวลาล่าสุด
    users.sort((a, b) => new Date(b.lastSent) - new Date(a.lastSent));

    // ดึงผู้ใช้ 5 คนล่าสุด
    const recentUsers = users.slice(0, 5);

    // สร้าง Webhook URL
    const domain = process.env.DOMAIN;
    let webhookUrl;
    
    if (domain) {
      // ใช้ domain จาก .env
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      webhookUrl = `${protocol}://${domain}/webhook`;
    } else {
      // Fallback ถ้าไม่มี DOMAIN ใน .env
      const protocol = req.protocol;
      const host = req.get('host');
      webhookUrl = `${protocol}://${host}/webhook`;
    }

    // นับจำนวน channel ที่เปิดใช้งาน
    const activeChannels = (appConfig.lineChannels || []).filter(ch => ch.enabled).length;
    const totalChannels = (appConfig.lineChannels || []).length;
    
    res.render('dashboard', { 
      totalUsers: users.length,
      activityKeywords: appConfig.botSettings.keywords.length,
      totalPromotions: promotionsConfig.flexMessages.length,
      cooldownHours: appConfig.botSettings.cooldownHours,
      lineConfigured: global.isLineConfigured,
      activeChannels: activeChannels,
      totalChannels: totalChannels,
      webhookUrl: webhookUrl,
      activityKeywordsList: appConfig.botSettings.keywords.join(', '),
      promotionKeywordsList: promotionsConfig.promotionSettings.keywords.join(', '),
      recentUsers: recentUsers,
      username: req.session.username
    });
  });

  return router;
}

module.exports = { setupDashboardRoute };