const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// ฟังก์ชันคำนวณเวลาที่เหลือ
function getRemainingTime(userId, activityId, userMessageHistory, activities) {
  const key = `${userId}_${activityId}`;
  const lastSentTime = userMessageHistory.get(key);
  if (!lastSentTime) return 0;
  
  const activity = activities.find(a => a.id === activityId);
  if (!activity) return 0;
  
  const currentTime = Date.now();
  const timeDiff = currentTime - lastSentTime;
  const cooldownPeriod = activity.cooldownHours * 60 * 60 * 1000;
  const remaining = cooldownPeriod - timeDiff;
  
  return remaining > 0 ? remaining : 0;
}

// ฟังก์ชันแปลงมิลลิวินาทีเป็นชั่วโมงและนาที
function formatTime(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours} ชั่วโมง ${minutes} นาที`;
}

// Dashboard Route
function setupDashboardRoute(requireLogin, appConfig, userMessageHistory, promotionsConfig, broadcastHistory) {
  router.get('/', requireLogin, (req, res) => {
    // ตรวจสอบและสร้าง activities array ถ้ายังไม่มี
    if (!appConfig.activities) {
      appConfig.activities = [];
    }

    // นับจำนวนผู้ใช้ทั้งหมดจาก userMessageHistory
    const allUsers = new Set();
    userMessageHistory.forEach((timestamp, key) => {
      const userId = key.split('_')[0];
      allUsers.add(userId);
    });

    // สร้างข้อมูลผู้ใช้ล่าสุด 5 คน
    const recentUsersMap = new Map();
    
    userMessageHistory.forEach((timestamp, key) => {
      const [userId, activityId] = key.split('_');
      
      if (!recentUsersMap.has(userId) || recentUsersMap.get(userId).timestamp < timestamp) {
        const activity = appConfig.activities.find(a => a.id === activityId);
        const activityName = activity ? activity.name : 'ไม่ทราบ';
        
        const remaining = getRemainingTime(userId, activityId, userMessageHistory, appConfig.activities);
        const canSend = remaining === 0;
        
        recentUsersMap.set(userId, {
          userId,
          activityName,
          lastSent: new Date(timestamp).toLocaleString('th-TH'),
          timestamp,
          canSend,
          remainingTime: canSend ? 'สามารถส่งได้' : formatTime(remaining)
        });
      }
    });

    // แปลง Map เป็น Array และเรียงตามเวลาล่าสุด
    const recentUsers = Array.from(recentUsersMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    // สร้าง Webhook URL
    const domain = process.env.DOMAIN;
    let webhookUrl;
    
    if (domain) {
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      webhookUrl = `${protocol}://${domain}/webhook`;
    } else {
      const protocol = req.protocol;
      const host = req.get('host');
      webhookUrl = `${protocol}://${host}/webhook`;
    }

    // นับจำนวน channel ที่เปิดใช้งาน
    const activeChannels = (appConfig.lineChannels || []).filter(ch => ch.enabled).length;
    const totalChannels = (appConfig.lineChannels || []).length;
    
    // นับจำนวนกิจกรรม
    const totalActivities = appConfig.activities.length;
    const enabledActivities = appConfig.activities.filter(a => a.enabled).length;
    
    // รวม keywords จากทุกกิจกรรม
    const allActivityKeywords = new Set();
    appConfig.activities.forEach(activity => {
      if (activity.enabled && activity.keywords) {
        activity.keywords.forEach(k => allActivityKeywords.add(k));
      }
    });
    
    // นับจำนวน message boxes ทั้งหมด
    let totalMessageBoxes = 0;
    appConfig.activities.forEach(activity => {
      if (activity.messageBoxes && Array.isArray(activity.messageBoxes)) {
        totalMessageBoxes += activity.messageBoxes.length;
      } else if (activity.message) {
        totalMessageBoxes += 1;
      }
    });

    // นับสถิติ Broadcast
    const totalBroadcasts = broadcastHistory ? broadcastHistory.length : 0;
    const successfulBroadcasts = broadcastHistory ? broadcastHistory.filter(b => b.status === 'success').length : 0;
    const scheduledBroadcasts = broadcastHistory ? broadcastHistory.filter(b => b.status === 'scheduled').length : 0;
    const totalBroadcastRecipients = broadcastHistory ? broadcastHistory.reduce((sum, b) => sum + (b.targetCount || 0), 0) : 0;
    
    res.render('dashboard', { 
      totalUsers: allUsers.size,
      totalActivities: totalActivities,
      enabledActivities: enabledActivities,
      totalPromotions: promotionsConfig.flexMessages.length,
      totalMessageBoxes: totalMessageBoxes,
      totalBroadcasts: totalBroadcasts,
      successfulBroadcasts: successfulBroadcasts,
      scheduledBroadcasts: scheduledBroadcasts,
      totalBroadcastRecipients: totalBroadcastRecipients,
      lineConfigured: global.isLineConfigured,
      activeChannels: activeChannels,
      totalChannels: totalChannels,
      webhookUrl: webhookUrl,
      activityKeywordsList: Array.from(allActivityKeywords).join(', ') || 'ไม่มีคีย์เวิร์ด',
      promotionKeywordsList: promotionsConfig.promotionSettings.keywords.join(', '),
      recentUsers: recentUsers,
      activities: appConfig.activities.filter(a => a.enabled).slice(0, 5),
      username: req.session.username
    });
  });

  return router;
}

module.exports = { setupDashboardRoute };