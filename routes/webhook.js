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

// ฟังก์ชันหากิจกรรมทั้งหมดที่ตรงกับคีย์เวิร์ดและ channel
function findMatchingActivities(messageText, channelId, activities) {
  if (!activities || activities.length === 0) return [];
  
  const enabledActivities = activities.filter(activity => 
    activity.enabled && 
    activity.channels && 
    activity.channels.includes(channelId)
  );

  let matchedActivities = enabledActivities.filter(activity => 
    containsKeyword(messageText, activity.keywords)
  );

  if (matchedActivities.length > 1) {
    matchedActivities = matchedActivities.filter(activity => {
      return activity.allowSharedKeywords !== false;
    });
  }

  return matchedActivities.sort((a, b) => 
    new Date(a.createdAt) - new Date(b.createdAt)
  );
}

// ฟังก์ชันตรวจสอบว่าสามารถส่งข้อความได้หรือไม่
function canSendMessage(userId, activityId, userMessageHistory, activities) {
  const activity = activities.find(a => a.id === activityId);
  if (!activity) return false;
  
  if (activity.useCooldown === false) {
    return true;
  }
  
  const key = `${userId}_${activityId}`;
  const lastSentTime = userMessageHistory.get(key);
  if (!lastSentTime) return true;
  
  const currentTime = Date.now();
  const timeDiff = currentTime - lastSentTime;
  const cooldownPeriod = activity.cooldownHours * 60 * 60 * 1000;
  
  return timeDiff >= cooldownPeriod;
}

// ฟังก์ชันบันทึกเวลาที่ส่งข้อความ
function recordMessageSent(userId, activityId, userMessageHistory) {
  const key = `${userId}_${activityId}`;
  userMessageHistory.set(key, Date.now());
}

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

