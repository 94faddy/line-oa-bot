const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// โหลดการตั้งค่า Promotions
const promotionsPath = path.join(__dirname, '../data/promotions.json');

// สร้างไฟล์ promotions.json ถ้ายังไม่มี
if (!fs.existsSync(promotionsPath)) {
  const defaultPromotions = {
    promotionSettings: {
      keywords: ["โปร", "โปรโมชั่น", "promo", "promotion"],
      enabled: true,
      flexBackgroundColor: "#667eea",
      flexTextColor: "#ffffff"
    },
    flexMessages: []
  };
  fs.writeFileSync(promotionsPath, JSON.stringify(defaultPromotions, null, 2), 'utf8');
}

let promotionsConfig = JSON.parse(fs.readFileSync(promotionsPath, 'utf8'));

// Migration: เพิ่ม flexBackgroundColor และ flexTextColor ถ้ายังไม่มี
if (!promotionsConfig.promotionSettings.flexBackgroundColor) {
  promotionsConfig.promotionSettings.flexBackgroundColor = "#667eea";
  promotionsConfig.promotionSettings.flexTextColor = "#ffffff";
  fs.writeFileSync(promotionsPath, JSON.stringify(promotionsConfig, null, 2), 'utf8');
}

// Migration: เพิ่ม button, order, backgroundColor และ textColor ให้กับโปรโมชั่นเก่า
let needsMigration = false;
promotionsConfig.flexMessages.forEach((promo, index) => {
  if (!promo.button) {
    promo.button = {
      label: "ดูรายละเอียด",
      type: "uri",
      color: "#667eea",
      uri: promo.linkUrl || "https://line.me",
      text: ""
    };
    needsMigration = true;
  }
  if (promo.order === undefined) {
    promo.order = index + 1;
    needsMigration = true;
  }
  if (!promo.backgroundColor) {
    promo.backgroundColor = "#ffffff";
    needsMigration = true;
  }
  if (!promo.textColor) {
    promo.textColor = "#333333";
    needsMigration = true;
  }
});

if (needsMigration) {
  fs.writeFileSync(promotionsPath, JSON.stringify(promotionsConfig, null, 2), 'utf8');
  console.log('✅ Migrated promotions with button, order, backgroundColor and textColor fields');
}

// ฟังก์ชันบันทึก promotions
function savePromotions() {
  fs.writeFileSync(promotionsPath, JSON.stringify(promotionsConfig, null, 2), 'utf8');
}

