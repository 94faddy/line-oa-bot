require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const app = express();

// โหลดการตั้งค่าจาก config.json
const configPath = path.join(__dirname, 'config.json');

// สร้างไฟล์ config.json ถ้ายังไม่มี
if (!fs.existsSync(configPath)) {
  const defaultConfig = {
    lineConfig: {
      channelAccessToken: "",
      channelSecret: ""
    },
    botSettings: {
      activityMessage: "กิจกรรมรับรางวัลฟรี 100\nแชร์โพสลงกลุ่มจำนวน 6 กลุ่ม Facebook เฉพาะ สล็อต การพนันเท่านั้น (ห้ามซ้ำ)\n🔷 https://9iot.cc/w99\nกดติดตาม 🎯 กดถูกใจ ด้วยนะคะ\n💞ทำเสร็จแล้วแคปหลักฐานกิจกรรมให้น้องแอดด้วยนะคะ\n(หากส่งกิจกรรมไม่ครบและเกินระยะเวลาทำกิจกรรม 4 ชั่วโมงขอตัดสิทธินะคะ)",
      cooldownMessage: "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊",
      keywords: ["ฟรี", "free", "เครดิตฟรี", "เครดิต", "รับเครดิต"],
      cooldownHours: 2
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
  console.log('✅ สร้างไฟล์ config.json เรียบร้อย');
}

let appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// ฟังก์ชันบันทึก config
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
}

// LINE Bot Configuration
let config = {
  channelAccessToken: appConfig.lineConfig.channelAccessToken || 'dummy_token',
  channelSecret: appConfig.lineConfig.channelSecret || 'dummy_secret'
};

let client;
let isLineConfigured = false;

// ตรวจสอบว่ามีการตั้งค่า LINE หรือยัง
if (appConfig.lineConfig.channelAccessToken && appConfig.lineConfig.channelSecret) {
  try {
    client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: appConfig.lineConfig.channelAccessToken
    });
    isLineConfigured = true;
    console.log('✅ LINE Bot configured successfully');
  } catch (error) {
    console.log('⚠️ LINE Bot configuration failed:', error.message);
  }
}

// เก็บประวัติการส่งข้อความของแต่ละ User
const userMessageHistory = new Map();

// ฟังก์ชันคำนวณระยะเวลา Cooldown
function getCooldownPeriod() {
  return appConfig.botSettings.cooldownHours * 60 * 60 * 1000;
}

// ตั้งค่า Express
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-key-to-random-string',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // ตั้งเป็น true ถ้าใช้ HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 ชั่วโมง
  }
}));

