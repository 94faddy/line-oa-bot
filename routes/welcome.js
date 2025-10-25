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

// Default Config Structure
const getDefaultConfig = () => ({
  welcomeSettings: {
    enabled: true,
    showOnFollow: true
  },
  welcomeBoxes: []
});

// สร้างไฟล์ config.json สำหรับ Welcome Message ถ้ายังไม่มี
if (!fs.existsSync(WELCOME_CONFIG_PATH)) {
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(getDefaultConfig(), null, 2), 'utf8');
}

// โหลด Welcome Config
let welcomeConfig = JSON.parse(fs.readFileSync(WELCOME_CONFIG_PATH, 'utf8'));

// Migration: แปลงจาก config เดิมเป็นแบบใหม่
let needsSave = false;

// ถ้ามี welcomeButtons แบบเดิม ให้แปลงเป็น welcomeBox
if (welcomeConfig.welcomeButtons && !welcomeConfig.welcomeBoxes) {
  console.log('🔄 Migrating old welcome config to new format...');
  
  const newBox = {
    id: 'box-' + Date.now(),
    name: 'Welcome Box 1',
    editorMode: welcomeConfig.welcomeSettings?.editorMode || 'template',
    enabledChannels: welcomeConfig.welcomeSettings?.enabledChannels || [],
    enabled: true,
    templateSettings: {
      title: welcomeConfig.welcomeSettings?.title || "ยินดีต้อนรับ!",
      description: welcomeConfig.welcomeSettings?.description || "ขอบคุณที่เป็นเพื่อนกับเรา",
      backgroundColor: welcomeConfig.welcomeSettings?.backgroundColor || "#667eea",
      textColor: welcomeConfig.welcomeSettings?.textColor || "#ffffff",
      bodyBackgroundColor: welcomeConfig.welcomeSettings?.bodyBackgroundColor || "#ffffff",
      backgroundImageUrl: welcomeConfig.welcomeSettings?.backgroundImageUrl || null,
      buttons: welcomeConfig.welcomeButtons || []
    },
    customFlexJson: welcomeConfig.welcomeSettings?.customFlexJson || null,
    createdAt: new Date().toISOString()
  };
  
  welcomeConfig.welcomeBoxes = [newBox];
  delete welcomeConfig.welcomeButtons;
  
  // ลบ settings เก่าที่ไม่จำเป็น
  welcomeConfig.welcomeSettings = {
    enabled: welcomeConfig.welcomeSettings?.enabled !== false,
    showOnFollow: welcomeConfig.welcomeSettings?.showOnFollow !== false
  };
  
  needsSave = true;
}

// ลบ priority จาก boxes เก่า
if (welcomeConfig.welcomeBoxes) {
  welcomeConfig.welcomeBoxes.forEach(box => {
    if (box.priority !== undefined) {
      delete box.priority;
      needsSave = true;
    }
  });
}

// ตรวจสอบว่ามี welcomeBoxes หรือไม่
if (!welcomeConfig.welcomeBoxes) {
  welcomeConfig.welcomeBoxes = [];
  needsSave = true;
}

// ตรวจสอบ welcomeSettings
if (!welcomeConfig.welcomeSettings) {
  welcomeConfig.welcomeSettings = {
    enabled: true,
    showOnFollow: true
  };
  needsSave = true;
}

if (needsSave) {
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(welcomeConfig, null, 2), 'utf8');
  console.log('✅ Migration completed');
}

// ฟังก์ชันบันทึก Welcome Config
function saveWelcomeConfig() {
  fs.writeFileSync(WELCOME_CONFIG_PATH, JSON.stringify(welcomeConfig, null, 2), 'utf8');
}

