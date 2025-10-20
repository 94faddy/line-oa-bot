const express = require('express');
const router = express.Router();
const axios = require('axios');

// ใช้ global.broadcastHistory แทนตัวแปรท้องถิ่น
if (!global.broadcastHistory) {
  global.broadcastHistory = [];
}

// ฟังก์ชันส่ง Broadcast Message (ส่งไปทุกคน)
async function sendBroadcastMessage(channelAccessToken, messages) {
  try {
    const url = 'https://api.line.me/v2/bot/message/broadcast';
    
    const response = await axios.post(url, { messages: messages }, {
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('Error sending broadcast:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ฟังก์ชันส่ง Multicast Message (ส่งไปเฉพาะ User ID ที่กำหนด)
async function sendMulticastMessage(channelAccessToken, userIds, messages) {
  try {
    const url = 'https://api.line.me/v2/bot/message/multicast';
    
    const response = await axios.post(url, { 
      to: userIds,
      messages: messages 
    }, {
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('Error sending multicast:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ฟังก์ชันดึง Followers (แบบ Pagination) - สำหรับ Verified Account เท่านั้น
async function getFollowers(channelAccessToken, start = null, limit = 300) {
  try {
    let url = `https://api.line.me/v2/bot/followers/ids?limit=${limit}`;
    if (start) {
      url += `&start=${start}`;
    }
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      }
    });
    
    return {
      success: true,
      userIds: response.data.userIds || [],
      next: response.data.next || null
    };
  } catch (error) {
    // ไม่ log error สำหรับ Free Plan
    const errorMsg = error.response?.data?.message || error.message;
    if (!errorMsg.includes('not available')) {
      console.error('Error fetching followers:', error.response?.data || error.message);
    }
    return {
      success: false,
      error: errorMsg,
      userIds: [],
      next: null
    };
  }
}

// ฟังก์ชันดึงจำนวน Followers ทั้งหมด
async function getAllFollowers(channelAccessToken, maxUsers = null) {
  const allUserIds = [];
  let start = null;
  let hasMore = true;
  
  while (hasMore) {
    const result = await getFollowers(channelAccessToken, start, 300);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        userIds: allUserIds
      };
    }
    
    allUserIds.push(...result.userIds);
    
    // ถ้ากำหนด maxUsers และได้ครบแล้ว ให้หยุด
    if (maxUsers && allUserIds.length >= maxUsers) {
      return {
        success: true,
        userIds: allUserIds.slice(0, maxUsers)
      };
    }
    
    if (result.next) {
      start = result.next;
    } else {
      hasMore = false;
    }
  }
  
  return {
    success: true,
    userIds: allUserIds
  };
}

// Setup Broadcast Routes
function setupBroadcastRoutes(requireLogin, appConfig) {
  
  // หน้า Broadcast
  router.get('/broadcast', requireLogin, (req, res) => {
    res.render('broadcast', {
      lineChannels: appConfig.lineChannels || [],
      broadcastHistory: global.broadcastHistory.slice().reverse().slice(0, 50),
      username: req.session.username
    });
  });

  // API: ดึงจำนวน Followers (ใช้ได้เฉพาะ Verified Account)
  router.post('/broadcast/get-followers-count', requireLogin, async (req, res) => {
    try {
      const { channelId } = req.body;

      if (!channelId) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาเลือก Channel'
        });
      }

      const channel = appConfig.lineChannels.find(ch => ch.id === channelId);
      
      if (!channel || !channel.enabled) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบ Channel หรือ Channel ถูกปิดการใช้งาน'
        });
      }

      // ดึง Followers ทั้งหมด
      const result = await getAllFollowers(channel.channelAccessToken);

      if (result.success) {
        return res.json({
          success: true,
          count: result.userIds.length,
          message: `พบ Followers ทั้งหมด ${result.userIds.length} คน`
        });
      }

      // ถ้า API ไม่รองรับ (Free Plan)
      if (result.error && result.error.includes('not available')) {
        return res.json({
          success: false,
          message: '⚠️ LINE Free Plan ไม่รองรับ Followers API\n\n' +
                   'คุณสามารถ:\n' +
                   '• ใช้ Broadcast ส่งไปทุกคน (300 ข้อความ/เดือน)\n' +
                   '• อัพเกรดเป็น Verified Account เพื่อใช้ Multicast',
          hint: 'free_plan'
        });
      }

      return res.json({
        success: false,
        message: 'ไม่สามารถดึงข้อมูล Followers ได้: ' + (result.error || 'Unknown error')
      });
    } catch (error) {
      console.error('Error in get-followers-count:', error);
      res.json({
        success: false,
        message: 'เกิดข้อผิดพลาด: ' + error.message
      });
    }
  });

  // API: ส่ง Broadcast ทันที
  router.post('/broadcast/send-now', requireLogin, async (req, res) => {
    try {
      const { channelId, messageBoxes, estimatedFollowers, sendType } = req.body;

      if (!channelId || !messageBoxes || messageBoxes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
        });
      }

      const channel = appConfig.lineChannels.find(ch => ch.id === channelId);
      
      if (!channel || !channel.enabled) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบ Channel หรือ Channel ถูกปิดการใช้งาน'
        });
      }

      // แปลง messageBoxes เป็น LINE messages
      const lineMessages = [];
      
      for (const box of messageBoxes) {
        try {
          if (box.type === 'text' && box.content.trim()) {
            lineMessages.push({
              type: 'text',
              text: box.content.trim()
            });
          } else if (box.type === 'image' && box.content.trim()) {
            lineMessages.push({
              type: 'image',
              originalContentUrl: box.content.trim(),
              previewImageUrl: box.content.trim()
            });
          } else if (box.type === 'flex' && box.content.trim()) {
            const flexJson = JSON.parse(box.content);
            lineMessages.push({
              type: 'flex',
              altText: box.altText || 'Flex Message',
              contents: flexJson
            });
          }
        } catch (error) {
          console.error('Error parsing message box:', error);
          return res.status(400).json({
            success: false,
            message: 'รูปแบบข้อความไม่ถูกต้อง: ' + error.message
          });
        }
      }

      if (lineMessages.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'ไม่มีข้อความที่ถูกต้องสำหรับส่ง'
        });
      }

      let result;
      let actualCount;

      // เลือกวิธีส่งตาม sendType
      if (sendType === 'multicast' && estimatedFollowers) {
        // ส่งแบบ Multicast (ส่งตามจำนวนที่กำหนด)
        const targetCount = parseInt(estimatedFollowers);
        
        if (targetCount > 500) {
          return res.status(400).json({
            success: false,
            message: 'Multicast สามารถส่งได้สูงสุด 500 คนต่อครั้ง กรุณาใช้ Broadcast สำหรับจำนวนมาก'
          });
        }

        // ดึง Followers
        const followersResult = await getAllFollowers(channel.channelAccessToken, targetCount);
        
        if (!followersResult.success) {
          return res.status(400).json({
            success: false,
            message: '⚠️ ไม่สามารถใช้ Multicast ได้\n\n' +
                     'LINE Free Plan ไม่รองรับ Followers API\n' +
                     'กรุณาใช้ Broadcast แทน หรืออัพเกรดเป็น Verified Account'
          });
        }
        
        if (followersResult.userIds.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'ไม่พบ Followers ในบัญชีนี้'
          });
        }

        actualCount = followersResult.userIds.length;

        // ส่ง Multicast
        result = await sendMulticastMessage(
          channel.channelAccessToken, 
          followersResult.userIds, 
          lineMessages
        );
      } else {
        // ส่งแบบ Broadcast (ส่งไปทุกคน)
        result = await sendBroadcastMessage(channel.channelAccessToken, lineMessages);
        actualCount = estimatedFollowers || 'ทั้งหมด';
      }

      if (!result.success) {
        // ตรวจสอบ error
        const errorMessage = result.error.toLowerCase();
        if (errorMessage.includes('monthly limit') || errorMessage.includes('quota')) {
          return res.json({
            success: false,
            message: '❌ เกินโควต้าการส่งข้อความประจำเดือน\n\n' +
                     '📊 LINE Free Plan:\n' +
                     '• ส่งได้ 300 ข้อความ/เดือน\n' +
                     '• รอเดือนถัดไป หรืออัพเกรด Plan\n\n' +
                     '💡 ตรวจสอบโควต้าที่: LINE Official Account Manager'
          });
        }
        
        return res.json({
          success: false,
          message: 'ส่งข้อความไม่สำเร็จ: ' + result.error
        });
      }

      // บันทึกประวัติ
      const historyItem = {
        id: 'broadcast-' + Date.now(),
        channelId: channel.id,
        channelName: channel.name,
        targetType: sendType === 'multicast' ? 'multicast' : 'broadcast',
        targetCount: actualCount,
        messageCount: lineMessages.length,
        status: 'success',
        sentAt: new Date().toISOString(),
        scheduledFor: null
      };
      
      global.broadcastHistory.push(historyItem);

      const displayCount = typeof actualCount === 'number' ? actualCount.toLocaleString() : actualCount;

      res.json({
        success: true,
        message: `✅ ส่ง ${sendType === 'multicast' ? 'Multicast' : 'Broadcast'} สำเร็จ!\nส่งไปยัง ${displayCount} คน`,
        data: historyItem
      });
    } catch (error) {
      console.error('Error in send-now:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาด: ' + error.message
      });
    }
  });

  // API: ตั้งเวลาส่ง Broadcast
  router.post('/broadcast/schedule', requireLogin, async (req, res) => {
    try {
      const { channelId, messageBoxes, scheduledTime, estimatedFollowers, sendType } = req.body;

      if (!channelId || !messageBoxes || messageBoxes.length === 0 || !scheduledTime) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
        });
      }

      const channel = appConfig.lineChannels.find(ch => ch.id === channelId);
      
      if (!channel || !channel.enabled) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบ Channel หรือ Channel ถูกปิดการใช้งาน'
        });
      }

      const scheduleDate = new Date(scheduledTime);
      const now = new Date();

      if (scheduleDate <= now) {
        return res.status(400).json({
          success: false,
          message: 'เวลาที่ตั้งต้องอยู่ในอนาคต'
        });
      }

      // บันทึกประวัติ
      const historyItem = {
        id: 'broadcast-' + Date.now(),
        channelId: channel.id,
        channelName: channel.name,
        targetType: sendType === 'multicast' ? 'multicast' : 'broadcast',
        targetCount: estimatedFollowers || 'ทั้งหมด',
        messageCount: messageBoxes.length,
        messageBoxes: messageBoxes,
        status: 'scheduled',
        scheduledFor: scheduledTime,
        createdAt: new Date().toISOString(),
        sendType: sendType
      };
      
      global.broadcastHistory.push(historyItem);

      // ตั้งเวลาส่ง
      const delay = scheduleDate.getTime() - now.getTime();
      setTimeout(async () => {
        try {
          // แปลง messageBoxes เป็น LINE messages
          const lineMessages = [];
          
          for (const box of messageBoxes) {
            try {
              if (box.type === 'text' && box.content.trim()) {
                lineMessages.push({
                  type: 'text',
                  text: box.content.trim()
                });
              } else if (box.type === 'image' && box.content.trim()) {
                lineMessages.push({
                  type: 'image',
                  originalContentUrl: box.content.trim(),
                  previewImageUrl: box.content.trim()
                });
              } else if (box.type === 'flex' && box.content.trim()) {
                const flexJson = JSON.parse(box.content);
                lineMessages.push({
                  type: 'flex',
                  altText: box.altText || 'Flex Message',
                  contents: flexJson
                });
              }
            } catch (error) {
              console.error('Error parsing scheduled message box:', error);
            }
          }

          if (lineMessages.length === 0) {
            throw new Error('ไม่มีข้อความที่ถูกต้องสำหรับส่ง');
          }

          let result;
          
          if (sendType === 'multicast' && estimatedFollowers) {
            const targetCount = parseInt(estimatedFollowers);
            const followersResult = await getAllFollowers(channel.channelAccessToken, targetCount);
            
            if (followersResult.success && followersResult.userIds.length > 0) {
              result = await sendMulticastMessage(
                channel.channelAccessToken, 
                followersResult.userIds, 
                lineMessages
              );
            } else {
              result = { success: false, error: 'ไม่สามารถดึงรายชื่อ Followers ได้ (Free Plan ไม่รองรับ)' };
            }
          } else {
            result = await sendBroadcastMessage(channel.channelAccessToken, lineMessages);
          }

          // อัพเดทสถานะ
          const item = global.broadcastHistory.find(h => h.id === historyItem.id);
          if (item) {
            item.status = result.success ? 'success' : 'failed';
            item.sentAt = new Date().toISOString();
            if (!result.success) {
              const errorMessage = result.error.toLowerCase();
              if (errorMessage.includes('monthly limit') || errorMessage.includes('quota')) {
                item.error = 'เกินโควต้าการส่งข้อความประจำเดือน (300 ข้อความ/เดือน)';
              } else {
                item.error = result.error;
              }
            }
          }

          console.log(`✅ Scheduled broadcast sent: ${historyItem.id}`);
        } catch (error) {
          console.error('Error sending scheduled broadcast:', error);
          const item = global.broadcastHistory.find(h => h.id === historyItem.id);
          if (item) {
            item.status = 'failed';
            item.error = error.message;
          }
        }
      }, delay);

      res.json({
        success: true,
        message: `✅ ตั้งเวลาส่ง ${sendType === 'multicast' ? 'Multicast' : 'Broadcast'} สำเร็จ!\nจะส่งเมื่อ ${scheduleDate.toLocaleString('th-TH')}`,
        data: historyItem
      });
    } catch (error) {
      console.error('Error in schedule:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาด: ' + error.message
      });
    }
  });

  // API: ดึงประวัติ Broadcast
  router.get('/broadcast/history', requireLogin, (req, res) => {
    res.json({
      success: true,
      history: global.broadcastHistory.slice().reverse()
    });
  });

  return router;
}

module.exports = { setupBroadcastRoutes };