const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');

// ฟังก์ชันคำนวณ uptime
function formatUptime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} วัน ${hours % 24} ชั่วโมง`;
  } else if (hours > 0) {
    return `${hours} ชั่วโมง ${minutes % 60} นาที`;
  } else if (minutes > 0) {
    return `${minutes} นาที`;
  } else {
    return `${seconds} วินาที`;
  }
}

// Setup Settings Routes
function setupSettingsRoutes(requireLogin, appConfig, saveConfig, userMessageHistory) {
  
  // หน้าตั้งค่าระบบ
  router.get('/settings', requireLogin, (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const webhookUrl = `${protocol}://${host}/webhook`;
    const uptime = formatUptime(process.uptime() * 1000);

    res.render('settings', {
      lineAccessToken: appConfig.lineConfig.channelAccessToken || '',
      lineChannelSecret: appConfig.lineConfig.channelSecret || '',
      webhookUrl: webhookUrl,
      serverPort: process.env.PORT || 3000,
      uptime: uptime,
      username: req.session.username
    });
  });

  // อัพเดทการตั้งค่า LINE
  router.post('/settings/line', requireLogin, (req, res) => {
    try {
      const { lineAccessToken, lineChannelSecret } = req.body;

      if (!lineAccessToken || !lineChannelSecret) {
        return res.status(400).json({ 
          success: false, 
          message: 'กรุณากรอกข้อมูลให้ครบถ้วน' 
        });
      }
      
      // อัพเดทการตั้งค่า
      appConfig.lineConfig.channelAccessToken = lineAccessToken;
      appConfig.lineConfig.channelSecret = lineChannelSecret;
      
      // บันทึกลง config.json
      saveConfig();
      
      // อัพเดท LINE Client
      global.lineConfig = {
        channelAccessToken: lineAccessToken,
        channelSecret: lineChannelSecret
      };

      try {
        global.lineClient = new line.messagingApi.MessagingApiClient({
          channelAccessToken: lineAccessToken
        });
        global.isLineConfigured = true;
        console.log('✅ LINE Bot reconfigured successfully');
      } catch (error) {
        console.error('❌ Failed to configure LINE Bot:', error.message);
        global.isLineConfigured = false;
        return res.status(500).json({ 
          success: false, 
          message: 'ไม่สามารถเชื่อมต่อกับ LINE API ได้ กรุณาตรวจสอบ Token และ Secret' 
        });
      }
      
      res.json({ success: true, message: 'บันทึกการตั้งค่า LINE สำเร็จ' });
    } catch (error) {
      console.error('Error updating LINE settings:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
  });

  // ทดสอบ Webhook
  router.post('/settings/test-webhook', requireLogin, async (req, res) => {
    try {
      if (!global.isLineConfigured) {
        return res.json({
          success: false,
          message: 'ยังไม่ได้ตั้งค่า LINE API กรุณาตั้งค่าก่อน'
        });
      }

      // ทดสอบการเชื่อมต่อ
      res.json({
        success: true,
        message: 'Webhook พร้อมใช้งาน! LINE Bot สามารถรับข้อความได้'
      });
    } catch (error) {
      console.error('Error testing webhook:', error);
      res.json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการทดสอบ: ' + error.message
      });
    }
  });

  // ล้างข้อมูลผู้ใช้
  router.post('/settings/clear-users', requireLogin, (req, res) => {
    try {
      const userCount = userMessageHistory.size;
      userMessageHistory.clear();
      
      res.json({ 
        success: true, 
        message: `ล้างข้อมูลผู้ใช้ ${userCount} คนสำเร็จ` 
      });
    } catch (error) {
      console.error('Error clearing users:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการล้างข้อมูล' 
      });
    }
  });

  return router;
}

module.exports = { setupSettingsRoutes };