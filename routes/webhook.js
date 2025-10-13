const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ฟังก์ชันตรวจสอบว่าข้อความมีคีย์เวิร์ดหรือไม่
function containsKeyword(text, keywords) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

// ฟังก์ชันตรวจสอบว่าสามารถส่งข้อความได้หรือไม่
function canSendMessage(userId, userMessageHistory, getCooldownPeriod) {
  const lastSentTime = userMessageHistory.get(userId);
  if (!lastSentTime) return true;
  
  const currentTime = Date.now();
  const timeDiff = currentTime - lastSentTime;
  return timeDiff >= getCooldownPeriod();
}

// ฟังก์ชันบันทึกเวลาที่ส่งข้อความ
function recordMessageSent(userId, userMessageHistory) {
  userMessageHistory.set(userId, Date.now());
}

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

// ฟังก์ชันสร้างข้อความ Cooldown พร้อม placeholder
function getCooldownMessage(userId, cooldownMessageTemplate, userMessageHistory, getCooldownPeriod) {
  const remaining = getRemainingTime(userId, userMessageHistory, getCooldownPeriod);
  const timeLeft = formatTime(remaining);
  const template = cooldownMessageTemplate || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊";
  return template.replace('{timeLeft}', timeLeft);
}

// ฟังก์ชันหา LINE Client จาก signature
function findClientBySignature(signature, body) {
  for (const [channelId, clientData] of global.lineClients.entries()) {
    const hash = crypto
      .createHmac('SHA256', clientData.channelSecret)
      .update(body)
      .digest('base64');
    
    if (hash === signature) {
      return {
        client: clientData.client,
        channelId: channelId,
        config: clientData.config
      };
    }
  }
  return null;
}

// Setup Webhook Route
function setupWebhookRoute(
  appConfig, 
  userMessageHistory, 
  getCooldownPeriod, 
  containsPromotionKeyword, 
  createPromotionFlexMessage, 
  getRandomFlex, 
  getQuickReplyMenu,
  containsQuickReplyKeyword,
  containsFlexKeyword,
  quickReplyConfig
) {
  
  router.post('/webhook', express.json(), async (req, res) => {
    try {
      // ตรวจสอบว่ามี LINE Channel ที่เปิดใช้งานหรือไม่
      if (global.lineClients.size === 0) {
        console.log('⚠️ Webhook received but no LINE channels are configured');
        return res.status(200).send('No channels configured');
      }

      // ตรวจสอบ signature
      const signature = req.get('x-line-signature');
      if (!signature) {
        console.log('❌ No signature provided');
        return res.status(401).send('No signature');
      }

      // หา LINE Client ที่ตรงกับ signature
      const body = JSON.stringify(req.body);
      const clientData = findClientBySignature(signature, body);

      if (!clientData) {
        console.log('❌ Invalid signature - no matching channel found');
        return res.status(401).send('Invalid signature');
      }

      console.log(`✅ Webhook verified for channel: ${clientData.config.name} (${clientData.channelId})`);

      const events = req.body.events;
      await Promise.all(events.map(event => 
        handleEvent(
          event, 
          clientData.client,
          clientData.config,
          appConfig, 
          userMessageHistory, 
          getCooldownPeriod, 
          containsPromotionKeyword, 
          createPromotionFlexMessage, 
          getRandomFlex, 
          getQuickReplyMenu,
          containsQuickReplyKeyword,
          containsFlexKeyword,
          quickReplyConfig
        )
      ));
      
      res.status(200).send('OK');
    } catch (err) {
      console.error('Error in webhook:', err);
      res.status(500).send('Internal Server Error');
    }
  });

  return router;
}

