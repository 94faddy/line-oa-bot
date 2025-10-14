const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// โฟลเดอร์เก็บ Welcome Config
const WELCOME_DIR = path.join(__dirname, '../welcome');
const WELCOME_CONFIG_PATH = path.join(WELCOME_DIR, 'config.json');

// สร้างโฟลเดอร์ welcome ถ้ายังไม่มี
if (!fs.existsSync(WELCOME_DIR)) {
  fs.mkdirSync(WELCOME_DIR, { recursive: true });
}

// สร้างไฟล์ config.json สำหรับ Welcome Message ถ้ายังไม่มี
if (!fs.existsSync(WELCOME_CONFIG_PATH)) {
  const defaultConfig = {
    welcomeSettings: {
      enabled: true,
      showOnFollow: true,
      title: "ยินดีต้อนรับสู่ W99! 🎉",
      description: "ขอบคุณที่เป็นเพื่อนกับเรา เลือกเมนูด้านล่างเพื่อเริ่มต้นใช้งาน",
      backgroundColor: "#667eea",
      textColor: "#ffffff",
      backgroundImageUrl: ""
    },
    welcomeButtons: [
      {
        id: "btn-welcome-1",
        type: "uri",
        label: "🎨 โปรโมชั่น",
        uri: "https://m.w99.in/promotions",
        enabled: true,
        color: "#667eea"
      },
      {
        id: "btn-welcome-2",
        type: "message",
        label: "🎁 รับเครดิตฟรี",
        text: "ฟรี",
        enabled: true,
        color: "#28a745"
      },
      {
        id: "btn-welcome-3",
        type: "uri",
        label: "📝 สมัครสมาชิก",
        uri: "https://m.w99.in/register",
        enabled: true,
        color: "#ffc107"
      },
      {
        id: "btn-welcome-4",
        type: "message",
        label: "🎮 เกมโบนัส",
        text: "bonustime",
        enabled: true,
        color: "#17a2b8"
      },
      {
        id: "btn-welcome-5",
        type: "uri",
        label: "💰 ฝากถอน",
        uri: "https://m.w99.in/",
        enabled: true,
        color: "#dc3545"
      }
    ]
  };
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

// โหลด Welcome Config
let welcomeConfig = JSON.parse(fs.readFileSync(WELCOME_CONFIG_PATH, 'utf8'));

// ฟังก์ชันบันทึก Welcome Config
function saveWelcomeConfig() {
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(welcomeConfig, null, 2), 'utf8');
}

// ฟังก์ชันสร้าง Flex Message สำหรับ Welcome
function createWelcomeFlexMessage() {
  try {
    if (!welcomeConfig.welcomeSettings.enabled) {
      return null;
    }

    const settings = welcomeConfig.welcomeSettings;
    const enabledButtons = welcomeConfig.welcomeButtons.filter(btn => btn.enabled);

    if (enabledButtons.length === 0) {
      return null;
    }

    // สร้าง Button Actions
    const buttonContents = enabledButtons.map(btn => {
      const action = btn.type === 'uri' ? {
        type: 'uri',
        label: btn.label,
        uri: btn.uri
      } : {
        type: 'message',
        label: btn.label,
        text: btn.text
      };

      return {
        type: "button",
        action: action,
        style: "primary",
        color: btn.color || "#667eea",
        height: "sm"
      };
    });

    // สร้าง Hero (รูปพื้นหลัง)
    const hero = settings.backgroundImageUrl ? {
      type: "image",
      url: settings.backgroundImageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover"
    } : null;

    // สร้าง Flex Message
    const flexMessage = {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: settings.title,
            color: settings.textColor,
            size: "xl",
            weight: "bold",
            align: "center"
          }
        ],
        backgroundColor: settings.backgroundColor,
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: settings.description,
            color: "#666666",
            size: "sm",
            wrap: true,
            align: "center",
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg"
          },
          {
            type: "box",
            layout: "vertical",
            contents: buttonContents,
            spacing: "sm",
            margin: "lg"
          }
        ],
        paddingAll: "20px"
      }
    };

    // เพิ่ม Hero ถ้ามี
    if (hero) {
      flexMessage.hero = hero;
    }

    return {
      type: "flex",
      altText: settings.title,
      contents: flexMessage
    };
  } catch (error) {
    console.error('Error creating welcome flex message:', error);
    return null;
  }
}

