const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// โฟลเดอร์เก็บไฟล์ Flex JSON
const FLEX_DIR = path.join(__dirname, '../flex');
const QUICKREPLY_CONFIG_PATH = path.join(__dirname, '../quickreply/config.json');

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(FLEX_DIR)) {
  fs.mkdirSync(FLEX_DIR, { recursive: true });
}

// สร้างโฟลเดอร์ quickreply ถ้ายังไม่มี
const quickreplyDir = path.join(__dirname, '../quickreply');
if (!fs.existsSync(quickreplyDir)) {
  fs.mkdirSync(quickreplyDir, { recursive: true });
}

// สร้างไฟล์ config.json สำหรับ Quick Reply ถ้ายังไม่มี
if (!fs.existsSync(QUICKREPLY_CONFIG_PATH)) {
  const defaultConfig = {
    quickReplySettings: {
      enabled: true,
      text: "เลือกรายการที่ต้องการได้เลยค่ะ",
      keywords: ["เมนู", "menu", "ปุ่มลอย"]
    },
    flexMessageSettings: {
      enabled: true,
      keywords: ["bonustime", "อัตราชนะ", "สถิติเกม"],
      sendWithQuickReply: true
    },
    quickReplyButtons: [
      {
        id: "btn-1",
        type: "uri",
        label: "สมัครสมาชิก",
        imageUrl: "https://cdn.linkz.ltd/images/line-quickreply/ic-logged-profile.png",
        uri: "https://m.top747.com/register",
        enabled: true
      },
      {
        id: "btn-2",
        type: "uri",
        label: "ทางเข้าเล่น",
        imageUrl: "https://cdn.linkz.ltd/images/line-quickreply/300x262.png",
        uri: "https://m.top747.com/",
        enabled: true
      },
      {
        id: "btn-3",
        type: "message",
        label: "bonustime",
        imageUrl: "https://cdn.linkz.ltd/images/line-quickreply/freegame.png",
        text: "bonustime",
        enabled: true
      }
    ]
  };
  fs.writeFileSync(QUICKREPLY_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

// โหลด Quick Reply Config
let quickReplyConfig = JSON.parse(fs.readFileSync(QUICKREPLY_CONFIG_PATH, 'utf8'));

// ฟังก์ชันบันทึก Quick Reply Config
function saveQuickReplyConfig() {
  fs.writeFileSync(QUICKREPLY_CONFIG_PATH, JSON.stringify(quickReplyConfig, null, 2), 'utf8');
}

// ฟังก์ชันโหลดไฟล์ Flex ทั้งหมด
function loadFlexFiles() {
  try {
    const files = fs.readdirSync(FLEX_DIR).filter(f => f.endsWith('.json'));
    return files.map(file => {
      const filePath = path.join(FLEX_DIR, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        id: file.replace('.json', ''),
        filename: file,
        content: content,
        size: (fs.statSync(filePath).size / 1024).toFixed(2) + ' KB',
        lastModified: fs.statSync(filePath).mtime.toLocaleString('th-TH')
      };
    });
  } catch (error) {
    console.error('Error loading flex files:', error);
    return [];
  }
}

// ฟังก์ชันสุ่ม Flex Message
function getRandomFlex() {
  try {
    if (!quickReplyConfig.flexMessageSettings.enabled) {
      return null;
    }

    const files = fs.readdirSync(FLEX_DIR).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      return {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [{
            type: "text",
            text: "ยังไม่มี Flex Message",
            color: "#666666",
            size: "lg",
            weight: "bold"
          }]
        }
      };
    }
    
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const filePath = path.join(FLEX_DIR, randomFile);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('Error getting random flex:', error);
    return null;
  }
}

// ฟังก์ชันสร้าง Quick Reply Menu
function getQuickReplyMenu() {
  try {
    if (!quickReplyConfig.quickReplySettings.enabled) {
      return null;
    }

    const enabledButtons = quickReplyConfig.quickReplyButtons.filter(btn => btn.enabled);
    
    if (enabledButtons.length === 0) {
      return null;
    }

    const items = enabledButtons.map(btn => {
      const item = {
        type: "action",
        imageUrl: btn.imageUrl || ""
      };

      if (btn.type === "uri") {
        item.action = {
          type: "uri",
          label: btn.label,
          uri: btn.uri
        };
      } else if (btn.type === "message") {
        item.action = {
          type: "message",
          label: btn.label,
          text: btn.text
        };
      }

      return item;
    });

    return {
      type: "text",
      text: quickReplyConfig.quickReplySettings.text,
      quickReply: {
        items: items
      }
    };
  } catch (error) {
    console.error('Error creating quick reply menu:', error);
    return null;
  }
}