// ฟังก์ชันจัดการ Event
async function handleEvent(
  event, 
  lineClient,
  channelConfig,
  appConfig, 
  userMessageHistory, 
  getCooldownPeriod, 
  containsPromotionKeyword, 
  createPromotionFlexMessage, 
  getRandomFlex, 
  getQuickReplyMenu,
  containsQuickReplyKeyword,
  containsFlexKeyword,
  quickReplyConfig
) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }
  
  if (!lineClient) {
    console.error('LINE client not available');
    return null;
  }
  
  const userId = event.source.userId;
  const messageText = event.message.text;
  
  console.log(`📩 [${channelConfig.name}] Received message from ${userId}: ${messageText}`);
  
  // ตรวจสอบ Features ที่เปิดใช้งานของ Channel นี้
  const features = channelConfig.features || {
    activities: true,
    promotions: true,
    flexMessages: true
  };

  console.log(`🔧 [${channelConfig.name}] Features:`, features);
  
  // 1. ตรวจสอบคีย์เวิร์ดโปรโมชั่นก่อน (ถ้าเปิดใช้งาน)
  if (features.promotions && containsPromotionKeyword(messageText)) {
    console.log(`🎨 [${channelConfig.name}] Promotion keyword detected!`);
    
    const flexMessage = createPromotionFlexMessage();
    
    if (flexMessage) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [flexMessage]
      });
      console.log(`✅ [${channelConfig.name}] Promotions sent to ${userId}`);
    } else {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'ขออภัยค่ะ ขณะนี้ยังไม่มีโปรโมชั่นพิเศษ 😊'
        }]
      });
    }
    
    return null;
  }
  
  // 2. ตรวจสอบคีย์เวิร์ดกิจกรรมแชร์ (ถ้าเปิดใช้งาน)
  if (features.activities && containsKeyword(messageText, appConfig.botSettings.keywords)) {
    console.log(`🎁 [${channelConfig.name}] Activity keyword detected!`);
    
    if (canSendMessage(userId, userMessageHistory, getCooldownPeriod)) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: appConfig.botSettings.activityMessage
        }]
      });
      
      recordMessageSent(userId, userMessageHistory);
      console.log(`✅ [${channelConfig.name}] Activity sent to ${userId}`);
    } else {
      const cooldownMsg = getCooldownMessage(userId, appConfig.botSettings.cooldownMessage, userMessageHistory, getCooldownPeriod);
      
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: cooldownMsg
        }]
      });
      
      const remaining = getRemainingTime(userId, userMessageHistory, getCooldownPeriod);
      const timeLeft = formatTime(remaining);
      console.log(`⏳ [${channelConfig.name}] Cooldown active for ${userId}, ${timeLeft} remaining`);
    }
    
    return null;
  }
  
  // 3. ตรวจสอบคีย์เวิร์ด Flex Message (ถ้าเปิดใช้งาน)
  if (features.flexMessages && containsFlexKeyword(messageText)) {
    console.log(`💬 [${channelConfig.name}] Flex Message keyword detected!`);
    
    try {
      const randomFlex = getRandomFlex();
      
      if (!randomFlex) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: 'ขออภัยค่ะ ขณะนี้ยังไม่มี Flex Message'
          }]
        });
        return null;
      }

      const messages = [
        {
          type: 'flex',
          altText: '📊 เกมอัตราชนะสูง',
          contents: randomFlex
        }
      ];

      // ส่ง Quick Reply พร้อมกับ Flex ถ้าตั้งค่าไว้
      if (quickReplyConfig.flexMessageSettings.sendWithQuickReply) {
        const quickReply = getQuickReplyMenu();
        if (quickReply) {
          messages.push(quickReply);
        }
      }
      
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: messages
      });
      
      console.log(`✅ [${channelConfig.name}] Flex Message ${quickReplyConfig.flexMessageSettings.sendWithQuickReply ? '+ Quick Reply' : ''} sent to ${userId}`);
    } catch (error) {
      console.error(`❌ [${channelConfig.name}] Error sending Flex Message:`, error);
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'ขออภัยค่ะ เกิดข้อผิดพลาดในการส่งข้อมูล'
        }]
      });
    }
    
    return null;
  }
  
  // 4. ตรวจสอบคีย์เวิร์ด Quick Reply Menu (ถ้าเปิดใช้งาน Flex Messages)
  if (features.flexMessages && containsQuickReplyKeyword(messageText)) {
    console.log(`🔘 [${channelConfig.name}] Quick Reply keyword detected!`);
    
    const quickReply = getQuickReplyMenu();
    
    if (quickReply) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [quickReply]
      });
      console.log(`✅ [${channelConfig.name}] Quick Reply Menu sent to ${userId}`);
    } else {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'ขออภัยค่ะ Quick Reply Menu ถูกปิดการใช้งาน'
        }]
      });
    }
    
    return null;
  }
  
  // ถ้าไม่ตรงเงื่อนไขใดๆ
  console.log(`ℹ️ [${channelConfig.name}] No matching keyword for message: ${messageText}`);
  return null;
}

module.exports = { setupWebhookRoute };