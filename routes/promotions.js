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
      enabled: true
    },
    flexMessages: []
  };
  fs.writeFileSync(promotionsPath, JSON.stringify(defaultPromotions, null, 2), 'utf8');
}

let promotionsConfig = JSON.parse(fs.readFileSync(promotionsPath, 'utf8'));

// ฟังก์ชันบันทึก promotions
function savePromotions() {
  fs.writeFileSync(promotionsPath, JSON.stringify(promotionsConfig, null, 2), 'utf8');
}

// Promotions Management Page
function setupPromotionsRoutes(requireLogin) {
  // หน้าจัดการโปรโมชั่น
  router.get('/promotions', requireLogin, (req, res) => {
    res.render('promotions', {
      promotions: promotionsConfig.flexMessages || [],
      keywords: promotionsConfig.promotionSettings.keywords.join(', '),
      enabled: promotionsConfig.promotionSettings.enabled,
      username: req.session.username
    });
  });

  // เพิ่มโปรโมชั่น
  router.post('/promotions/add', requireLogin, (req, res) => {
    try {
      const { title, imageUrl, linkUrl } = req.body;
      
      const newPromo = {
        id: `promo-${Date.now()}`,
        title: title || 'โปรโมชั่นใหม่',
        imageUrl: imageUrl || '',
        linkUrl: linkUrl || '',
        enabled: true
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
      const { id, title, imageUrl, linkUrl, enabled } = req.body;
      
      const index = promotionsConfig.flexMessages.findIndex(p => p.id === id);
      if (index !== -1) {
        promotionsConfig.flexMessages[index] = {
          id,
          title,
          imageUrl,
          linkUrl,
          enabled: enabled === 'true' || enabled === true
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
      const { keywords, enabled } = req.body;
      
      promotionsConfig.promotionSettings.keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
      promotionsConfig.promotionSettings.enabled = enabled === 'true' || enabled === true;
      
      savePromotions();
      
      res.json({ success: true, message: 'อัพเดทการตั้งค่าสำเร็จ' });
    } catch (error) {
      console.error('Error updating promotion settings:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัพเดทการตั้งค่า' });
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
  const enabledPromotions = promotionsConfig.flexMessages.filter(p => p.enabled);
  
  if (enabledPromotions.length === 0) {
    return null;
  }

  // สร้าง Bubble สำหรับแต่ละโปรโมชั่น
  const bubbles = enabledPromotions.map(promo => ({
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
          size: "xl",
          color: "#667eea"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "ดูรายละเอียด",
            uri: promo.linkUrl || "https://line.me"
          },
          style: "primary",
          color: "#667eea"
        }
      ]
    }
  }));

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