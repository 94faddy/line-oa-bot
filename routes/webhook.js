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

// Setup Webhook Route
function setupWebhookRoute(appConfig, userMessageHistory, getCooldownPeriod, containsPromotionKeyword, createPromotionFlexMessage) {
  
  router.post('/webhook', express.json(), async (req, res) => {
    try {
      // ตรวจสอบว่ามีการตั้งค่า LINE หรือยัง
      if (!global.isLineConfigured) {
        console.log('⚠️ Webhook received but LINE is not configured yet');
        return res.status(200).send('LINE not configured');
      }

      // ตรวจสอบ signature
      const signature = req.get('x-line-signature');
      if (!signature) {
        return res.status(401).send('No signature');
      }

      // Verify signature
      const body = JSON.stringify(req.body);
      const hash = crypto
        .createHmac('SHA256', global.lineConfig.channelSecret)
        .update(body)
        .digest('base64');

      if (hash !== signature) {
        console.log('❌ Invalid signature');
        return res.status(401).send('Invalid signature');
      }

      const events = req.body.events;
      await Promise.all(events.map(event => 
        handleEvent(event, appConfig, userMessageHistory, getCooldownPeriod, containsPromotionKeyword, createPromotionFlexMessage)
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
async function handleEvent(event, appConfig, userMessageHistory, getCooldownPeriod, containsPromotionKeyword, createPromotionFlexMessage) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }
  
  if (!global.lineClient || !global.isLineConfigured) {
    console.error('LINE client not initialized');
    return null;
  }
  
  const userId = event.source.userId;
  const messageText = event.message.text;
  
  console.log(`Received message from ${userId}: ${messageText}`);
  
  // ตรวจสอบคีย์เวิร์ดโปรโมชั่นก่อน
  if (containsPromotionKeyword(messageText)) {
    console.log('Promotion keyword detected!');
    
    const flexMessage = createPromotionFlexMessage();
    
    if (flexMessage) {
      await global.lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [flexMessage]
      });
      console.log(`Promotions sent to ${userId}`);
    } else {
      await global.lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'ขออภัยค่ะ ขณะนี้ยังไม่มีโปรโมชั่นพิเศษ 😊'
        }]
      });
    }
    
    return null;
  }
  
  // ตรวจสอบคีย์เวิร์ดกิจกรรมปกติ
  if (containsKeyword(messageText, appConfig.botSettings.keywords)) {
    console.log('Activity keyword detected!');
    
    if (canSendMessage(userId, userMessageHistory, getCooldownPeriod)) {
      await global.lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: appConfig.botSettings.activityMessage
        }]
      });
      
      recordMessageSent(userId, userMessageHistory);
      console.log(`Activity sent to ${userId}`);
    } else {
      const cooldownMsg = getCooldownMessage(userId, appConfig.botSettings.cooldownMessage, userMessageHistory, getCooldownPeriod);
      
      await global.lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: cooldownMsg
        }]
      });
      
      const remaining = getRemainingTime(userId, userMessageHistory, getCooldownPeriod);
      const timeLeft = formatTime(remaining);
      console.log(`Cooldown active for ${userId}, ${timeLeft} remaining`);
    }
  }
  
  return null;
}

module.exports = { setupWebhookRoute };