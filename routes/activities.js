const express = require('express');
const router = express.Router();

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

// Setup Activities Routes
function setupActivitiesRoutes(requireLogin, appConfig, userMessageHistory, getCooldownPeriod, saveConfig) {
  
  // หน้ากิจกรรมแชร์
  router.get('/activities', requireLogin, (req, res) => {
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

    // นับจำนวนผู้ใช้ที่พร้อมรับ
    const usersCanSend = users.filter(u => u.canSend).length;
    
    res.render('activities', { 
      users,
      totalUsers: users.length,
      usersCanSend,
      activityMessage: appConfig.botSettings.activityMessage,
      cooldownMessage: appConfig.botSettings.cooldownMessage || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊",
      keywords: appConfig.botSettings.keywords.join(', '),
      cooldownHours: appConfig.botSettings.cooldownHours,
      username: req.session.username
    });
  });

  // อัพเดทการตั้งค่ากิจกรรม
  router.post('/activities/update', requireLogin, (req, res) => {
    try {
      const { activityMessage, cooldownMessage, keywords, cooldownHours } = req.body;
      
      // อัพเดทการตั้งค่า
      appConfig.botSettings.activityMessage = activityMessage;
      appConfig.botSettings.cooldownMessage = cooldownMessage || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊";
      appConfig.botSettings.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
      appConfig.botSettings.cooldownHours = parseFloat(cooldownHours) || 2;
      
      // บันทึกลง config.json
      saveConfig();
      
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      console.error('Error updating activity settings:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
  });

  return router;
}

module.exports = { setupActivitiesRoutes };