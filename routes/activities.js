const express = require('express');
const router = express.Router();

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

// ฟังก์ชัน validate message boxes
function validateMessageBoxes(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    return { valid: false, error: 'ต้องมีอย่างน้อย 1 message box' };
  }

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    
    if (!box.type || !['text', 'image', 'flex'].includes(box.type)) {
      return { valid: false, error: `Message box ${i + 1}: ประเภทข้อความไม่ถูกต้อง` };
    }

    if (box.type === 'text' && (!box.content || box.content.trim() === '')) {
      return { valid: false, error: `Message box ${i + 1}: กรุณากรอกข้อความ` };
    }

    if (box.type === 'image' && (!box.content || !box.content.trim().startsWith('http'))) {
      return { valid: false, error: `Message box ${i + 1}: กรุณากรอก URL รูปภาพที่ถูกต้อง` };
    }

    if (box.type === 'flex') {
      if (!box.content || box.content.trim() === '') {
        return { valid: false, error: `Message box ${i + 1}: กรุณากรอก Flex Message JSON` };
      }
      try {
        const flexJson = JSON.parse(box.content);
        if (!flexJson.type || !flexJson.body) {
          return { valid: false, error: `Message box ${i + 1}: Flex JSON ต้องมี type และ body` };
        }
      } catch (e) {
        return { valid: false, error: `Message box ${i + 1}: Flex JSON ไม่ถูกต้อง - ${e.message}` };
      }
    }
  }

  return { valid: true };
}

