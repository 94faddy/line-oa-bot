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
    lineChannels: [],
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

// Migration: แปลง config เก่าเป็นแบบใหม่
if (appConfig.lineConfig && !appConfig.lineChannels) {
  console.log('🔄 กำลัง migrate config เป็นรูปแบบใหม่...');
  const oldChannel = {
    id: 'channel-' + Date.now(),
    name: 'LINE OA หลัก',
    channelAccessToken: appConfig.lineConfig.channelAccessToken || '',
    channelSecret: appConfig.lineConfig.channelSecret || '',
    profilePictureUrl: '',
    enabled: true,
    features: {
      welcome: true,
      activities: true,
      promotions: true,
      flexMessages: true
    },
    createdAt: new Date().toISOString()
  };
  appConfig.lineChannels = [oldChannel];
  delete appConfig.lineConfig;
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  console.log('✅ Migration สำเร็จ');
}

// Migration: เพิ่ม features ให้กับ channels เก่าที่ยังไม่มี
let needsSave = false;
if (appConfig.lineChannels) {
  appConfig.lineChannels.forEach(channel => {
    if (!channel.features) {
      channel.features = {
        welcome: true,
        activities: true,
        promotions: true,
        flexMessages: true
      };
      needsSave = true;
      console.log(`✅ เพิ่ม features ให้กับ channel: ${channel.name}`);
    } else if (channel.features.welcome === undefined) {
      channel.features.welcome = true;
      needsSave = true;
      console.log(`✅ เพิ่ม welcome feature ให้กับ channel: ${channel.name}`);
    }
  });
  
  if (needsSave) {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
    console.log('✅ Migration features สำเร็จ');
  }
}

// ฟังก์ชันบันทึก config
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
}

// LINE Bot Configuration (ใช้ global เพื่อให้ routes อื่นเข้าถึงได้)
global.lineChannels = appConfig.lineChannels || [];
global.lineClients = new Map();
global.isLineConfigured = false;

// สร้าง LINE clients สำหรับทุก channel ที่เปิดใช้งาน
function initializeLineClients() {
  global.lineClients.clear();
  let configuredCount = 0;
  
  global.lineChannels.forEach(channel => {
    if (channel.enabled && channel.channelAccessToken && channel.channelSecret) {
      try {
        const client = new line.messagingApi.MessagingApiClient({
          channelAccessToken: channel.channelAccessToken
        });
        global.lineClients.set(channel.id, {
          client: client,
          channelSecret: channel.channelSecret,
          config: channel
        });
        configuredCount++;
        console.log(`✅ LINE Bot configured: ${channel.name} (ID: ${channel.id})`);
      } catch (error) {
        console.log(`⚠️ Failed to configure ${channel.name}:`, error.message);
      }
    }
  });
  
  global.isLineConfigured = configuredCount > 0;
  return configuredCount;
}

// Initialize LINE clients
const configuredChannels = initializeLineClients();
console.log(`📱 Configured ${configuredChannels} LINE channel(s)`);

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
const { 
  setupFlexRoutes, 
  getRandomFlex, 
  getQuickReplyMenu,
  containsQuickReplyKeyword,
  containsFlexKeyword,
  quickReplyConfig
} = require('./routes/flexMessages');
const { 
  setupWelcomeRoutes, 
  createWelcomeFlexMessage, 
  welcomeConfig 
} = require('./routes/welcome');
const { 
  setupLiffRoutes,
  liffConfig
} = require('./routes/liff');
const { setupWebhookRoute } = require('./routes/webhook');

// ใช้งาน Routes
app.use('/', authRouter);
app.use('/', setupDashboardRoute(requireLogin, appConfig, userMessageHistory, getCooldownPeriod, promotionsConfig));
app.use('/', setupWelcomeRoutes(requireLogin));
app.use('/', setupActivitiesRoutes(requireLogin, appConfig, userMessageHistory, getCooldownPeriod, saveConfig));
app.use('/', setupPromotionsRoutes(requireLogin));
app.use('/', setupFlexRoutes(requireLogin));
app.use('/', setupLiffRoutes(requireLogin));
app.use('/', setupSettingsRoutes(requireLogin, appConfig, saveConfig, userMessageHistory, initializeLineClients));
app.use('/', setupWebhookRoute(
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
));

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeUsers: userMessageHistory.size,
    lineConfigured: global.isLineConfigured,
    configuredChannels: global.lineClients.size,
    flexEnabled: quickReplyConfig.flexMessageSettings.enabled,
    quickReplyEnabled: quickReplyConfig.quickReplySettings.enabled,
    welcomeEnabled: welcomeConfig.welcomeSettings.enabled,
    liffEnabled: liffConfig.liffSettings.enabled,
    version: '3.0'
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN;