// Promotions Management Page
function setupPromotionsRoutes(requireLogin) {
  // หน้าจัดการโปรโมชั่น
  router.get('/promotions', requireLogin, (req, res) => {
    // เรียงลำดับตาม order
    const sortedPromotions = [...promotionsConfig.flexMessages].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    res.render('promotions', {
      promotions: sortedPromotions,
      keywords: promotionsConfig.promotionSettings.keywords.join(', '),
      enabled: promotionsConfig.promotionSettings.enabled,
      flexBackgroundColor: promotionsConfig.promotionSettings.flexBackgroundColor || '#667eea',
      flexTextColor: promotionsConfig.promotionSettings.flexTextColor || '#ffffff',
      username: req.session.username
    });
  });

  // เพิ่มโปรโมชั่น
  router.post('/promotions/add', requireLogin, (req, res) => {
    try {
      const { 
        title, imageUrl, linkUrl, 
        backgroundColor, textColor,
        buttonLabel, buttonType, buttonColor, buttonUri, buttonText 
      } = req.body;
      
      const maxOrder = promotionsConfig.flexMessages.length > 0 
        ? Math.max(...promotionsConfig.flexMessages.map(p => p.order || 0)) 
        : 0;
      
      const newPromo = {
        id: `promo-${Date.now()}`,
        title: title || 'โปรโมชั่นใหม่',
        imageUrl: imageUrl || '',
        linkUrl: linkUrl || '',
        enabled: true,
        order: maxOrder + 1,
        backgroundColor: backgroundColor || '#ffffff',
        textColor: textColor || '#333333',
        button: {
          label: buttonLabel || 'ดูรายละเอียด',
          type: buttonType || 'uri',
          color: buttonColor || '#667eea',
          uri: buttonType === 'uri' ? (buttonUri || linkUrl || '') : '',
          text: buttonType === 'message' ? (buttonText || '') : ''
        }
      };
      
      promotionsConfig.flexMessages.push(newPromo);
      savePromotions();
      
      res.json({ success: true, message: 'เพิ่มโปรโมชั่นสำเร็จ' });
    } catch (error) {
      console.error('Error adding promotion:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มโปรโมชั่น' });
    }
  });

  // อัพเดทโปรโมชั่น
  router.post('/promotions/update', requireLogin, (req, res) => {
    try {
      const { 
        id, title, imageUrl, linkUrl, enabled,
        backgroundColor, textColor,
        buttonLabel, buttonType, buttonColor, buttonUri, buttonText 
      } = req.body;
      
      const index = promotionsConfig.flexMessages.findIndex(p => p.id === id);
      if (index !== -1) {
        promotionsConfig.flexMessages[index] = {
          ...promotionsConfig.flexMessages[index],
          title,
          imageUrl,
          linkUrl,
          enabled: enabled === 'true' || enabled === true,
          backgroundColor: backgroundColor || '#ffffff',
          textColor: textColor || '#333333',
          button: {
            label: buttonLabel || 'ดูรายละเอียด',
            type: buttonType || 'uri',
            color: buttonColor || '#667eea',
            uri: buttonType === 'uri' ? (buttonUri || linkUrl || '') : '',
            text: buttonType === 'message' ? (buttonText || '') : ''
          }
        };
        savePromotions();
        res.json({ success: true, message: 'อัพเดทโปรโมชั่นสำเร็จ' });
      } else {
        res.status(404).json({ success: false, message: 'ไม่พบโปรโมชั่น' });
      }
    } catch (error) {
      console.error('Error updating promotion:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัพเดทโปรโมชั่น' });
    }
  });

  // เปลี่ยนลำดับโปรโมชั่น
  router.post('/promotions/reorder', requireLogin, (req, res) => {
    try {
      const { orders } = req.body;
      
      orders.forEach(item => {
        const promo = promotionsConfig.flexMessages.find(p => p.id === item.id);
        if (promo) {
          promo.order = item.order;
        }
      });
      
      savePromotions();
      res.json({ success: true, message: 'เปลี่ยนลำดับสำเร็จ' });
    } catch (error) {
      console.error('Error reordering promotions:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเปลี่ยนลำดับ' });
    }
  });

  // ลบโปรโมชั่น
  router.post('/promotions/delete', requireLogin, (req, res) => {
    try {
      const { id } = req.body;
      
      promotionsConfig.flexMessages = promotionsConfig.flexMessages.filter(p => p.id !== id);
      savePromotions();
      
      res.json({ success: true, message: 'ลบโปรโมชั่นสำเร็จ' });
    } catch (error) {
      console.error('Error deleting promotion:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบโปรโมชั่น' });
    }
  });

  // อัพเดทการตั้งค่าโปรโมชั่น
  router.post('/promotions/settings', requireLogin, (req, res) => {
    try {
      const { keywords, enabled, flexBackgroundColor, flexTextColor } = req.body;
      
      promotionsConfig.promotionSettings.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
      promotionsConfig.promotionSettings.enabled = enabled === 'true' || enabled === true;
      promotionsConfig.promotionSettings.flexBackgroundColor = flexBackgroundColor || '#667eea';
      promotionsConfig.promotionSettings.flexTextColor = flexTextColor || '#ffffff';
      
      savePromotions();
      
      res.json({ success: true, message: 'อัพเดทการตั้งค่าสำเร็จ' });
    } catch (error) {
      console.error('Error updating promotion settings:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัพเดทการตั้งค่า' });
    }
  });

  // Preview Flex Message
  router.get('/promotions/preview', requireLogin, (req, res) => {
    try {
      const flexMessage = createPromotionFlexMessage();
      if (flexMessage) {
        res.json({ success: true, flex: flexMessage.contents });
      } else {
        res.json({ success: false, message: 'ไม่มีโปรโมชั่นที่เปิดใช้งาน' });
      }
    } catch (error) {
      console.error('Error creating preview:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

// ฟังก์ชันตรวจสอบว่าข้อความมีคีย์เวิร์ดโปรโมชั่นหรือไม่
function containsPromotionKeyword(text) {
  if (!text || !promotionsConfig.promotionSettings.enabled) return false;
  const lowerText = text.toLowerCase();
  return promotionsConfig.promotionSettings.keywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

// ฟังก์ชันสร้าง Flex Message สำหรับโปรโมชั่น
function createPromotionFlexMessage() {
  const enabledPromotions = promotionsConfig.flexMessages
    .filter(p => p.enabled)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  
  if (enabledPromotions.length === 0) {
    return null;
  }

  // สร้าง Bubble สำหรับแต่ละโปรโมชั่น
  const bubbles = enabledPromotions.map(promo => {
    const button = promo.button || {
      label: 'ดูรายละเอียด',
      type: 'uri',
      color: '#667eea',
      uri: promo.linkUrl || 'https://line.me',
      text: ''
    };

    const bubble = {
      type: "bubble",
      hero: {
        type: "image",
        url: promo.imageUrl || "https://via.placeholder.com/1040x1040/667eea/ffffff?text=Promotion",
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "cover",
        action: {
          type: "uri",
          uri: promo.linkUrl || "https://line.me"
        }
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: promo.title,
            weight: "bold",
            size: "md",
            wrap: true,
            color: promo.textColor || "#333333"
          }
        ],
        paddingAll: "15px",
        backgroundColor: promo.backgroundColor || "#ffffff"
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: button.type === 'uri' 
              ? {
                  type: "uri",
                  label: button.label || "ดูรายละเอียด",
                  uri: button.uri || promo.linkUrl || "https://line.me"
                }
              : {
                  type: "message",
                  label: button.label || "ดูรายละเอียด",
                  text: button.text || button.label || "ดูรายละเอียด"
                },
            style: "primary",
            color: button.color || "#667eea",
            height: "sm"
          }
        ],
        paddingAll: "15px",
        backgroundColor: promo.backgroundColor || "#ffffff"
      }
    };

    return bubble;
  });

  return {
    type: "flex",
    altText: "โปรโมชั่นพิเศษ",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}

module.exports = { 
  setupPromotionsRoutes, 
  containsPromotionKeyword, 
  createPromotionFlexMessage,
  promotionsConfig 
};