// ฟังก์ชันสร้าง Flex Message สำหรับ Welcome (หา Box ที่เหมาะสมกับ Channel)
function createWelcomeFlexMessage(channelId = null) {
  try {
    // ตรวจสอบว่า Welcome ถูกเปิดใช้งานหรือไม่
    if (!welcomeConfig?.welcomeSettings?.enabled) {
      console.log('ℹ️ Welcome is globally disabled');
      return null;
    }

    // หา Welcome Box แรกที่ใช้ได้กับ channel นี้
    const availableBox = welcomeConfig.welcomeBoxes.find(box => {
      // Box ต้องเปิดใช้งาน
      if (!box.enabled) return false;
      
      // ถ้า box ไม่ได้เลือก channel ไว้เลย = ใช้กับทุก channel
      if (!box.enabledChannels || box.enabledChannels.length === 0) {
        return true;
      }
      
      // ถ้าระบุ channelId ให้ตรวจสอบว่าอยู่ในรายการหรือไม่
      if (channelId) {
        return box.enabledChannels.includes(channelId);
      }
      
      return true;
    });

    if (!availableBox) {
      console.log(`ℹ️ No Welcome Box available for channel: ${channelId}`);
      return null;
    }
    
    console.log(`📝 Using Welcome Box: ${availableBox.name} (ID: ${availableBox.id})`);

    // สร้าง Flex Message จาก Box ที่เลือก
    if (availableBox.editorMode === 'json' && availableBox.customFlexJson) {
      try {
        let flexJson;
        if (typeof availableBox.customFlexJson === 'string') {
          flexJson = JSON.parse(availableBox.customFlexJson);
        } else {
          flexJson = availableBox.customFlexJson;
        }

        // Validate ว่าเป็น Flex Message ที่ถูกต้อง
        if (!flexJson.type || (flexJson.type !== 'bubble' && flexJson.type !== 'carousel')) {
          console.error('❌ Invalid Flex JSON: must be bubble or carousel');
          return null;
        }

        console.log('✅ Using custom JSON Flex Message');
        
        return {
          type: "flex",
          altText: availableBox.name || "Welcome Message",
          contents: flexJson
        };
      } catch (error) {
        console.error('❌ Error parsing custom JSON:', error);
        // Fallback to template mode ถ้า JSON error
      }
    }

    // Template Mode - สร้าง Flex จาก template
    const settings = availableBox.templateSettings;
    
    if (!settings) {
      console.error('❌ No template settings found in box');
      return null;
    }

    // เรียงลำดับปุ่มและกรองเฉพาะที่เปิดใช้งาน
    const enabledButtons = (settings.buttons || [])
      .filter(btn => btn.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    console.log(`📝 Creating Welcome Flex with ${enabledButtons.length} buttons (Template Mode)`);

    // สร้าง Button Actions
    const buttonContents = enabledButtons.map(btn => {
      if (!btn.label || typeof btn.label !== 'string' || btn.label.trim() === '') {
        return null;
      }

      let action;
      if (btn.type === 'uri') {
        if (!btn.uri || typeof btn.uri !== 'string' || btn.uri.trim() === '') {
          return null;
        }
        try {
          new URL(btn.uri);
        } catch (e) {
          return null;
        }
        action = {
          type: 'uri',
          label: btn.label.trim(),
          uri: btn.uri.trim()
        };
      } else if (btn.type === 'message') {
        if (!btn.text || typeof btn.text !== 'string' || btn.text.trim() === '') {
          return null;
        }
        action = {
          type: 'message',
          label: btn.label.trim(),
          text: btn.text.trim()
        };
      } else {
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
      }
    ];

    // เพิ่มปุ่มถ้ามี
    if (buttonContents.length > 0) {
      bodyContents.push({
        type: "separator",
        margin: "lg"
      });
      bodyContents.push({
        type: "box",
        layout: "vertical",
        contents: buttonContents,
        spacing: "sm",
        margin: "lg"
      });
    }

    // สร้าง Flex Message
    const flexMessage = {
      type: "bubble",
      size: "mega"
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
        console.warn('⚠️ Invalid background image URL');
      }
    }

    // เพิ่ม Header
    flexMessage.header = {
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
    };

    // เพิ่ม Body
    flexMessage.body = {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      paddingAll: "20px",
      backgroundColor: settings.bodyBackgroundColor || "#ffffff"
    };

    console.log('✅ Welcome Flex Message created successfully');
    
    return {
      type: "flex",
      altText: settings.title || "ยินดีต้อนรับ!",
      contents: flexMessage
    };

  } catch (error) {
    console.error('❌ Error creating welcome flex message:', error);
    return null;
  }
}

// Setup Welcome Routes
function setupWelcomeRoutes(requireLogin, appConfig) {
  
  // หน้าจัดการ Welcome Message
  router.get('/welcome', requireLogin, (req, res) => {
    const lineChannels = appConfig.lineChannels || [];
    
    res.render('welcome', {
      settings: welcomeConfig.welcomeSettings,
      welcomeBoxes: welcomeConfig.welcomeBoxes || [],
      lineChannels: lineChannels,
      username: req.session.username
    });
  });

  // สร้าง Welcome Box ใหม่
  router.post('/welcome/create-box', requireLogin, (req, res) => {
    try {
      const newBox = {
        id: 'box-' + Date.now(),
        name: req.body.name || `Welcome Box ${(welcomeConfig.welcomeBoxes?.length || 0) + 1}`,
        editorMode: 'template',
        enabledChannels: [],
        enabled: true,
        templateSettings: {
          title: "ยินดีต้อนรับ! 🎉",
          description: "ขอบคุณที่เป็นเพื่อนกับเรา",
          backgroundColor: "#667eea",
          textColor: "#ffffff",
          bodyBackgroundColor: "#ffffff",
          backgroundImageUrl: null,
          buttons: []
        },
        customFlexJson: null,
        createdAt: new Date().toISOString()
      };

      if (!welcomeConfig.welcomeBoxes) {
        welcomeConfig.welcomeBoxes = [];
      }
      
      welcomeConfig.welcomeBoxes.push(newBox);
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'สร้าง Welcome Box สำเร็จ', boxId: newBox.id });
    } catch (error) {
      console.error('Error creating welcome box:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดทการตั้งค่า Welcome Settings (Global)
  router.post('/welcome/settings', requireLogin, (req, res) => {
    try {
      const { enabled, showOnFollow } = req.body;
      
      welcomeConfig.welcomeSettings.enabled = enabled === 'true' || enabled === true;
      welcomeConfig.welcomeSettings.showOnFollow = showOnFollow === 'true' || showOnFollow === true;
      
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดท Welcome Box
  router.post('/welcome/update-box', requireLogin, (req, res) => {
    try {
      const { boxId, ...updates } = req.body;
      
      const boxIndex = welcomeConfig.welcomeBoxes.findIndex(box => box.id === boxId);
      if (boxIndex === -1) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Welcome Box' });
      }

      const box = welcomeConfig.welcomeBoxes[boxIndex];

      // อัพเดทค่าต่างๆ
      if (updates.name !== undefined) box.name = updates.name;
      if (updates.enabled !== undefined) box.enabled = updates.enabled === true || updates.enabled === 'true';
      if (updates.editorMode !== undefined) box.editorMode = updates.editorMode;
      if (updates.enabledChannels !== undefined) box.enabledChannels = updates.enabledChannels;

      // อัพเดท Template Settings
      if (updates.templateSettings) {
        box.templateSettings = { ...box.templateSettings, ...updates.templateSettings };
      }

      // อัพเดท Custom JSON
      if (updates.editorMode === 'json' && updates.customFlexJson !== undefined) {
        try {
          // Validate JSON
          if (updates.customFlexJson) {
            const parsed = JSON.parse(updates.customFlexJson);
            if (!parsed.type || (parsed.type !== 'bubble' && parsed.type !== 'carousel')) {
              return res.status(400).json({ 
                success: false, 
                message: 'JSON ต้องเป็น Flex Message ประเภท bubble หรือ carousel' 
              });
            }
          }
          box.customFlexJson = updates.customFlexJson;
        } catch (e) {
          return res.status(400).json({ 
            success: false, 
            message: 'รูปแบบ JSON ไม่ถูกต้อง: ' + e.message 
          });
        }
      }

      saveWelcomeConfig();
      
      res.json({ success: true, message: 'อัพเดท Welcome Box สำเร็จ' });
    } catch (error) {
      console.error('Error updating welcome box:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบ Welcome Box
  router.post('/welcome/delete-box', requireLogin, (req, res) => {
    try {
      const { boxId } = req.body;
      
      welcomeConfig.welcomeBoxes = welcomeConfig.welcomeBoxes.filter(box => box.id !== boxId);
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'ลบ Welcome Box สำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เพิ่มปุ่มใน Welcome Box
  router.post('/welcome/add-button', requireLogin, (req, res) => {
    try {
      const { boxId, type, label, uri, text, color } = req.body;
      
      const box = welcomeConfig.welcomeBoxes.find(b => b.id === boxId);
      if (!box) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Welcome Box' });
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

      if (!box.templateSettings) {
        box.templateSettings = { buttons: [] };
      }
      if (!box.templateSettings.buttons) {
        box.templateSettings.buttons = [];
      }

      const maxOrder = box.templateSettings.buttons.length > 0 
        ? Math.max(...box.templateSettings.buttons.map(b => b.order || 0))
        : -1;

      const newButton = {
        id: `btn-${Date.now()}`,
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

      box.templateSettings.buttons.push(newButton);
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'เพิ่มปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดทปุ่มใน Welcome Box
  router.post('/welcome/update-button', requireLogin, (req, res) => {
    try {
      const { boxId, buttonId, ...updates } = req.body;
      
      const box = welcomeConfig.welcomeBoxes.find(b => b.id === boxId);
      if (!box || !box.templateSettings || !box.templateSettings.buttons) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Box หรือปุ่ม' });
      }

      const buttonIndex = box.templateSettings.buttons.findIndex(btn => btn.id === buttonId);
      if (buttonIndex === -1) {
        return res.status(404).json({ success: false, message: 'ไม่พบปุ่ม' });
      }

      const button = box.templateSettings.buttons[buttonIndex];
      
      // อัพเดทค่าต่างๆ
      if (updates.type !== undefined) button.type = updates.type;
      if (updates.label !== undefined) button.label = updates.label;
      if (updates.enabled !== undefined) button.enabled = updates.enabled === true || updates.enabled === 'true';
      if (updates.color !== undefined) button.color = updates.color;
      if (updates.order !== undefined) button.order = updates.order;
      
      if (button.type === 'uri' && updates.uri !== undefined) {
        button.uri = updates.uri;
      } else if (button.type === 'message' && updates.text !== undefined) {
        button.text = updates.text;
      }

      saveWelcomeConfig();
      
      res.json({ success: true, message: 'อัพเดทปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบปุ่มใน Welcome Box
  router.post('/welcome/delete-button', requireLogin, (req, res) => {
    try {
      const { boxId, buttonId } = req.body;
      
      const box = welcomeConfig.welcomeBoxes.find(b => b.id === boxId);
      if (!box || !box.templateSettings || !box.templateSettings.buttons) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Box หรือปุ่ม' });
      }

      box.templateSettings.buttons = box.templateSettings.buttons.filter(btn => btn.id !== buttonId);
      
      // จัดเรียง order ใหม่
      box.templateSettings.buttons.sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach((btn, index) => {
          btn.order = index;
        });
      
      saveWelcomeConfig();
      
      res.json({ success: true, message: 'ลบปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Preview Welcome Box
  router.get('/welcome/preview/:boxId', requireLogin, (req, res) => {
    try {
      const { boxId } = req.params;
      const box = welcomeConfig.welcomeBoxes.find(b => b.id === boxId);
      
      if (!box) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Welcome Box' });
      }

      let flexContents;
      
      if (box.editorMode === 'json' && box.customFlexJson) {
        try {
          flexContents = JSON.parse(box.customFlexJson);
        } catch (e) {
          return res.json({ success: false, message: 'JSON ไม่ถูกต้อง' });
        }
      } else {
        // สร้าง Flex จาก template - ใช้ logic เดียวกับ createWelcomeFlexMessage
        const settings = box.templateSettings;
        
        const enabledButtons = (settings.buttons || [])
          .filter(btn => btn.enabled !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        const buttonContents = enabledButtons.map(btn => {
          if (!btn.label) return null;
          
          let action;
          if (btn.type === 'uri' && btn.uri) {
            action = { type: 'uri', label: btn.label, uri: btn.uri };
          } else if (btn.type === 'message' && btn.text) {
            action = { type: 'message', label: btn.label, text: btn.text };
          } else {
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

        const bodyContents = [
          {
            type: "text",
            text: settings.description || "ยินดีต้อนรับ",
            color: "#666666",
            size: "sm",
            wrap: true,
            align: "center",
            margin: "md"
          }
        ];

        if (buttonContents.length > 0) {
          bodyContents.push({
            type: "separator",
            margin: "lg"
          });
          bodyContents.push({
            type: "box",
            layout: "vertical",
            contents: buttonContents,
            spacing: "sm",
            margin: "lg"
          });
        }

        flexContents = {
          type: "bubble",
          size: "mega"
        };

        if (settings.backgroundImageUrl) {
          flexContents.hero = {
            type: "image",
            url: settings.backgroundImageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          };
        }

        flexContents.header = {
          type: "box",
          layout: "vertical",
          contents: [{
            type: "text",
            text: settings.title || "ยินดีต้อนรับ!",
            color: settings.textColor || "#ffffff",
            size: "xl",
            weight: "bold",
            align: "center"
          }],
          backgroundColor: settings.backgroundColor || "#667eea",
          paddingAll: "20px"
        };

        flexContents.body = {
          type: "box",
          layout: "vertical",
          contents: bodyContents,
          paddingAll: "20px",
          backgroundColor: settings.bodyBackgroundColor || "#ffffff"
        };
      }
      
      res.json({ success: true, flex: flexContents });
    } catch (error) {
      console.error('Error in preview:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Validate JSON
  router.post('/welcome/validate-json', requireLogin, (req, res) => {
    try {
      const { json } = req.body;
      
      if (!json) {
        return res.json({ success: false, message: 'กรุณาใส่ JSON' });
      }

      const parsed = JSON.parse(json);
      
      if (!parsed.type) {
        return res.json({ success: false, message: 'JSON ต้องมี type field' });
      }

      if (parsed.type !== 'bubble' && parsed.type !== 'carousel') {
        return res.json({ success: false, message: 'type ต้องเป็น bubble หรือ carousel' });
      }

      res.json({ success: true, message: 'JSON ถูกต้อง', flex: parsed });
    } catch (error) {
      res.json({ success: false, message: 'JSON ไม่ถูกต้อง: ' + error.message });
    }
  });

  return router;
}

module.exports = { 
  setupWelcomeRoutes,
  createWelcomeFlexMessage,
  welcomeConfig
};