app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('🚀 LINE OA Bot Server Started! (Version 3.0 - LIFF Share)');
  console.log('='.repeat(70));
  console.log(`📡 Server running on port ${PORT}`);

  // แสดง Webhook URL ตาม DOMAIN
  if (DOMAIN) {
    const protocol = DOMAIN.includes('localhost') ? 'http' : 'https';
    console.log(`🔗 Webhook URL: ${protocol}://${DOMAIN}/webhook`);
    console.log(`📤 LIFF Share URL: ${protocol}://${DOMAIN}/liff/share`);
  } else {
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`📤 LIFF Share URL: http://localhost:${PORT}/liff/share`);
    console.log(`⚠️  แนะนำ: ตั้งค่า DOMAIN ใน .env สำหรับ Production`);
  }

  console.log(`\n📍 URLs:`);
  console.log(`🔐 Login:          http://localhost:${PORT}/login`);
  console.log(`📊 Dashboard:      http://localhost:${PORT}/`);
  console.log(`👋 Welcome:        http://localhost:${PORT}/welcome`);
  console.log(`🎁 Activities:     http://localhost:${PORT}/activities`);
  console.log(`🎨 Promotions:     http://localhost:${PORT}/promotions`);
  console.log(`💬 Flex Messages:  http://localhost:${PORT}/flex-messages`);
  console.log(`📤 LIFF Share:     http://localhost:${PORT}/liff`);
  console.log(`⚙️  Settings:       http://localhost:${PORT}/settings`);
  console.log('='.repeat(70));
  console.log(`🤖 LINE Channels:  ${global.lineClients.size} configured`);
  console.log(`👋 Welcome Message: ${welcomeConfig.welcomeSettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`💬 Flex Messages:  ${quickReplyConfig.flexMessageSettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`🔘 Quick Reply:    ${quickReplyConfig.quickReplySettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`📤 LIFF Share:     ${liffConfig.liffSettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log('='.repeat(70));
  
  if (global.lineClients.size === 0) {
    console.log('⚠️  กรุณาไปที่หน้า Settings เพื่อเพิ่ม LINE Channel');
    console.log(`   👉 http://localhost:${PORT}/settings`);
  } else {
    console.log('📱 Configured LINE Channels:');
    global.lineChannels.forEach(channel => {
      if (channel.enabled) {
        const features = [];
        if (channel.features?.welcome) features.push('Welcome');
        if (channel.features?.activities) features.push('Activities');
        if (channel.features?.promotions) features.push('Promotions');
        if (channel.features?.flexMessages) features.push('Flex');
        console.log(`   ✅ ${channel.name} [${features.join(', ')}]`);
      }
    });
  }
  
  console.log('\n💡 Features:');
  console.log('   ✅ Multi-Channel: รองรับหลาย LINE OA');
  console.log('   ✅ Feature Control: เลือกฟีเจอร์แยกตาม Channel');
  console.log('   ✅ Welcome Message: ทักทายเพื่อนใหม่อัตโนมัติ');
  console.log('   ✅ กิจกรรมแชร์: จัดการข้อความและ Cooldown');
  console.log('   ✅ โปรโมชั่น: สร้าง Flex Messages สวยงาม');
  console.log('   ✅ Flex Messages: สุ่มส่ง Flex + จัดการผ่าน Dashboard');
  console.log('   ✅ Quick Reply: จัดการปุ่มและคีย์เวิร์ดได้เต็มรูปแบบ');
  console.log('   ✅ LIFF Share: หน้าแชร์ LINE LIFF พร้อม Carousel');
  
  console.log('\n🔑 Keywords:');
  console.log(`   🎁 Activity: ${appConfig.botSettings.keywords.join(', ')}`);
  console.log(`   🎨 Promotion: ${promotionsConfig.promotionSettings.keywords.join(', ')}`);
  console.log(`   💬 Flex: ${quickReplyConfig.flexMessageSettings.keywords.join(', ')}`);
  console.log(`   🔘 Quick Reply: ${quickReplyConfig.quickReplySettings.keywords.join(', ')}`);
  
  if (liffConfig.liffSettings.enabled && liffConfig.liffSettings.liffId) {
    console.log(`\n📤 LIFF Info:`);
    console.log(`   LIFF ID: ${liffConfig.liffSettings.liffId}`);
    console.log(`   Flex Messages: ${liffConfig.flexMessages.filter(f => f.enabled).length} enabled`);
  }
  
  console.log('\n');
});