// ฟังก์ชันตรวจสอบคีย์เวิร์ด Quick Reply
function containsQuickReplyKeyword(text) {
  if (!text || !quickReplyConfig.quickReplySettings.enabled) return false;
  const lowerText = text.toLowerCase();
  return quickReplyConfig.quickReplySettings.keywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

// ฟังก์ชันตรวจสอบคีย์เวิร์ด Flex Message
function containsFlexKeyword(text) {
  if (!text || !quickReplyConfig.flexMessageSettings.enabled) return false;
  const lowerText = text.toLowerCase();
  return quickReplyConfig.flexMessageSettings.keywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

// Setup Flex Routes
function setupFlexRoutes(requireLogin) {
  
  // หน้าจัดการ Flex Messages
  router.get('/flex-messages', requireLogin, (req, res) => {
    const flexFiles = loadFlexFiles();
    res.render('flex-messages', {
      flexFiles: flexFiles,
      totalFiles: flexFiles.length,
      quickReplyConfig: quickReplyConfig,
      username: req.session.username
    });
  });

  // ดูรายละเอียด Flex Message
  router.get('/flex-messages/view/:id', requireLogin, (req, res) => {
    try {
      const filename = req.params.id + '.json';
      const filePath = path.join(FLEX_DIR, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
      }
      
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      res.json({ success: true, content: content });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // แก้ไข Flex Message
  router.post('/flex-messages/update/:id', requireLogin, (req, res) => {
    try {
      const filename = req.params.id + '.json';
      const filePath = path.join(FLEX_DIR, filename);
      const { content } = req.body;
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
      }
      
      let jsonContent;
      try {
        jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'รูปแบบ JSON ไม่ถูกต้อง' });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2), 'utf8');
      
      res.json({ success: true, message: 'บันทึกสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เพิ่ม Flex Message ใหม่
  router.post('/flex-messages/add', requireLogin, (req, res) => {
    try {
      const { filename, content } = req.body;
      
      if (!filename || !content) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
      }
      
      const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.json';
      const filePath = path.join(FLEX_DIR, safeFilename);
      
      if (fs.existsSync(filePath)) {
        return res.status(400).json({ success: false, message: 'มีไฟล์ชื่อนี้อยู่แล้ว' });
      }
      
      let jsonContent;
      try {
        jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'รูปแบบ JSON ไม่ถูกต้อง' });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2), 'utf8');
      
      res.json({ success: true, message: 'เพิ่มไฟล์สำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบ Flex Message
  router.post('/flex-messages/delete/:id', requireLogin, (req, res) => {
    try {
      const filename = req.params.id + '.json';
      const filePath = path.join(FLEX_DIR, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
      }
      
      fs.unlinkSync(filePath);
      
      res.json({ success: true, message: 'ลบไฟล์สำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ทดสอบส่ง Flex Message
  router.post('/flex-messages/test/:id', requireLogin, async (req, res) => {
    try {
      const filename = req.params.id + '.json';
      const filePath = path.join(FLEX_DIR, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
      }
      
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      res.json({ 
        success: true, 
        message: 'ไฟล์ถูกต้อง สามารถใช้งานได้',
        preview: content
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'ไฟล์มีข้อผิดพลาด: ' + error.message });
    }
  });

  // =============== Quick Reply API ===============

  // อัพเดทการตั้งค่า Quick Reply
  router.post('/quickreply/settings', requireLogin, (req, res) => {
    try {
      const { enabled, text, keywords } = req.body;
      
      quickReplyConfig.quickReplySettings.enabled = enabled === 'true' || enabled === true;
      quickReplyConfig.quickReplySettings.text = text || quickReplyConfig.quickReplySettings.text;
      quickReplyConfig.quickReplySettings.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
      
      saveQuickReplyConfig();
      
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดทการตั้งค่า Flex Message Keywords
  router.post('/quickreply/flex-settings', requireLogin, (req, res) => {
    try {
      const { enabled, keywords, sendWithQuickReply } = req.body;
      
      quickReplyConfig.flexMessageSettings.enabled = enabled === 'true' || enabled === true;
      quickReplyConfig.flexMessageSettings.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
      quickReplyConfig.flexMessageSettings.sendWithQuickReply = sendWithQuickReply === 'true' || sendWithQuickReply === true;
      
      saveQuickReplyConfig();
      
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เพิ่มปุ่ม Quick Reply
  router.post('/quickreply/add-button', requireLogin, (req, res) => {
    try {
      const { type, label, imageUrl, uri, text } = req.body;
      
      const newButton = {
        id: `btn-${Date.now()}`,
        type: type,
        label: label,
        imageUrl: imageUrl || '',
        enabled: true
      };

      if (type === 'uri') {
        newButton.uri = uri;
      } else if (type === 'message') {
        newButton.text = text;
      }

      quickReplyConfig.quickReplyButtons.push(newButton);
      saveQuickReplyConfig();
      
      res.json({ success: true, message: 'เพิ่มปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดทปุ่ม Quick Reply
  router.post('/quickreply/update-button', requireLogin, (req, res) => {
    try {
      const { id, type, label, imageUrl, uri, text, enabled } = req.body;
      
      const index = quickReplyConfig.quickReplyButtons.findIndex(btn => btn.id === id);
      
      if (index === -1) {
        return res.status(404).json({ success: false, message: 'ไม่พบปุ่ม' });
      }

      quickReplyConfig.quickReplyButtons[index] = {
        id: id,
        type: type,
        label: label,
        imageUrl: imageUrl || '',
        enabled: enabled === 'true' || enabled === true
      };

      if (type === 'uri') {
        quickReplyConfig.quickReplyButtons[index].uri = uri;
      } else if (type === 'message') {
        quickReplyConfig.quickReplyButtons[index].text = text;
      }

      saveQuickReplyConfig();
      
      res.json({ success: true, message: 'อัพเดทปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบปุ่ม Quick Reply
  router.post('/quickreply/delete-button', requireLogin, (req, res) => {
    try {
      const { id } = req.body;
      
      quickReplyConfig.quickReplyButtons = quickReplyConfig.quickReplyButtons.filter(btn => btn.id !== id);
      saveQuickReplyConfig();
      
      res.json({ success: true, message: 'ลบปุ่มสำเร็จ' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = { 
  setupFlexRoutes,
  getRandomFlex,
  getQuickReplyMenu,
  containsQuickReplyKeyword,
  containsFlexKeyword,
  quickReplyConfig
};