// ฟังก์ชันสร้างข้อความ Cooldown พร้อม placeholder
function getCooldownMessage(userId, activityId, cooldownMessageTemplate, userMessageHistory, activities) {
  const remaining = getRemainingTime(userId, activityId, userMessageHistory, activities);
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

// ฟังก์ชันแปลง messageBoxes เป็น LINE messages
function convertMessageBoxesToLineMessages(messageBoxes, channelName) {
  const lineMessages = [];
  
  for (const box of messageBoxes) {
    try {
      if (box.type === 'text') {
        lineMessages.push({
          type: 'text',
          text: box.content.trim()
        });
      } 
      else if (box.type === 'image') {
        const imageUrl = box.content.trim();
        lineMessages.push({
          type: 'image',
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl
        });
      } 
      else if (box.type === 'flex') {
        try {
          const flexJson = JSON.parse(box.content);
          lineMessages.push({
            type: 'flex',
            altText: box.altText || 'Flex Message',
            contents: flexJson
          });
        } catch (e) {
          console.error(`❌ [${channelName}] Invalid Flex JSON in box:`, e.message);
          lineMessages.push({
            type: 'text',
            text: '⚠️ ข้อความนี้มีข้อผิดพลาด กรุณาติดต่อแอดมิน'
          });
        }
      }
    } catch (error) {
      console.error(`❌ [${channelName}] Error converting message box:`, error);
    }
  }
  
  return lineMessages;
}

// ฟังก์ชัน safe reply
async function safeReplyMessage(lineClient, replyToken, messages, channelName) {
  try {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error(`❌ [${channelName}] Invalid messages array`);
      return false;
    }

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
      if (msg.type === 'image' && (!msg.originalContentUrl || !msg.previewImageUrl)) {
        console.warn(`⚠️ [${channelName}] Image message missing URLs`);
        return false;
      }
      return true;
    });

    if (validMessages.length === 0) {
      console.error(`❌ [${channelName}] No valid messages to send`);
      return false;
    }

    if (validMessages.length > 5) {
      console.warn(`⚠️ [${channelName}] Too many messages (${validMessages.length}), sending only first 5`);
      validMessages.splice(5);
    }

    await lineClient.replyMessage({
      replyToken: replyToken,
      messages: validMessages
    });

    console.log(`✅ [${channelName}] ${validMessages.length} message(s) sent successfully`);
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
      if (global.lineClients.size === 0) {
        console.log('⚠️ Webhook received but no LINE channels are configured');
        return res.status(200).send('No channels configured');
      }

      const signature = req.get('x-line-signature');
      if (!signature) {
        console.log('❌ No signature provided');
        return res.status(401).send('No signature');
      }

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
          clientData.channelId,
          appConfig, 
          userMessageHistory, 
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
  channelId,
  appConfig, 
  userMessageHistory, 
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
  // Follow Event
  // ============================================
  if (event.type === 'follow') {
    console.log(`👋 [${channelConfig.name}] New follower: ${event.source.userId}`);
    
    if (!welcomeConfig.welcomeSettings.enabled) {
      console.log(`ℹ️ [${channelConfig.name}] Welcome feature is GLOBALLY DISABLED`);
      return null;
    }

    if (!welcomeConfig.welcomeSettings.showOnFollow) {
      console.log(`ℹ️ [${channelConfig.name}] Welcome showOnFollow is DISABLED`);
      return null;
    }
    
    const features = channelConfig.features || {};
    
    if (!features.welcome) {
      console.log(`ℹ️ [${channelConfig.name}] Welcome feature is disabled for this channel`);
      return null;
    }
    
    console.log(`🎉 [${channelConfig.name}] Creating Welcome Message...`);
    const welcomeMessage = createWelcomeFlexMessage();
    
    if (!welcomeMessage) {
      console.log(`⚠️ [${channelConfig.name}] Welcome message is NULL - check config`);
      return null;
    }

    if (!welcomeMessage.type || !welcomeMessage.contents || !welcomeMessage.altText) {
      console.error(`❌ [${channelConfig.name}] Welcome message has invalid structure`);
      return null;
    }
    
    console.log(`📤 [${channelConfig.name}] Sending Welcome Message...`);
    
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
  // Message Event
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
  
  const features = channelConfig.features || {
    welcome: true,
    activities: true,
    promotions: true,
    flexMessages: true
  };

  console.log(`🔧 [${channelConfig.name}] Features:`, features);
  
  // ============================================
  // 1. ตรวจสอบคีย์เวิร์ดโปรโมชั่น
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
  // 2. ตรวจสอบคีย์เวิร์ดกิจกรรม (รองรับ messageBoxes)
  // ============================================
  if (features.activities) {
    if (!appConfig.activities) {
      appConfig.activities = [];
    }

    const matchedActivities = findMatchingActivities(messageText, channelId, appConfig.activities);
    
    if (matchedActivities.length > 0) {
      console.log(`🎁 [${channelConfig.name}] ${matchedActivities.length} activity(ies) matched!`);
      
      const messagesToSend = [];
      
      for (const activity of matchedActivities) {
        const sharedStatus = activity.allowSharedKeywords !== false ? 'Shared✅' : 'Shared❌';
        console.log(`   📌 Processing activity: ${activity.name} (Cooldown: ${activity.useCooldown !== false}, ${sharedStatus})`);
        
        if (canSendMessage(userId, activity.id, userMessageHistory, appConfig.activities)) {
          // แปลง messageBoxes เป็น LINE messages
          if (activity.messageBoxes && Array.isArray(activity.messageBoxes)) {
            const convertedMessages = convertMessageBoxesToLineMessages(activity.messageBoxes, channelConfig.name);
            messagesToSend.push(...convertedMessages);
            console.log(`   ✅ Converted ${convertedMessages.length} message(s) from messageBoxes`);
          } 
          // Backward compatibility: ถ้ายังมี message แบบเก่า
          else if (activity.message) {
            messagesToSend.push({
              type: 'text',
              text: activity.message
            });
            console.log(`   ℹ️ Using legacy message format`);
          }
          
          if (activity.useCooldown !== false) {
            recordMessageSent(userId, activity.id, userMessageHistory);
            console.log(`   ✅ Activity "${activity.name}" will be sent (Cooldown: ${activity.cooldownHours}h)`);
          } else {
            console.log(`   ✅ Activity "${activity.name}" will be sent (No Cooldown)`);
          }
        } else {
          const cooldownMsg = getCooldownMessage(
            userId, 
            activity.id,
            activity.cooldownMessage, 
            userMessageHistory,
            appConfig.activities
          );
          
          messagesToSend.push({
            type: 'text',
            text: cooldownMsg
          });
          
          const remaining = getRemainingTime(userId, activity.id, userMessageHistory, appConfig.activities);
          const timeLeft = formatTime(remaining);
          console.log(`   ⏳ Cooldown active for activity "${activity.name}", ${timeLeft} remaining`);
        }
      }
      
      if (messagesToSend.length > 0) {
        await safeReplyMessage(
          lineClient,
          event.replyToken,
          messagesToSend,
          channelConfig.name
        );
        
        console.log(`✅ [${channelConfig.name}] Sent ${messagesToSend.length} message(s) to ${userId}`);
      }
      
      return null;
    }
  }
  
  // ============================================
  // 3. Flex Message keyword
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
  // 4. Quick Reply keyword
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
  
  console.log(`ℹ️ [${channelConfig.name}] No matching keyword for message: ${messageText}`);
  return null;
}

module.exports = { setupWebhookRoute };