// Setup Activities Routes
function setupActivitiesRoutes(requireLogin, appConfig, userMessageHistory, saveConfig) {
  
  // หน้างิจกรรมแชร์
  router.get('/activities', requireLogin, (req, res) => {
    // ตรวจสอบและสร้าง activities array ถ้ายังไม่มี
    if (!appConfig.activities) {
      appConfig.activities = [];
      saveConfig();
    }

    // นับจำนวนผู้ใช้ทั้งหมด
    const allUsers = new Set();
    userMessageHistory.forEach((timestamp, key) => {
      const userId = key.split('_')[0];
      allUsers.add(userId);
    });

    // สร้างข้อมูลสำหรับแต่ละกิจกรรม
    const activitiesData = appConfig.activities.map(activity => {
      const users = [];
      allUsers.forEach(userId => {
        const key = `${userId}_${activity.id}`;
        const timestamp = userMessageHistory.get(key);
        
        if (timestamp) {
          const date = new Date(timestamp);
          const remaining = getRemainingTime(userId, activity.id, userMessageHistory, appConfig.activities);
          const canSend = remaining === 0;
          
          users.push({
            userId,
            lastSent: date.toLocaleString('th-TH'),
            canSend,
            remainingTime: canSend ? 'สามารถส่งได้' : formatTime(remaining)
          });
        }
      });

      // เรียงตามเวลาล่าสุด
      users.sort((a, b) => new Date(b.lastSent) - new Date(a.lastSent));

      return {
        ...activity,
        users,
        usersCanSend: users.filter(u => u.canSend).length
      };
    });

    res.render('activities', { 
      activities: activitiesData,
      lineChannels: appConfig.lineChannels || [],
      totalUsers: allUsers.size,
      username: req.session.username
    });
  });

  // เพิ่มกิจกรรมใหม่
  router.post('/activities/add', requireLogin, (req, res) => {
    try {
      const { name, messageBoxes, cooldownMessage, keywords, cooldownHours, channels, useCooldown, allowSharedKeywords } = req.body;

      if (!name || !messageBoxes || !keywords) {
        return res.status(400).json({ 
          success: false, 
          message: 'กรุณากรอกข้อมูลให้ครบถ้วน' 
        });
      }

      // Parse message boxes
      let parsedBoxes;
      try {
        parsedBoxes = typeof messageBoxes === 'string' ? JSON.parse(messageBoxes) : messageBoxes;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'รูปแบบ message boxes ไม่ถูกต้อง'
        });
      }

      // Validate message boxes
      const validation = validateMessageBoxes(parsedBoxes);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error
        });
      }

      if (!appConfig.activities) {
        appConfig.activities = [];
      }

      const newActivity = {
        id: 'activity-' + Date.now(),
        name: name.trim(),
        enabled: true,
        useCooldown: useCooldown === true || useCooldown === 'true',
        allowSharedKeywords: allowSharedKeywords === true || allowSharedKeywords === 'true',
        messageBoxes: parsedBoxes, // เปลี่ยนจาก message เป็น messageBoxes
        cooldownMessage: cooldownMessage?.trim() || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊",
        keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
        cooldownHours: parseFloat(cooldownHours) || 2,
        channels: Array.isArray(channels) ? channels : (channels ? [channels] : []),
        createdAt: new Date().toISOString()
      };

      appConfig.activities.push(newActivity);
      saveConfig();

      res.json({ 
        success: true, 
        message: 'เพิ่มกิจกรรมสำเร็จ',
        activity: newActivity
      });
    } catch (error) {
      console.error('Error adding activity:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการเพิ่มกิจกรรม: ' + error.message
      });
    }
  });

  // อัพเดทกิจกรรม
  router.post('/activities/update/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;
      const { name, messageBoxes, cooldownMessage, keywords, cooldownHours, channels, useCooldown, allowSharedKeywords } = req.body;

      if (!appConfig.activities) {
        appConfig.activities = [];
      }

      const activityIndex = appConfig.activities.findIndex(a => a.id === id);
      
      if (activityIndex === -1) {
        return res.status(404).json({ 
          success: false, 
          message: 'ไม่พบกิจกรรมนี้' 
        });
      }

      // Parse message boxes
      let parsedBoxes;
      try {
        parsedBoxes = typeof messageBoxes === 'string' ? JSON.parse(messageBoxes) : messageBoxes;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'รูปแบบ message boxes ไม่ถูกต้อง'
        });
      }

      // Validate message boxes
      const validation = validateMessageBoxes(parsedBoxes);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error
        });
      }

      appConfig.activities[activityIndex] = {
        ...appConfig.activities[activityIndex],
        name: name.trim(),
        useCooldown: useCooldown === true || useCooldown === 'true',
        allowSharedKeywords: allowSharedKeywords === true || allowSharedKeywords === 'true',
        messageBoxes: parsedBoxes, // เปลี่ยนจาก message เป็น messageBoxes
        cooldownMessage: cooldownMessage?.trim() || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊",
        keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
        cooldownHours: parseFloat(cooldownHours) || 2,
        channels: Array.isArray(channels) ? channels : (channels ? [channels] : [])
      };

      saveConfig();

      res.json({ 
        success: true, 
        message: 'อัพเดทกิจกรรมสำเร็จ' 
      });
    } catch (error) {
      console.error('Error updating activity:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการอัพเดท: ' + error.message
      });
    }
  });

  // ลบกิจกรรม
  router.post('/activities/delete/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;

      if (!appConfig.activities) {
        appConfig.activities = [];
      }

      const activityIndex = appConfig.activities.findIndex(a => a.id === id);
      
      if (activityIndex === -1) {
        return res.status(404).json({ 
          success: false, 
          message: 'ไม่พบกิจกรรมนี้' 
        });
      }

      const deletedActivity = appConfig.activities[activityIndex];
      appConfig.activities.splice(activityIndex, 1);
      
      // ลบประวัติการส่งข้อความของกิจกรรมนี้
      const keysToDelete = [];
      userMessageHistory.forEach((value, key) => {
        if (key.includes(id)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => userMessageHistory.delete(key));

      saveConfig();

      res.json({ 
        success: true, 
        message: `ลบกิจกรรม "${deletedActivity.name}" สำเร็จ` 
      });
    } catch (error) {
      console.error('Error deleting activity:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการลบ' 
      });
    }
  });

  // เปิด/ปิดกิจกรรม
  router.post('/activities/toggle/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;
      const { enabled } = req.body;

      if (!appConfig.activities) {
        appConfig.activities = [];
      }

      const activityIndex = appConfig.activities.findIndex(a => a.id === id);
      
      if (activityIndex === -1) {
        return res.status(404).json({ 
          success: false, 
          message: 'ไม่พบกิจกรรมนี้' 
        });
      }

      appConfig.activities[activityIndex].enabled = enabled;
      saveConfig();

      res.json({ 
        success: true, 
        message: enabled ? 'เปิดใช้งานกิจกรรมสำเร็จ' : 'ปิดใช้งานกิจกรรมสำเร็จ' 
      });
    } catch (error) {
      console.error('Error toggling activity:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด' 
      });
    }
  });

  // ล้างข้อมูลผู้ใช้ของกิจกรรม
  router.post('/activities/clear-users/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;
      
      let count = 0;
      const keysToDelete = [];
      
      userMessageHistory.forEach((value, key) => {
        if (key.includes(id)) {
          keysToDelete.push(key);
          count++;
        }
      });
      
      keysToDelete.forEach(key => userMessageHistory.delete(key));

      res.json({ 
        success: true, 
        message: `ล้างข้อมูลผู้ใช้ ${count} คนสำเร็จ` 
      });
    } catch (error) {
      console.error('Error clearing users:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด' 
      });
    }
  });

  return router;
}

module.exports = { setupActivitiesRoutes };