// Setup Welcome Routes
function setupWelcomeRoutes(requireLogin) {
  
  // หน้าจัดการ Welcome Message
  router.get('/welcome', requireLogin, (req, res) => {
    res.render('welcome', {
      settings: welcomeConfig.welcomeSettings,
      buttons: welcomeConfig.welcomeButtons,
      totalButtons: welcomeConfig.welcomeButtons.length,
      enabledButtons: welcomeConfig.welcomeButtons.filter(b => b.enabled).length,
      username: req.session.username
    });
  });

  // อัพเดทการตั้งค่า Welcome
  router.post('/welcome/settings', requireLogin, (req, res) => {
    try {
      const { enabled, showOnFollow, title, description, backgroundColor, textColor, backgroundImageUrl } = req.body;
      
      welcomeConfig.welcomeSettings.enabled = enabled === 'true' || enabled === true;
      welcomeConfig.welcomeSettings.showOnFollow = showOnFollow === 'true' || showOnFollow === true;
      welcomeConfig.welcomeSettings.title = title || welcomeConfig.welcomeSettings.title;
      welcomeConfig.welcomeSettings.description = description || welcomeConfig.welcomeSettings.description;
      welcomeConfig.welcomeSettings.backgroundColor = backgroundColor || '#667eea';
      welcomeConfig.welcomeSettings.textColor = textColor || '#ffffff';
      welcomeConfig.welcomeSettings.backgroundImageUrl = backgroundImageUrl || '';
      
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เพิ่มปุ่ม Welcome
  router.post('/welcome/add-button', requireLogin, (req, res) => {
    try {
      const { type, label, uri, text, color } = req.body;
      
      const newButton = {
        id: `btn-welcome-${Date.now()}`,
        type: type,
        label: label,
        enabled: true,
        color: color || '#667eea'
      };

      if (type === 'uri') {
        newButton.uri = uri;
      } else if (type === 'message') {
        newButton.text = text;
      }

      welcomeConfig.welcomeButtons.push(newButton);
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'เพิ่มปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดทปุ่ม Welcome
  router.post('/welcome/update-button', requireLogin, (req, res) => {
    try {
      const { id, type, label, uri, text, enabled, color } = req.body;
      
      const index = welcomeConfig.welcomeButtons.findIndex(btn => btn.id === id);
      
      if (index === -1) {
        return res.status(404).json({ success: false, message: 'ไม่พบปุ่ม' });
      }

      welcomeConfig.welcomeButtons[index] = {
        id: id,
        type: type,
        label: label,
        enabled: enabled === 'true' || enabled === true,
        color: color || '#667eea'
      };

      if (type === 'uri') {
        welcomeConfig.welcomeButtons[index].uri = uri;
      } else if (type === 'message') {
        welcomeConfig.welcomeButtons[index].text = text;
      }

      saveWelcomeConfig();
      
      res.json({ success: true, message: 'อัพเดทปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบปุ่ม Welcome
  router.post('/welcome/delete-button', requireLogin, (req, res) => {
    try {
      const { id } = req.body;
      
      welcomeConfig.welcomeButtons = welcomeConfig.welcomeButtons.filter(btn => btn.id !== id);
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'ลบปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Preview Welcome Message
  router.get('/welcome/preview', requireLogin, (req, res) => {
    try {
      const flexMessage = createWelcomeFlexMessage();
      
      if (flexMessage) {
        res.json({ success: true, flex: flexMessage.contents });
      } else {
        res.json({ success: false, message: 'Welcome Message ถูกปิดการใช้งาน' });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = { 
  setupWelcomeRoutes,
  createWelcomeFlexMessage,
  welcomeConfig
};