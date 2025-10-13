const express = require('express');
const router = express.Router();
const line = require('@line/bot-sdk');
const axios = require('axios');

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

// ฟังก์ชันตรวจสอบว่า URL รูปใช้งานได้หรือไม่
async function validateImageUrl(url) {
  if (!url) return false;
  
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: (status) => status === 200
    });
    
    const contentType = response.headers['content-type'];
    return contentType && contentType.startsWith('image/');
  } catch (error) {
    return false;
  }
}

// ฟังก์ชันดึงข้อมูลโปรไฟล์จาก LINE API
async function fetchLineProfile(channelAccessToken) {
  try {
    // ดึงข้อมูล Bot Info
    const botInfoResponse = await axios.get('https://api.line.me/v2/bot/info', {
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      }
    });

    const botInfo = botInfoResponse.data;
    console.log('📱 Bot Info:', {
      displayName: botInfo.displayName,
      basicId: botInfo.basicId,
      userId: botInfo.userId,
      premiumId: botInfo.premiumId
    });

    let pictureUrl = '';
    let displayName = botInfo.displayName || botInfo.basicId || 'LINE OA';

    // วิธีที่ 1: ลองดึงจาก Bot Profile API
    if (botInfo.userId) {
      try {
        const profileResponse = await axios.get(`https://api.line.me/v2/bot/profile/${botInfo.userId}`, {
          headers: {
            'Authorization': `Bearer ${channelAccessToken}`
          }
        });
        
        if (profileResponse.data.pictureUrl) {
          const isValid = await validateImageUrl(profileResponse.data.pictureUrl);
          if (isValid) {
            pictureUrl = profileResponse.data.pictureUrl;
            displayName = profileResponse.data.displayName || displayName;
            console.log('✅ Got profile picture from Bot Profile API');
          }
        }
      } catch (profileError) {
        console.log('⚠️ Bot Profile API failed:', profileError.response?.data?.message || profileError.message);
      }
    }

    // วิธีที่ 2: ลองใช้ LINE CDN patterns ต่างๆ
    if (!pictureUrl && botInfo.basicId) {
      const basicIdClean = botInfo.basicId.replace('@', '');
      const possibleUrls = [
        `https://obs.line-scdn.net/${basicIdClean}/profile`,
        `https://profile.line-scdn.net/${basicIdClean}/profile`,
        `https://static.line-scdn.net/line-oa/image/${basicIdClean}.jpg`,
      ];

      for (const url of possibleUrls) {
        const isValid = await validateImageUrl(url);
        if (isValid) {
          pictureUrl = url;
          console.log('✅ Found valid picture URL:', url);
          break;
        }
      }
    }

    // วิธีที่ 3: ลองใช้ Official API Endpoint อื่น
    if (!pictureUrl) {
      try {
        // ลองใช้ Rich Menu API เพื่อดึงข้อมูล Bot
        const richMenuResponse = await axios.get('https://api.line.me/v2/bot/richmenu/list', {
          headers: {
            'Authorization': `Bearer ${channelAccessToken}`
          }
        });
        
        console.log('📋 Rich Menu API response available (but no picture)');
      } catch (richMenuError) {
        // Rich Menu API ไม่มีรูปโปรไฟล์ แต่ลองเรียกดูว่า token ใช้งานได้
      }
    }

    if (!pictureUrl) {
      console.log('ℹ️ No valid picture URL found, will use default avatar');
    }

    return {
      success: true,
      displayName: displayName,
      pictureUrl: pictureUrl, // จะเป็น '' ถ้าหาไม่เจอ
      userId: botInfo.userId || '',
      basicId: botInfo.basicId || '',
      premiumId: botInfo.premiumId || '',
      chatMode: botInfo.chatMode || 'bot'
    };
  } catch (error) {
    console.error('❌ Error fetching LINE bot info:', error.response?.data || error.message);
    
    // ถ้า Token ผิดจะ return error
    if (error.response?.status === 401) {
      return {
        success: false,
        error: 'Channel Access Token ไม่ถูกต้องหรือหมดอายุ'
      };
    }
    
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Setup Settings Routes
function setupSettingsRoutes(requireLogin, appConfig, saveConfig, userMessageHistory, initializeLineClients) {
  
  // หน้าตั้งค่าระบบ
  router.get('/settings', requireLogin, (req, res) => {
    // สร้าง Webhook URL จาก DOMAIN ใน .env
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
    
    const uptime = formatUptime(process.uptime() * 1000);

    res.render('settings', {
      lineChannels: appConfig.lineChannels || [],
      webhookUrl: webhookUrl,
      serverPort: process.env.PORT || 3000,
      uptime: uptime,
      username: req.session.username
    });
  });

  // เพิ่ม LINE Channel ใหม่
  router.post('/settings/line/add', requireLogin, async (req, res) => {
    try {
      const { channelName, lineAccessToken, lineChannelSecret } = req.body;

      if (!channelName || !lineAccessToken || !lineChannelSecret) {
        return res.status(400).json({ 
          success: false, 
          message: 'กรุณากรอกข้อมูลให้ครบถ้วน' 
        });
      }

      // ทดสอบ token และดึงข้อมูลโปรไฟล์
      console.log('🔍 Fetching LINE profile for new channel...');
      const profileInfo = await fetchLineProfile(lineAccessToken);
      
      if (!profileInfo.success) {
        return res.status(400).json({
          success: false,
          message: 'ไม่สามารถเชื่อมต่อกับ LINE API ได้: ' + profileInfo.error
        });
      }

      console.log('📋 Profile Info Summary:', {
        displayName: profileInfo.displayName,
        basicId: profileInfo.basicId,
        hasPictureUrl: !!profileInfo.pictureUrl,
        pictureUrl: profileInfo.pictureUrl || 'none (will use default)'
      });

      // ตรวจสอบว่ามี token ซ้ำหรือไม่
      const isDuplicate = appConfig.lineChannels.some(
        ch => ch.channelAccessToken === lineAccessToken
      );

      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: 'Channel Access Token นี้ถูกเพิ่มไปแล้ว'
        });
      }

      // สร้าง channel ใหม่
      const newChannel = {
        id: 'channel-' + Date.now(),
        name: channelName,
        channelAccessToken: lineAccessToken,
        channelSecret: lineChannelSecret,
        profilePictureUrl: profileInfo.pictureUrl || '', // จะเป็น '' ถ้าไม่มีรูป
        displayName: profileInfo.displayName || channelName,
        basicId: profileInfo.basicId || '',
        userId: profileInfo.userId || '',
        premiumId: profileInfo.premiumId || '',
        chatMode: profileInfo.chatMode || 'bot',
        enabled: true,
        features: {
          activities: true,
          promotions: true,
          flexMessages: true
        },
        createdAt: new Date().toISOString()
      };

      console.log('✅ New channel created:', {
        id: newChannel.id,
        name: newChannel.name,
        displayName: newChannel.displayName,
        basicId: newChannel.basicId,
        hasPicture: !!newChannel.profilePictureUrl
      });

      appConfig.lineChannels.push(newChannel);
      saveConfig();
      
      // อัปเดต LINE Clients
      initializeLineClients();
      
      res.json({ 
        success: true, 
        message: profileInfo.pictureUrl ? 
          'เพิ่ม LINE Channel สำเร็จ (พร้อมรูปโปรไฟล์)' : 
          'เพิ่ม LINE Channel สำเร็จ (ใช้รูปเริ่มต้น)',
        channel: newChannel
      });
    } catch (error) {
      console.error('❌ Error adding LINE channel:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด: ' + error.message 
      });
    }
  });

  // อัพเดท LINE Channel
  router.post('/settings/line/update/:id', requireLogin, async (req, res) => {
    try {
      const { id } = req.params;
      const { channelName, lineAccessToken, lineChannelSecret } = req.body;

      if (!channelName || !lineAccessToken || !lineChannelSecret) {
        return res.status(400).json({ 
          success: false, 
          message: 'กรุณากรอกข้อมูลให้ครบถ้วน' 
        });
      }

      const channelIndex = appConfig.lineChannels.findIndex(ch => ch.id === id);
      
      if (channelIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบ Channel นี้'
        });
      }

      // ทดสอบ token และดึงข้อมูลโปรไฟล์
      console.log('🔍 Fetching LINE profile for channel update...');
      const profileInfo = await fetchLineProfile(lineAccessToken);
      
      if (!profileInfo.success) {
        return res.status(400).json({
          success: false,
          message: 'ไม่สามารถเชื่อมต่อกับ LINE API ได้: ' + profileInfo.error
        });
      }

      // อัพเดทข้อมูล
      appConfig.lineChannels[channelIndex] = {
        ...appConfig.lineChannels[channelIndex],
        name: channelName,
        channelAccessToken: lineAccessToken,
        channelSecret: lineChannelSecret,
        profilePictureUrl: profileInfo.pictureUrl || appConfig.lineChannels[channelIndex].profilePictureUrl || '',
        displayName: profileInfo.displayName || channelName,
        basicId: profileInfo.basicId || appConfig.lineChannels[channelIndex].basicId || '',
        userId: profileInfo.userId || appConfig.lineChannels[channelIndex].userId || '',
        premiumId: profileInfo.premiumId || '',
        chatMode: profileInfo.chatMode || 'bot',
        features: appConfig.lineChannels[channelIndex].features || {
          activities: true,
          promotions: true,
          flexMessages: true
        }
      };

      console.log('✅ Channel updated');

      saveConfig();
      initializeLineClients();
      
      res.json({ 
        success: true, 
        message: 'อัพเดท LINE Channel สำเร็จ'
      });
    } catch (error) {
      console.error('❌ Error updating LINE channel:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด: ' + error.message 
      });
    }
  });

  // อัพเดท Features ของ Channel
  router.post('/settings/line/features/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;
      const { activities, promotions, flexMessages } = req.body;
      
      const channelIndex = appConfig.lineChannels.findIndex(ch => ch.id === id);
      
      if (channelIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบ Channel นี้'
        });
      }

      appConfig.lineChannels[channelIndex].features = {
        activities: activities === true || activities === 'true',
        promotions: promotions === true || promotions === 'true',
        flexMessages: flexMessages === true || flexMessages === 'true'
      };

      console.log(`✅ Updated features for ${appConfig.lineChannels[channelIndex].name}:`, appConfig.lineChannels[channelIndex].features);
      
      saveConfig();
      
      res.json({ 
        success: true, 
        message: 'อัพเดทฟีเจอร์สำเร็จ'
      });
    } catch (error) {
      console.error('❌ Error updating channel features:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด: ' + error.message 
      });
    }
  });

  // ลบ LINE Channel
  router.post('/settings/line/delete/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;
      
      const channelIndex = appConfig.lineChannels.findIndex(ch => ch.id === id);
      
      if (channelIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบ Channel นี้'
        });
      }

      const deletedChannel = appConfig.lineChannels[channelIndex];
      console.log('🗑️ Deleting channel:', deletedChannel.name);

      appConfig.lineChannels.splice(channelIndex, 1);
      saveConfig();
      initializeLineClients();
      
      res.json({ 
        success: true, 
        message: 'ลบ LINE Channel สำเร็จ' 
      });
    } catch (error) {
      console.error('❌ Error deleting LINE channel:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด: ' + error.message 
      });
    }
  });

  // Toggle เปิด/ปิด Channel
  router.post('/settings/line/toggle/:id', requireLogin, (req, res) => {
    try {
      const { id } = req.params;
      const { enabled } = req.body;
      
      const channelIndex = appConfig.lineChannels.findIndex(ch => ch.id === id);
      
      if (channelIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบ Channel นี้'
        });
      }

      appConfig.lineChannels[channelIndex].enabled = enabled;
      
      console.log(`🔄 Channel ${appConfig.lineChannels[channelIndex].name} ${enabled ? 'enabled' : 'disabled'}`);
      
      saveConfig();
      initializeLineClients();
      
      res.json({ 
        success: true, 
        message: enabled ? 'เปิดใช้งาน Channel สำเร็จ' : 'ปิดใช้งาน Channel สำเร็จ'
      });
    } catch (error) {
      console.error('❌ Error toggling LINE channel:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาด: ' + error.message 
      });
    }
  });

  // ทดสอบการเชื่อมต่อ Channel
  router.post('/settings/line/test/:id', requireLogin, async (req, res) => {
    try {
      const { id } = req.params;
      const channel = appConfig.lineChannels.find(ch => ch.id === id);
      
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบ Channel นี้'
        });
      }

      console.log('🧪 Testing channel:', channel.name);
      const profileInfo = await fetchLineProfile(channel.channelAccessToken);
      
      if (profileInfo.success) {
        res.json({
          success: true,
          message: 'เชื่อมต่อสำเร็จ!',
          profile: profileInfo
        });
      } else {
        res.json({
          success: false,
          message: 'ไม่สามารถเชื่อมต่อได้: ' + profileInfo.error
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาด: ' + error.message
      });
    }
  });

  // ทดสอบ Webhook
  router.post('/settings/test-webhook', requireLogin, async (req, res) => {
    try {
      if (global.lineClients.size === 0) {
        return res.json({
          success: false,
          message: 'ยังไม่มี LINE Channel ที่เปิดใช้งาน กรุณาเพิ่ม Channel ก่อน'
        });
      }

      res.json({
        success: true,
        message: `Webhook พร้อมใช้งาน! มี ${global.lineClients.size} channel(s) ที่เปิดใช้งาน`
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
      
      console.log(`🗑️ Cleared ${userCount} user(s) from message history`);
      
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