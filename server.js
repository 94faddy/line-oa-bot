require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const app = express();

// โหลดการตั้งค่าจาก config.json
const configPath = path.join(__dirname, 'data', 'config.json');

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

// LINE Bot Configuration (ใช้ global เพื่อให้ routes อื่นเข้าถึงได้)
global.lineConfig = {
  channelAccessToken: appConfig.lineConfig.channelAccessToken || 'dummy_token',
  channelSecret: appConfig.lineConfig.channelSecret || 'dummy_secret'
};

global.lineClient = null;
global.isLineConfigured = false;

// ตรวจสอบว่ามีการตั้งค่า LINE หรือยัง
if (appConfig.lineConfig.channelAccessToken && appConfig.lineConfig.channelSecret) {
  try {
    global.lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: appConfig.lineConfig.channelAccessToken
    });
    global.isLineConfigured = true;
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
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// โหลด Routes
const { router: authRouter, requireLogin } = require('./routes/auth');
const { setupDashboardRoute } = require('./routes/dashboard');
const { setupActivitiesRoutes } = require('./routes/activities');
const { setupPromotionsRoutes, containsPromotionKeyword, createPromotionFlexMessage, promotionsConfig } = require('./routes/promotions');
const { setupSettingsRoutes } = require('./routes/settings');
const { setupWebhookRoute } = require('./routes/webhook');

// ใช้งาน Routes
app.use('/', authRouter);
app.use('/', setupDashboardRoute(requireLogin, appConfig, userMessageHistory, getCooldownPeriod, promotionsConfig));
app.use('/', setupActivitiesRoutes(requireLogin, appConfig, userMessageHistory, getCooldownPeriod, saveConfig));
app.use('/', setupPromotionsRoutes(requireLogin));
app.use('/', setupSettingsRoutes(requireLogin, appConfig, saveConfig, userMessageHistory));
app.use('/', setupWebhookRoute(appConfig, userMessageHistory, getCooldownPeriod, containsPromotionKeyword, createPromotionFlexMessage));

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeUsers: userMessageHistory.size,
    lineConfigured: global.isLineConfigured,
    version: '2.0'
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 LINE OA Bot Server Started! (Version 2.0)');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔐 Login:       http://localhost:${PORT}/login`);
  console.log(`📊 Dashboard:   http://localhost:${PORT}/`);
  console.log(`🎁 Activities:  http://localhost:${PORT}/activities`);
  console.log(`🎨 Promotions:  http://localhost:${PORT}/promotions`);
  console.log(`⚙️  Settings:    http://localhost:${PORT}/settings`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🤖 LINE Bot:    ${global.isLineConfigured ? '✅ Configured' : '⚠️ Not Configured Yet'}`);
  console.log('='.repeat(60));
  
  if (!global.isLineConfigured) {
    console.log('⚠️  กรุณาไปที่หน้า Settings เพื่อตั้งค่า LINE API');
    console.log('   👉 http://localhost:${PORT}/settings');
  }
  
  console.log('\n💡 Tips:');
  console.log('   - กิจกรรมแชร์: จัดการข้อความและ Cooldown');
  console.log('   - โปรโมชั่น: สร้าง Flex Messages สวยงาม');
  console.log('   - Settings: ตั้งค่า LINE API และ Webhook\n');
});