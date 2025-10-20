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
    activities: [],
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

// =====================================================
// MIGRATION SCRIPTS
// =====================================================

// Migration 1: แปลง config เก่าเป็นแบบใหม่
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

// Migration 2: เพิ่ม features ให้กับ channels เก่า
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
    needsSave = false;
  }
}

// Migration 3: สร้าง activities array ถ้ายังไม่มี
if (!appConfig.activities) {
  console.log('🔄 กำลังสร้าง activities array...');
  appConfig.activities = [];
  
  if (appConfig.botSettings && appConfig.botSettings.activityMessage) {
    const defaultActivity = {
      id: 'activity-' + Date.now(),
      name: 'กิจกรรมหลัก',
      enabled: true,
      useCooldown: true,
      allowSharedKeywords: true,
      message: appConfig.botSettings.activityMessage,
      cooldownMessage: appConfig.botSettings.cooldownMessage || "คุณได้รับกิจกรรมไปแล้วค่ะ กรุณารอ {timeLeft} ก่อนขอรับกิจกรรมอีกครั้งนะคะ 😊",
      keywords: appConfig.botSettings.keywords || ["ฟรี", "free"],
      cooldownHours: appConfig.botSettings.cooldownHours || 2,
      channels: appConfig.lineChannels ? appConfig.lineChannels.map(ch => ch.id) : [],
      createdAt: new Date().toISOString()
    };
    appConfig.activities.push(defaultActivity);
    console.log('✅ สร้างกิจกรรมเริ่มต้นจาก botSettings');
  }
  
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
  console.log('✅ Migration activities สำเร็จ');
}

// Migration 4: เพิ่ม useCooldown ให้กับกิจกรรมที่ไม่มี
if (appConfig.activities) {
  appConfig.activities.forEach(activity => {
    if (activity.useCooldown === undefined) {
      activity.useCooldown = true;
      needsSave = true;
      console.log(`✅ เพิ่ม useCooldown ให้กับกิจกรรม: ${activity.name}`);
    }
  });
  
  if (needsSave) {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
    console.log('✅ Migration useCooldown สำเร็จ');
    needsSave = false;
  }
}

// Migration 5: เพิ่ม allowSharedKeywords ให้กับกิจกรรมที่ไม่มี
if (appConfig.activities) {
  appConfig.activities.forEach(activity => {
    if (activity.allowSharedKeywords === undefined) {
      activity.allowSharedKeywords = true;
      needsSave = true;
      console.log(`✅ เพิ่ม allowSharedKeywords ให้กับกิจกรรม: ${activity.name}`);
    }
  });
  
  if (needsSave) {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
    console.log('✅ Migration allowSharedKeywords สำเร็จ');
    needsSave = false;
  }
}

// Migration 6: แปลง message เป็น messageBoxes
if (appConfig.activities) {
  appConfig.activities.forEach(activity => {
    if (activity.message && !activity.messageBoxes) {
      activity.messageBoxes = [
        {
          type: 'text',
          content: activity.message,
          altText: ''
        }
      ];
      needsSave = true;
      console.log(`✅ แปลง message เป็น messageBoxes สำหรับกิจกรรม: ${activity.name}`);
    }
    else if (!activity.message && !activity.messageBoxes) {
      activity.messageBoxes = [];
      needsSave = true;
      console.log(`⚠️ สร้าง messageBoxes เปล่าสำหรับกิจกรรม: ${activity.name}`);
    }
  });
  
  if (needsSave) {
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
    console.log('✅ Migration messageBoxes สำเร็จ');
    needsSave = false;
  }
}

// =====================================================
// END MIGRATION SCRIPTS
// =====================================================

// ฟังก์ชันบันทึก config
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
}

// LINE Bot Configuration
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
const { setupBroadcastRoutes } = require('./routes/broadcast');
const { setupWebhookRoute } = require('./routes/webhook');

// ใช้งาน Routes
app.use('/', authRouter);
app.use('/', setupDashboardRoute(requireLogin, appConfig, userMessageHistory, promotionsConfig));
app.use('/', setupWelcomeRoutes(requireLogin));
app.use('/', setupActivitiesRoutes(requireLogin, appConfig, userMessageHistory, saveConfig));
app.use('/', setupPromotionsRoutes(requireLogin));
app.use('/', setupFlexRoutes(requireLogin));
app.use('/', setupLiffRoutes(requireLogin));
app.use('/', setupBroadcastRoutes(requireLogin, appConfig));
app.use('/', setupSettingsRoutes(requireLogin, appConfig, saveConfig, userMessageHistory, initializeLineClients));
app.use('/', setupWebhookRoute(
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
));