// Middleware ตรวจสอบการ Login
function requireLogin(req, res, next) {
  if (req.session && req.session.isLoggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// ฟังก์ชันตรวจสอบว่าข้อความมีคีย์เวิร์ดหรือไม่
function containsKeyword(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return appConfig.botSettings.keywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

// ฟังก์ชันตรวจสอบว่าสามารถส่งข้อความได้หรือไม่
function canSendMessage(userId) {
  const lastSentTime = userMessageHistory.get(userId);
  if (!lastSentTime) return true;
  
  const currentTime = Date.now();
  const timeDiff = currentTime - lastSentTime;
  return timeDiff >= getCooldownPeriod();
}

// ฟังก์ชันบันทึกเวลาที่ส่งข้อความ
function recordMessageSent(userId) {
  userMessageHistory.set(userId, Date.now());
}

// ฟังก์ชันคำนวณเวลาที่เหลือ
function getRemainingTime(userId) {
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
function getCooldownMessage(userId) {
  const remaining = getRemainingTime(userId);
  const timeLeft = formatTime(remaining);
  const template = appConfig.botSettings.cooldownMessage || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊";
  return template.replace('{timeLeft}', timeLeft);
}

// ===================== ROUTES =====================

// Login Page
app.get('/login', (req, res) => {
  if (req.session && req.session.isLoggedIn) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// Login Handler
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  const adminUsername = process.env.ADMIN_USERNAME || 'jonz';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  
  if (!adminPasswordHash) {
    return res.render('login', { 
      error: 'ระบบยังไม่ได้ตั้งค่ารหัสผ่าน กรุณาตั้งค่า ADMIN_PASSWORD_HASH ใน .env' 
    });
  }
  
  if (username === adminUsername && bcrypt.compareSync(password, adminPasswordHash)) {
    req.session.isLoggedIn = true;
    req.session.username = username;
    res.redirect('/');
  } else {
    res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Dashboard
app.get('/', requireLogin, (req, res) => {
  const users = Array.from(userMessageHistory.entries()).map(([userId, timestamp]) => {
    const date = new Date(timestamp);
    const remaining = getRemainingTime(userId);
    const canSend = remaining === 0;
    
    return {
      userId,
      lastSent: date.toLocaleString('th-TH'),
      canSend,
      remainingTime: canSend ? 'สามารถส่งได้' : formatTime(remaining)
    };
  });
  
  res.render('dashboard', { 
    users,
    totalUsers: users.length,
    activityMessage: appConfig.botSettings.activityMessage,
    cooldownMessage: appConfig.botSettings.cooldownMessage || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊",
    keywords: appConfig.botSettings.keywords.join(', '),
    cooldownHours: appConfig.botSettings.cooldownHours,
    lineAccessToken: appConfig.lineConfig.channelAccessToken,
    lineChannelSecret: appConfig.lineConfig.channelSecret,
    username: req.session.username
  });
});

// Update Settings
app.post('/update-settings', requireLogin, (req, res) => {
  try {
    const { activityMessage, cooldownMessage, keywords, cooldownHours, lineAccessToken, lineChannelSecret } = req.body;
    
    // อัพเดทการตั้งค่า
    appConfig.botSettings.activityMessage = activityMessage;
    appConfig.botSettings.cooldownMessage = cooldownMessage || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊";
    appConfig.botSettings.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
    appConfig.botSettings.cooldownHours = parseFloat(cooldownHours) || 2;
    appConfig.lineConfig.channelAccessToken = lineAccessToken || '';
    appConfig.lineConfig.channelSecret = lineChannelSecret || '';
    
    // บันทึกลง config.json
    saveConfig();
    
    // อัพเดท LINE Client
    if (lineAccessToken && lineChannelSecret) {
      config = {
        channelAccessToken: lineAccessToken,
        channelSecret: lineChannelSecret
      };
      try {
        client = new line.messagingApi.MessagingApiClient({
          channelAccessToken: lineAccessToken
        });
        isLineConfigured = true;
        console.log('✅ LINE Bot reconfigured successfully');
      } catch (error) {
        console.error('❌ Failed to configure LINE Bot:', error.message);
        isLineConfigured = false;
      }
    }
    
    res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึก' });
  }
});

// Webhook Endpoint - ใช้ custom middleware เพื่อจัดการกรณีที่ยังไม่มี config
app.post('/webhook', express.json(), async (req, res) => {
  try {
    // ตรวจสอบว่ามีการตั้งค่า LINE หรือยัง
    if (!isLineConfigured) {
      console.log('⚠️ Webhook received but LINE is not configured yet');
      return res.status(200).send('LINE not configured');
    }

    // ตรวจสอบ signature
    const signature = req.get('x-line-signature');
    if (!signature) {
      return res.status(401).send('No signature');
    }

    // Verify signature
    const crypto = require('crypto');
    const body = JSON.stringify(req.body);
    const hash = crypto
      .createHmac('SHA256', config.channelSecret)
      .update(body)
      .digest('base64');

    if (hash !== signature) {
      console.log('❌ Invalid signature');
      return res.status(401).send('Invalid signature');
    }

    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    
    res.status(200).send('OK');
  } catch (err) {
    console.error('Error in webhook:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ฟังก์ชันจัดการ Event
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }
  
  if (!client || !isLineConfigured) {
    console.error('LINE client not initialized');
    return null;
  }
  
  const userId = event.source.userId;
  const messageText = event.message.text;
  
  console.log(`Received message from ${userId}: ${messageText}`);
  
  if (containsKeyword(messageText)) {
    console.log('Keyword detected!');
    
    if (canSendMessage(userId)) {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: appConfig.botSettings.activityMessage
          }
        ]
      });
      
      recordMessageSent(userId);
      console.log(`Activity sent to ${userId}`);
    } else {
      const cooldownMsg = getCooldownMessage(userId);
      
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: cooldownMsg
          }
        ]
      });
      
      const remaining = getRemainingTime(userId);
      const timeLeft = formatTime(remaining);
      console.log(`Cooldown active for ${userId}, ${timeLeft} remaining`);
    }
  }
  
  return null;
}

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeUsers: userMessageHistory.size,
    lineConfigured: isLineConfigured
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 LINE OA Bot Server Started!');
  console.log('='.repeat(50));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔐 Login: http://localhost:${PORT}/login`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🤖 LINE Bot: ${isLineConfigured ? '✅ Configured' : '⚠️ Not Configured Yet'}`);
  console.log('='.repeat(50));
  
  if (!isLineConfigured) {
    console.log('⚠️ กรุณาตั้งค่า LINE Channel Access Token และ Channel Secret ใน Dashboard');
  }
});