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
      bodyBackgroundColor: "#ffffff"
    },
    welcomeButtons: [
      {
        id: "btn-welcome-1",
        type: "uri",
        label: "🎨 โปรโมชั่น",
        uri: "https://m.w99.in/promotions",
        enabled: true,
        color: "#667eea",
        order: 0
      },
      {
        id: "btn-welcome-2",
        type: "message",
        label: "🎁 รับเครดิตฟรี",
        text: "ฟรี",
        enabled: true,
        color: "#28a745",
        order: 1
      },
      {
        id: "btn-welcome-3",
        type: "uri",
        label: "📝 สมัครสมาชิก",
        uri: "https://m.w99.in/register",
        enabled: true,
        color: "#ffc107",
        order: 2
      }
    ]
  };
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

// โหลด Welcome Config
let welcomeConfig = JSON.parse(fs.readFileSync(WELCOME_CONFIG_PATH, 'utf8'));

// Migration: เพิ่ม bodyBackgroundColor ถ้ายังไม่มี
if (!welcomeConfig.welcomeSettings.bodyBackgroundColor) {
  welcomeConfig.welcomeSettings.bodyBackgroundColor = "#ffffff";
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(welcomeConfig, null, 2), 'utf8');
}

// Migration: เพิ่ม order ให้กับปุ่มที่ยังไม่มี
let needsSave = false;
welcomeConfig.welcomeButtons.forEach((btn, index) => {
  if (btn.order === undefined) {
    btn.order = index;
    needsSave = true;
  }
});
if (needsSave) {
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(welcomeConfig, null, 2), 'utf8');
}

// ฟังก์ชันบันทึก Welcome Config
function saveWelcomeConfig() {
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(welcomeConfig, null, 2), 'utf8');
}

