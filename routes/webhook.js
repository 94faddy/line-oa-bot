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

// ฟังก์ชัน safe reply - ตรวจสอบก่อนส่ง
async function safeReplyMessage(lineClient, replyToken, messages, channelName) {
  try {
    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error(`❌ [${channelName}] Invalid messages array`);
      return false;
    }

    // ตรวจสอบแต่ละ message
    const validMessages = messages.filter(msg => {
      if (!msg || typeof msg !== 'object') {
        console.warn(`⚠️ [${channelName}] Invalid message object`);
        return false;
      }
      if (!msg.type) {
        console.warn(`⚠️ [${channelName}] Message missing type`);
        return false;
      }
      if (msg.type === 'text' && (!msg.text || msg.text.trim() === '')) {
        console.warn(`⚠️ [${channelName}] Text message has empty text`);
        return false;
      }
      if (msg.type === 'flex' && !msg.contents) {
        console.warn(`⚠️ [${channelName}] Flex message missing contents`);
        return false;
      }
      return true;
    });

    if (validMessages.length === 0) {
      console.error(`❌ [${channelName}] No valid messages to send`);
      return false;
    }

    // ส่งข้อความ
    await lineClient.replyMessage({
      replyToken: replyToken,
      messages: validMessages
    });

    console.log(`✅ [${channelName}] Message sent successfully`);
    return true;
  } catch (error) {
    console.error(`❌ [${channelName}] Error in safeReplyMessage:`, error.message);
    if (error.body) {
      console.error(`Error body:`, error.body);
    }
    return false;
  }
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
  quickReplyConfig,
  createWelcomeFlexMessage,
  welcomeConfig
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
          quickReplyConfig,
          createWelcomeFlexMessage,
          welcomeConfig
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
  quickReplyConfig,
  createWelcomeFlexMessage,
  welcomeConfig
) {
  // ============================================
  // ตรวจสอบ Event Type: Follow Event (เพื่อนใหม่)
  // ============================================
  if (event.type === 'follow') {
    console.log(`👋 [${channelConfig.name}] New follower: ${event.source.userId}`);
    
    // ตรวจสอบ Global Settings
    if (!welcomeConfig.welcomeSettings.enabled) {
      console.log(`ℹ️ [${channelConfig.name}] Welcome feature is GLOBALLY DISABLED`);
      return null;
    }

    if (!welcomeConfig.welcomeSettings.showOnFollow) {
      console.log(`ℹ️ [${channelConfig.name}] Welcome showOnFollow is DISABLED`);
      return null;
    }
    
    // ตรวจสอบว่า Channel นี้เปิดใช้งาน Welcome Feature หรือไม่
    const features = channelConfig.features || {};
    
    if (!features.welcome) {
      console.log(`ℹ️ [${channelConfig.name}] Welcome feature is disabled for this channel`);
      return null;
    }
    
    // สร้าง Welcome Message
    console.log(`🎉 [${channelConfig.name}] Creating Welcome Message...`);
    const welcomeMessage = createWelcomeFlexMessage();
    
    if (!welcomeMessage) {
      console.log(`⚠️ [${channelConfig.name}] Welcome message is NULL - check config`);
      return null;
    }

    // Validate welcome message structure
    if (!welcomeMessage.type || !welcomeMessage.contents || !welcomeMessage.altText) {
      console.error(`❌ [${channelConfig.name}] Welcome message has invalid structure`);
      return null;
    }
    
    console.log(`📤 [${channelConfig.name}] Sending Welcome Message...`);
    
    // ส่ง Welcome Message
    const success = await safeReplyMessage(
      lineClient,
      event.replyToken,
      [welcomeMessage],
      channelConfig.name
    );

    if (success) {
      console.log(`✅ [${channelConfig.name}] Welcome message sent to ${event.source.userId}`);
    } else {
      console.error(`❌ [${channelConfig.name}] Failed to send welcome message`);
    }
    
    return null;
  }

  // ============================================
  // ตรวจสอบ Event Type: Message Event
  // ============================================
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
    welcome: true,
    activities: true,
    promotions: true,
    flexMessages: true
  };

  console.log(`🔧 [${channelConfig.name}] Features:`, features);
  
  // ============================================
  // 1. ตรวจสอบคีย์เวิร์ดโปรโมชั่นก่อน
  // ============================================
  if (features.promotions && containsPromotionKeyword(messageText)) {
    console.log(`🎨 [${channelConfig.name}] Promotion keyword detected!`);
    
    const flexMessage = createPromotionFlexMessage();
    
    if (flexMessage) {
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [flexMessage],
        channelConfig.name
      );
    } else {
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [{
          type: 'text',
          text: 'ขออภัยค่ะ ขณะนี้ยังไม่มีโปรโมชั่นพิเศษ 😊'
        }],
        channelConfig.name
      );
    }
    
    return null;
  }
  
  // ============================================
  // 2. ตรวจสอบคีย์เวิร์ดกิจกรรมแชร์
  // ============================================
  if (features.activities && containsKeyword(messageText, appConfig.botSettings.keywords)) {
    console.log(`🎁 [${channelConfig.name}] Activity keyword detected!`);
    
    if (canSendMessage(userId, userMessageHistory, getCooldownPeriod)) {
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [{
          type: 'text',
          text: appConfig.botSettings.activityMessage
        }],
        channelConfig.name
      );
      
      recordMessageSent(userId, userMessageHistory);
      console.log(`✅ [${channelConfig.name}] Activity sent to ${userId}`);
    } else {
      const cooldownMsg = getCooldownMessage(
        userId, 
        appConfig.botSettings.cooldownMessage, 
        userMessageHistory, 
        getCooldownPeriod
      );
      
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [{
          type: 'text',
          text: cooldownMsg
        }],
        channelConfig.name
      );
      
      const remaining = getRemainingTime(userId, userMessageHistory, getCooldownPeriod);
      const timeLeft = formatTime(remaining);
      console.log(`⏳ [${channelConfig.name}] Cooldown active for ${userId}, ${timeLeft} remaining`);
    }
    
    return null;
  }
  
  // ============================================
  // 3. ตรวจสอบคีย์เวิร์ด Flex Message
  // ============================================
  if (features.flexMessages && containsFlexKeyword(messageText)) {
    console.log(`💬 [${channelConfig.name}] Flex Message keyword detected!`);
    
    try {
      const randomFlex = getRandomFlex();
      
      if (!randomFlex) {
        await safeReplyMessage(
          lineClient,
          event.replyToken,
          [{
            type: 'text',
            text: 'ขออภัยค่ะ ขณะนี้ยังไม่มี Flex Message'
          }],
          channelConfig.name
        );
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
      
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        messages,
        channelConfig.name
      );
      
      console.log(`✅ [${channelConfig.name}] Flex Message sent`);
    } catch (error) {
      console.error(`❌ [${channelConfig.name}] Error sending Flex Message:`, error);
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [{
          type: 'text',
          text: 'ขออภัยค่ะ เกิดข้อผิดพลาดในการส่งข้อมูล'
        }],
        channelConfig.name
      );
    }
    
    return null;
  }
  
  // ============================================
  // 4. ตรวจสอบคีย์เวิร์ด Quick Reply Menu
  // ============================================
  if (features.flexMessages && containsQuickReplyKeyword(messageText)) {
    console.log(`🔘 [${channelConfig.name}] Quick Reply keyword detected!`);
    
    const quickReply = getQuickReplyMenu();
    
    if (quickReply) {
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [quickReply],
        channelConfig.name
      );
    } else {
      await safeReplyMessage(
        lineClient,
        event.replyToken,
        [{
          type: 'text',
          text: 'ขออภัยค่ะ Quick Reply Menu ถูกปิดการใช้งาน'
        }],
        channelConfig.name
      );
    }
    
    return null;
  }
  
  // ============================================
  // ถ้าไม่ตรงเงื่อนไขใดๆ
  // ============================================
  console.log(`ℹ️ [${channelConfig.name}] No matching keyword for message: ${messageText}`);
  return null;
}

module.exports = { setupWebhookRoute };