// Health Check
app.get('/health', (req, res) => {
  const cooldownActivities = appConfig.activities ? appConfig.activities.filter(a => a.useCooldown !== false).length : 0;
  const noCooldownActivities = appConfig.activities ? appConfig.activities.filter(a => a.useCooldown === false).length : 0;
  const sharedKeywordsActivities = appConfig.activities ? appConfig.activities.filter(a => a.allowSharedKeywords !== false).length : 0;
  const noSharedKeywordsActivities = appConfig.activities ? appConfig.activities.filter(a => a.allowSharedKeywords === false).length : 0;
  const messageBoxesActivities = appConfig.activities ? appConfig.activities.filter(a => a.messageBoxes && a.messageBoxes.length > 0).length : 0;
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeUsers: userMessageHistory.size,
    lineConfigured: global.isLineConfigured,
    configuredChannels: global.lineClients.size,
    totalActivities: appConfig.activities ? appConfig.activities.length : 0,
    enabledActivities: appConfig.activities ? appConfig.activities.filter(a => a.enabled).length : 0,
    cooldownActivities: cooldownActivities,
    noCooldownActivities: noCooldownActivities,
    sharedKeywordsActivities: sharedKeywordsActivities,
    noSharedKeywordsActivities: noSharedKeywordsActivities,
    messageBoxesActivities: messageBoxesActivities,
    flexEnabled: quickReplyConfig.flexMessageSettings.enabled,
    quickReplyEnabled: quickReplyConfig.quickReplySettings.enabled,
    welcomeEnabled: welcomeConfig.welcomeSettings.enabled,
    liffEnabled: liffConfig.liffSettings.enabled,
    version: '4.1'
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN;

app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('🚀 LINE OA Bot Server Started! (Version 4.1 - Broadcast System)');
  console.log('='.repeat(70));
  console.log(`📡 Server running on port ${PORT}`);

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
  console.log(`📢 Broadcast:      http://localhost:${PORT}/broadcast`);
  console.log(`📤 LIFF Share:     http://localhost:${PORT}/liff`);
  console.log(`⚙️  Settings:       http://localhost:${PORT}/settings`);
  console.log('='.repeat(70));
  console.log(`🤖 LINE Channels:  ${global.lineClients.size} configured`);
  console.log(`🎁 Activities:     ${appConfig.activities ? appConfig.activities.length : 0} total, ${appConfig.activities ? appConfig.activities.filter(a => a.enabled).length : 0} enabled`);
  
  const cooldownCount = appConfig.activities ? appConfig.activities.filter(a => a.useCooldown !== false).length : 0;
  const noCooldownCount = appConfig.activities ? appConfig.activities.filter(a => a.useCooldown === false).length : 0;
  const sharedCount = appConfig.activities ? appConfig.activities.filter(a => a.allowSharedKeywords !== false).length : 0;
  const noSharedCount = appConfig.activities ? appConfig.activities.filter(a => a.allowSharedKeywords === false).length : 0;
  const messageBoxesCount = appConfig.activities ? appConfig.activities.filter(a => a.messageBoxes && a.messageBoxes.length > 0).length : 0;
  
  console.log(`   ⏱️  With Cooldown: ${cooldownCount}`);
  console.log(`   🚀 No Cooldown: ${noCooldownCount}`);
  console.log(`   🔗 Shared Keywords Allowed: ${sharedCount}`);
  console.log(`   🔒 Shared Keywords Blocked: ${noSharedCount}`);
  console.log(`   📦 Using MessageBoxes: ${messageBoxesCount}`);
  
  console.log(`👋 Welcome Message: ${welcomeConfig.welcomeSettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`💬 Flex Messages:  ${quickReplyConfig.flexMessageSettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`🔘 Quick Reply:    ${quickReplyConfig.quickReplySettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`📤 LIFF Share:     ${liffConfig.liffSettings.enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`📢 Broadcast:      ✅ Enabled`);
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
  
  if (appConfig.activities && appConfig.activities.length > 0) {
    console.log('\n🎁 Configured Activities:');
    appConfig.activities.forEach(activity => {
      if (activity.enabled) {
        const cooldownStatus = activity.useCooldown !== false ? `⏱️  ${activity.cooldownHours}h` : '🚀 No limit';
        const sharedStatus = activity.allowSharedKeywords !== false ? '🔗 Shared✅' : '🔒 Shared❌';
        const messageType = activity.messageBoxes ? `📦 ${activity.messageBoxes.length} boxes` : '📝 Text';
        const channelNames = activity.channels ? activity.channels.map(cid => {
          const ch = appConfig.lineChannels.find(c => c.id === cid);
          return ch ? ch.name : 'Unknown';
        }).join(', ') : 'None';
        console.log(`   ✅ ${activity.name} [${cooldownStatus}, ${sharedStatus}, ${messageType}]`);
        console.log(`      Keywords: ${activity.keywords.join(', ')}`);
        console.log(`      Channels: ${channelNames}`);
      }
    });
  }
  
  console.log('\n💡 Features:');
  console.log('   ✅ Multi-Channel: รองรับหลาย LINE OA');
  console.log('   ✅ Multi-Activities: รองรับหลายกิจกรรม แยก keyword, cooldown, channels');
  console.log('   ✅ Multi-Message Types: ส่งข้อความ, รูปภาพ, Flex Message ได้หลายรูปแบบ');
  console.log('   ✅ Message Ordering: เรียงลำดับการส่งข้อความได้');
  console.log('   ✅ Cooldown Toggle: เปิด/ปิด Cooldown แยกแต่ละกิจกรรม');
  console.log('   ✅ Shared Keywords: อนุญาต/ไม่อนุญาตคีย์เวิร์ดซ้ำระหว่างกิจกรรม');
  console.log('   ✅ Feature Control: เลือกฟีเจอร์แยกตาม Channel');
  console.log('   ✅ Welcome Message: ทักทายเพื่อนใหม่อัตโนมัติ');
  console.log('   ✅ กิจกรรมแชร์: จัดการข้อความและ Cooldown แยกแต่ละกิจกรรม');
  console.log('   ✅ โปรโมชั่น: สร้าง Flex Messages สวยงาม');
  console.log('   ✅ Flex Messages: สุ่มส่ง Flex + จัดการผ่าน Dashboard');
  console.log('   ✅ Quick Reply: จัดการปุ่มและคีย์เวิร์ดได้เต็มรูปแบบ');
  console.log('   ✅ LIFF Share: หน้าแชร์ LINE LIFF พร้อม Carousel');
  console.log('   ✅ Broadcast: ส่งข้อความแบบ Broadcast พร้อมตั้งเวลา');
  
  console.log('\n');
});