// ฟังก์ชันสร้าง Flex Message สำหรับ Welcome
function createWelcomeFlexMessage() {
  try {
    // ตรวจสอบว่า config ถูกโหลดมาหรือไม่
    if (!welcomeConfig || !welcomeConfig.welcomeSettings) {
      console.error('❌ Welcome config is not loaded properly');
      return null;
    }

    if (!welcomeConfig.welcomeSettings.enabled) {
      console.log('ℹ️ Welcome is disabled in config');
      return null;
    }

    const settings = welcomeConfig.welcomeSettings;
    
    // เรียงลำดับปุ่มตาม order แล้วกรองเฉพาะที่เปิดใช้งาน
    const enabledButtons = (welcomeConfig.welcomeButtons || [])
      .filter(btn => btn.enabled)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (enabledButtons.length === 0) {
      console.log('⚠️ No enabled buttons found');
      return null;
    }

    console.log(`📝 Creating Welcome Flex with ${enabledButtons.length} buttons`);

    // สร้าง Button Actions พร้อม validation เข้มงวด
    const buttonContents = enabledButtons.map(btn => {
      // ตรวจสอบ label
      if (!btn.label || typeof btn.label !== 'string' || btn.label.trim() === '') {
        console.warn(`⚠️ Button ${btn.id} has invalid label, skipping`);
        return null;
      }

      let action;
      if (btn.type === 'uri') {
        // ตรวจสอบ URI
        if (!btn.uri || typeof btn.uri !== 'string' || btn.uri.trim() === '') {
          console.warn(`⚠️ Button ${btn.id} (${btn.label}) has invalid URI, skipping`);
          return null;
        }
        // ตรวจสอบว่า URI เป็น URL ที่ถูกต้อง
        try {
          new URL(btn.uri);
        } catch (e) {
          console.warn(`⚠️ Button ${btn.id} (${btn.label}) has malformed URI: ${btn.uri}`);
          return null;
        }
        action = {
          type: 'uri',
          label: btn.label.trim(),
          uri: btn.uri.trim()
        };
      } else if (btn.type === 'message') {
        // ตรวจสอบ text
        if (!btn.text || typeof btn.text !== 'string' || btn.text.trim() === '') {
          console.warn(`⚠️ Button ${btn.id} (${btn.label}) has invalid text, skipping`);
          return null;
        }
        action = {
          type: 'message',
          label: btn.label.trim(),
          text: btn.text.trim()
        };
      } else {
        console.warn(`⚠️ Button ${btn.id} has invalid type: ${btn.type}`);
        return null;
      }

      return {
        type: "button",
        action: action,
        style: "primary",
        color: btn.color || "#667eea",
        height: "sm"
      };
    }).filter(btn => btn !== null);

    // ตรวจสอบว่ามีปุ่มที่ valid หรือไม่
    if (buttonContents.length === 0) {
      console.error('❌ No valid buttons found after filtering');
      return null;
    }

    console.log(`✅ Created ${buttonContents.length} valid buttons`);

    // สร้าง Body Contents
    const bodyContents = [
      {
        type: "text",
        text: settings.description || "ยินดีต้อนรับสู่บริการของเรา",
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
    ];

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
            text: settings.title || "ยินดีต้อนรับ!",
            color: settings.textColor || "#ffffff",
            size: "xl",
            weight: "bold",
            align: "center"
          }
        ],
        backgroundColor: settings.backgroundColor || "#667eea",
        paddingAll: "20px"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: bodyContents,
        paddingAll: "20px",
        backgroundColor: settings.bodyBackgroundColor || "#ffffff"
      }
    };

    // เพิ่ม Hero Image ถ้ามี
    if (settings.backgroundImageUrl && 
        typeof settings.backgroundImageUrl === 'string' && 
        settings.backgroundImageUrl.trim() !== '') {
      try {
        new URL(settings.backgroundImageUrl);
        flexMessage.hero = {
          type: "image",
          url: settings.backgroundImageUrl.trim(),
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover"
        };
        console.log('✅ Added hero image:', settings.backgroundImageUrl);
      } catch (e) {
        console.warn('⚠️ Invalid background image URL, skipping hero');
      }
    }

    console.log('✅ Welcome Flex Message created successfully');
    
    const finalMessage = {
      type: "flex",
      altText: settings.title || "ยินดีต้อนรับ!",
      contents: flexMessage
    };

    // Validate ขั้นสุดท้าย
    if (!finalMessage.type || !finalMessage.altText || !finalMessage.contents) {
      console.error('❌ Final message validation failed');
      return null;
    }

    return finalMessage;
  } catch (error) {
    console.error('❌ Error creating welcome flex message:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

// Setup Welcome Routes
function setupWelcomeRoutes(requireLogin) {
  
  // หน้าจัดการ Welcome Message
  router.get('/welcome', requireLogin, (req, res) => {
    // เรียงลำดับปุ่มตาม order ก่อนส่งไปแสดง
    const sortedButtons = [...welcomeConfig.welcomeButtons].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    res.render('welcome', {
      settings: welcomeConfig.welcomeSettings,
      buttons: sortedButtons,
      totalButtons: welcomeConfig.welcomeButtons.length,
      enabledButtons: welcomeConfig.welcomeButtons.filter(b => b.enabled).length,
      username: req.session.username
    });
  });

  // อัพเดทการตั้งค่า Welcome
  router.post('/welcome/settings', requireLogin, (req, res) => {
    try {
      const { enabled, showOnFollow, title, description, backgroundColor, textColor, bodyBackgroundColor, backgroundImageUrl } = req.body;
      
      welcomeConfig.welcomeSettings.enabled = enabled === 'true' || enabled === true;
      welcomeConfig.welcomeSettings.showOnFollow = showOnFollow === 'true' || showOnFollow === true;
      welcomeConfig.welcomeSettings.title = (title && title.trim()) || welcomeConfig.welcomeSettings.title;
      welcomeConfig.welcomeSettings.description = (description && description.trim()) || welcomeConfig.welcomeSettings.description;
      welcomeConfig.welcomeSettings.backgroundColor = (backgroundColor && backgroundColor.trim()) || '#667eea';
      welcomeConfig.welcomeSettings.textColor = (textColor && textColor.trim()) || '#ffffff';
      welcomeConfig.welcomeSettings.bodyBackgroundColor = (bodyBackgroundColor && bodyBackgroundColor.trim()) || '#ffffff';
      
      // จัดการ backgroundImageUrl
      if (backgroundImageUrl && backgroundImageUrl.trim() !== '') {
        try {
          new URL(backgroundImageUrl.trim());
          welcomeConfig.welcomeSettings.backgroundImageUrl = backgroundImageUrl.trim();
        } catch (e) {
          console.warn('Invalid background image URL provided, ignoring');
          delete welcomeConfig.welcomeSettings.backgroundImageUrl;
        }
      } else {
        delete welcomeConfig.welcomeSettings.backgroundImageUrl;
      }
      
      saveWelcomeConfig();
      
      console.log('✅ Welcome settings updated:', {
        enabled: welcomeConfig.welcomeSettings.enabled,
        showOnFollow: welcomeConfig.welcomeSettings.showOnFollow,
        hasBackgroundImage: !!welcomeConfig.welcomeSettings.backgroundImageUrl,
        bodyBackgroundColor: welcomeConfig.welcomeSettings.bodyBackgroundColor
      });
      
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      console.error('Error updating welcome settings:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เพิ่มปุ่ม Welcome
  router.post('/welcome/add-button', requireLogin, (req, res) => {
    try {
      const { type, label, uri, text, color } = req.body;
      
      if (!label || label.trim() === '') {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Label' });
      }

      if (type === 'uri' && (!uri || uri.trim() === '')) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก URI สำหรับปุ่มประเภท Link' });
      }

      if (type === 'message' && (!text || text.trim() === '')) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Text สำหรับปุ่มประเภท Message' });
      }

      // หา order ใหม่ (เอาค่าสูงสุด + 1)
      const maxOrder = welcomeConfig.welcomeButtons.length > 0 
        ? Math.max(...welcomeConfig.welcomeButtons.map(b => b.order || 0))
        : -1;

      const newButton = {
        id: `btn-welcome-${Date.now()}`,
        type: type,
        label: label.trim(),
        enabled: true,
        color: (color && color.trim()) || '#667eea',
        order: maxOrder + 1
      };

      if (type === 'uri') {
        newButton.uri = uri.trim();
      } else if (type === 'message') {
        newButton.text = text.trim();
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

      if (!label || label.trim() === '') {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Label' });
      }

      if (type === 'uri' && (!uri || uri.trim() === '')) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก URI' });
      }

      if (type === 'message' && (!text || text.trim() === '')) {
        return res.status(400).json({ success: false, message: 'กรุณากรอก Text' });
      }

      // เก็บ order เดิมไว้
      const currentOrder = welcomeConfig.welcomeButtons[index].order;

      welcomeConfig.welcomeButtons[index] = {
        id: id,
        type: type,
        label: label.trim(),
        enabled: enabled === 'true' || enabled === true,
        color: (color && color.trim()) || '#667eea',
        order: currentOrder !== undefined ? currentOrder : index
      };

      if (type === 'uri') {
        welcomeConfig.welcomeButtons[index].uri = uri.trim();
      } else if (type === 'message') {
        welcomeConfig.welcomeButtons[index].text = text.trim();
      }

      saveWelcomeConfig();
      
      res.json({ success: true, message: 'อัพเดทปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดทลำดับปุ่ม (ใหม่)
  router.post('/welcome/reorder-buttons', requireLogin, (req, res) => {
    try {
      const { buttonIds } = req.body;
      
      if (!Array.isArray(buttonIds)) {
        return res.status(400).json({ success: false, message: 'Invalid button IDs format' });
      }

      // อัพเดท order ตามลำดับใหม่
      buttonIds.forEach((id, index) => {
        const btn = welcomeConfig.welcomeButtons.find(b => b.id === id);
        if (btn) {
          btn.order = index;
        }
      });

      saveWelcomeConfig();
      
      res.json({ success: true, message: 'จัดเรียงปุ่มสำเร็จ' });
    } catch (error) {
      console.error('Error reordering buttons:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบปุ่ม Welcome
  router.post('/welcome/delete-button', requireLogin, (req, res) => {
    try {
      const { id } = req.body;
      
      welcomeConfig.welcomeButtons = welcomeConfig.welcomeButtons.filter(btn => btn.id !== id);
      
      // จัดเรียง order ใหม่
      welcomeConfig.welcomeButtons
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach((btn, index) => {
          btn.order = index;
        });
      
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
        res.json({ success: false, message: 'ไม่สามารถสร้าง Welcome Message ได้ กรุณาตรวจสอบการตั้งค่า' });
      }
    } catch (error) {
      console.error('Error in preview:', error);
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