const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// โฟลเดอร์เก็บ LIFF Config
const LIFF_DIR = path.join(__dirname, '../liff');
const LIFF_CONFIG_PATH = path.join(LIFF_DIR, 'config.json');

// สร้างโฟลเดอร์ liff ถ้ายังไม่มี
if (!fs.existsSync(LIFF_DIR)) {
  fs.mkdirSync(LIFF_DIR, { recursive: true });
}

// สร้างไฟล์ config.json สำหรับ LIFF ถ้ายังไม่มี
if (!fs.existsSync(LIFF_CONFIG_PATH)) {
  const defaultConfig = {
    liffSettings: {
      enabled: false,
      liffId: '',
      pageTitle: 'DOBBY99 เว็บสล็อตออนไลน์ที่มั่นคงที่สุดในตอนนี้ !!!',
      shareText: '✨ แชร์ลงกลุ่มไลน์ 6 กลุ่ม หรือ แชร์ให้เพื่อน 6 คน (ห้ามซ้ำ) ✨',
      bannerImageUrl: 'https://img2.pic.in.th/pic/3a26970a78aa6f519b915ebc2b96555c.md.jpg',
      backgroundColor: '#0a0a0a',
      modalBackgroundColor: '#1a1a2e',
      buttonBackgroundColor: 'linear-gradient(45deg, #FF6B6B, #FF8E8E, #FF6B6B)',
      buttonTextColor: '#ffffff',
      customCSS: ''
    },
    flexMessages: []
  };
  fs.writeFileSync(LIFF_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

// โหลด LIFF Config
let liffConfig = JSON.parse(fs.readFileSync(LIFF_CONFIG_PATH, 'utf8'));

// Migration: เพิ่ม bannerImageUrl ถ้ายังไม่มี
if (!liffConfig.liffSettings.bannerImageUrl) {
  liffConfig.liffSettings.bannerImageUrl = 'https://img2.pic.in.th/pic/3a26970a78aa6f519b915ebc2b96555c.md.jpg';
  fs.writeFileSync(LIFF_CONFIG_PATH, JSON.stringify(liffConfig, null, 2), 'utf8');
  console.log('✅ Added bannerImageUrl to LIFF config');
}

// ฟังก์ชันบันทึก LIFF Config
function saveLiffConfig() {
  fs.writeFileSync(LIFF_CONFIG_PATH, JSON.stringify(liffConfig, null, 2), 'utf8');
}

// ฟังก์ชันสร้าง LINE LIFF URL
function generateLineLiffUrl(liffId) {
  if (!liffId || liffId.trim() === '') {
    return null;
  }
  return `https://liff.line.me/${liffId}`;
}

// ฟังก์ชันสร้าง Flex Message Array สำหรับ LIFF
function generateFlexMessagesArray() {
  try {
    const enabledMessages = liffConfig.flexMessages
      .filter(msg => msg.enabled)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (enabledMessages.length === 0) {
      console.log('⚠️ No enabled flex messages found');
      return [];
    }

    console.log(`📦 Generating ${enabledMessages.length} flex message(s)`);

    const flexArray = enabledMessages.map((msg, index) => {
      console.log(`  - Flex #${index + 1}: ${msg.title}`);
      
      // สร้าง Features List
      const featuresList = (msg.features || []).map(feature => ({
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: feature.icon || '✨',
            size: 'sm',
            color: feature.color || '#4ECDC4',
            flex: 0
          },
          {
            type: 'text',
            text: feature.text || '',
            size: 'sm',
            color: '#ffffff',
            flex: 1,
            margin: 'sm'
          }
        ]
      }));

      // สร้าง Buttons
      const enabledButtons = (msg.buttons || [])
        .filter(btn => btn.enabled)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const buttonContents = enabledButtons.map(btn => ({
        type: 'button',
        action: {
          type: 'uri',
          label: btn.label || 'คลิกที่นี่',
          uri: btn.uri || 'https://line.me'
        },
        style: 'primary',
        color: btn.color || '#FF6B6B',
        height: 'md'
      }));

      // สร้าง Rating (ถ้าเปิดใช้งาน)
      let ratingContent = null;
      if (msg.rating && msg.rating.enabled) {
        const stars = [];
        for (let i = 0; i < (msg.rating.stars || 5); i++) {
          stars.push({
            type: 'text',
            text: '⭐',
            size: 'sm',
            color: msg.rating.color || '#FFD700',
            flex: 0
          });
        }

        ratingContent = {
          type: 'box',
          layout: 'horizontal',
          contents: [
            ...stars,
            {
              type: 'text',
              text: msg.rating.text || '5/5',
              size: 'sm',
              color: '#ffffff',
              flex: 1,
              align: 'end'
            }
          ],
          margin: 'sm'
        };
      }

      // สร้าง Bubble
      const bubble = {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'image',
              url: msg.imageUrl || 'https://via.placeholder.com/1040x1040',
              size: 'full',
              aspectMode: 'cover',
              aspectRatio: '1:1',
              gravity: 'center',
              action: {
                type: 'uri',
                uri: msg.buttons?.[0]?.uri || 'https://line.me'
              }
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: msg.title || 'Title',
                  weight: 'bold',
                  size: 'xl',
                  color: msg.titleColor || '#FFD700',
                  align: 'center'
                },
                {
                  type: 'text',
                  text: msg.subtitle || 'Subtitle',
                  weight: 'bold',
                  size: 'lg',
                  color: msg.subtitleColor || '#FF6B6B',
                  align: 'center',
                  margin: 'sm'
                },
                {
                  type: 'text',
                  text: msg.description || 'Description',
                  size: 'sm',
                  color: msg.descriptionColor || '#4ECDC4',
                  align: 'center',
                  margin: 'xs'
                }
              ],
              backgroundColor: msg.headerBackgroundColor || '#1A1A2E',
              paddingAll: 'md',
              spacing: 'sm'
            }
          ],
          paddingAll: '0px',
          spacing: 'none'
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            ...(ratingContent ? [ratingContent] : []),
            ...(featuresList.length > 0 ? [
              {
                type: 'box',
                layout: 'vertical',
                contents: featuresList,
                spacing: 'sm',
                margin: ratingContent ? 'md' : 'none'
              }
            ] : []),
            ...(buttonContents.length > 0 ? [
              {
                type: 'box',
                layout: 'vertical',
                contents: buttonContents,
                spacing: 'sm',
                margin: 'lg'
              }
            ] : [])
          ],
          backgroundColor: msg.footerBackgroundColor || '#16213E',
          paddingAll: 'lg',
          spacing: 'sm'
        }
      };

      return bubble;
    });

    console.log('✅ Flex messages generated successfully');
    return flexArray;
  } catch (error) {
    console.error('❌ Error generating flex messages array:', error);
    return [];
  }
}

// Setup LIFF Routes
function setupLiffRoutes(requireLogin) {
  
  // หน้าจัดการ LIFF
  router.get('/liff', requireLogin, (req, res) => {
    const sortedMessages = [...liffConfig.flexMessages].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // สร้าง LIFF URL แบบเต็ม (LINE LIFF URL)
    const lineLiffUrl = generateLineLiffUrl(liffConfig.liffSettings.liffId);
    
    // สร้าง LIFF URL สำหรับ endpoint (สำหรับทดสอบ)
    const domain = process.env.DOMAIN;
    let endpointLiffUrl = '';
    
    if (domain) {
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      endpointLiffUrl = `${protocol}://${domain}/liff/share`;
    } else {
      const protocol = req.protocol;
      const host = req.get('host');
      endpointLiffUrl = `${protocol}://${host}/liff/share`;
    }

    console.log('📄 LIFF Management Page accessed by:', req.session.username);
    console.log('🔗 LINE LIFF URL:', lineLiffUrl || 'Not configured');
    console.log('🔗 Endpoint LIFF URL:', endpointLiffUrl);

    res.render('liff', {
      settings: liffConfig.liffSettings,
      flexMessages: sortedMessages,
      totalMessages: liffConfig.flexMessages.length,
      enabledMessages: liffConfig.flexMessages.filter(m => m.enabled).length,
      lineLiffUrl: lineLiffUrl, // URL สำหรับแชร์
      endpointLiffUrl: endpointLiffUrl, // URL สำหรับทดสอบ
      username: req.session.username
    });
  });

  // หน้า LIFF Share (สำหรับ endpoint)
  router.get('/liff/share', (req, res) => {
    try {
      console.log('📤 LIFF Share page accessed');
      console.log('⚙️ LIFF Settings:', {
        enabled: liffConfig.liffSettings.enabled,
        liffId: liffConfig.liffSettings.liffId ? 'Set ✅' : 'Not Set ❌',
        bannerImageUrl: liffConfig.liffSettings.bannerImageUrl ? 'Set ✅' : 'Not Set ❌',
        totalFlexMessages: liffConfig.flexMessages.length,
        enabledFlexMessages: liffConfig.flexMessages.filter(m => m.enabled).length
      });

      // ตรวจสอบว่า LIFF ถูกเปิดใช้งานหรือไม่
      if (!liffConfig.liffSettings.enabled) {
        console.warn('⚠️ LIFF is disabled');
        return res.status(503).render('error', {
          title: 'LIFF ปิดใช้งาน',
          message: 'ฟีเจอร์ LIFF Share ยังไม่ได้เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
          icon: '⚠️',
          errorCode: 'LIFF_DISABLED'
        });
      }

      // ตรวจสอบว่ามี LIFF ID หรือไม่
      if (!liffConfig.liffSettings.liffId) {
        console.warn('⚠️ LIFF ID not configured');
        return res.status(503).render('error', {
          title: 'LIFF ไม่พร้อมใช้งาน',
          message: 'ยังไม่ได้ตั้งค่า LIFF ID กรุณาติดต่อผู้ดูแลระบบ',
          icon: '⚙️',
          errorCode: 'LIFF_NOT_CONFIGURED'
        });
      }

      const flexArray = generateFlexMessagesArray();
      
      console.log(`📊 Generated ${flexArray.length} flex message(s) for LIFF share`);

      // ตรวจสอบว่ามี Flex Messages หรือไม่
      if (flexArray.length === 0) {
        console.warn('⚠️ No enabled flex messages');
        return res.status(404).render('error', {
          title: 'ไม่พบ Flex Message',
          message: 'ยังไม่มี Flex Message ที่เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
          icon: '📭',
          errorCode: 'NO_FLEX_MESSAGES'
        });
      }

      // Render LIFF Share page
      res.render('liff-share', {
        settings: liffConfig.liffSettings,
        flexMessagesJson: JSON.stringify(flexArray),
        flexCount: flexArray.length
      });

      console.log('✅ LIFF Share page rendered successfully');
    } catch (error) {
      console.error('❌ Error rendering LIFF Share page:', error);
      res.status(500).render('error', {
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถโหลดหน้า LIFF Share ได้: ' + error.message,
        icon: '❌',
        errorCode: 'INTERNAL_ERROR'
      });
    }
  });

  // อัพเดทการตั้งค่า LIFF
  router.post('/liff/settings', requireLogin, (req, res) => {
    try {
      const { 
        enabled, liffId, pageTitle, shareText, bannerImageUrl,
        backgroundColor, modalBackgroundColor, 
        buttonBackgroundColor, buttonTextColor, customCSS 
      } = req.body;
      
      console.log('⚙️ Updating LIFF settings by:', req.session.username);
      
      liffConfig.liffSettings.enabled = enabled === 'true' || enabled === true;
      liffConfig.liffSettings.liffId = (liffId || '').trim();
      liffConfig.liffSettings.pageTitle = (pageTitle || '').trim();
      liffConfig.liffSettings.shareText = (shareText || '').trim();
      liffConfig.liffSettings.bannerImageUrl = (bannerImageUrl || '').trim();
      liffConfig.liffSettings.backgroundColor = (backgroundColor || '#0a0a0a').trim();
      liffConfig.liffSettings.modalBackgroundColor = (modalBackgroundColor || '#1a1a2e').trim();
      liffConfig.liffSettings.buttonBackgroundColor = (buttonBackgroundColor || 'linear-gradient(45deg, #FF6B6B, #FF8E8E, #FF6B6B)').trim();
      liffConfig.liffSettings.buttonTextColor = (buttonTextColor || '#ffffff').trim();
      liffConfig.liffSettings.customCSS = customCSS || '';
      
      saveLiffConfig();
      
      console.log('✅ LIFF settings updated successfully');
      res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
      console.error('❌ Error updating LIFF settings:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เพิ่ม Flex Message
  router.post('/liff/add-flex', requireLogin, (req, res) => {
    try {
      const flexData = req.body;
      
      console.log('➕ Adding new flex message by:', req.session.username);
      
      const maxOrder = liffConfig.flexMessages.length > 0 
        ? Math.max(...liffConfig.flexMessages.map(m => m.order || 0))
        : -1;

      const newFlex = {
        id: `flex-${Date.now()}`,
        enabled: true,
        order: maxOrder + 1,
        imageUrl: flexData.imageUrl || '',
        title: flexData.title || 'Title',
        subtitle: flexData.subtitle || 'Subtitle',
        description: flexData.description || 'Description',
        headerBackgroundColor: flexData.headerBackgroundColor || '#1A1A2E',
        bodyBackgroundColor: flexData.bodyBackgroundColor || '#1A1A2E',
        footerBackgroundColor: flexData.footerBackgroundColor || '#16213E',
        titleColor: flexData.titleColor || '#FFD700',
        subtitleColor: flexData.subtitleColor || '#FF6B6B',
        descriptionColor: flexData.descriptionColor || '#4ECDC4',
        buttons: flexData.buttons || [],
        features: flexData.features || [],
        rating: flexData.rating || { enabled: true, stars: 5, text: '5/5', color: '#FFD700' }
      };

      liffConfig.flexMessages.push(newFlex);
      saveLiffConfig();
      
      console.log('✅ Flex message added:', newFlex.title);
      res.json({ success: true, message: 'เพิ่ม Flex Message สำเร็จ', flex: newFlex });
    } catch (error) {
      console.error('❌ Error adding flex message:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // อัพเดท Flex Message
  router.post('/liff/update-flex', requireLogin, (req, res) => {
    try {
      const flexData = req.body;
      const index = liffConfig.flexMessages.findIndex(m => m.id === flexData.id);
      
      if (index === -1) {
        console.warn('⚠️ Flex message not found:', flexData.id);
        return res.status(404).json({ success: false, message: 'ไม่พบ Flex Message' });
      }

      console.log('✏️ Updating flex message:', flexData.title, 'by:', req.session.username);

      liffConfig.flexMessages[index] = {
        ...liffConfig.flexMessages[index],
        ...flexData
      };

      saveLiffConfig();
      
      console.log('✅ Flex message updated successfully');
      res.json({ success: true, message: 'อัพเดท Flex Message สำเร็จ' });
    } catch (error) {
      console.error('❌ Error updating flex message:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ลบ Flex Message
  router.post('/liff/delete-flex', requireLogin, (req, res) => {
    try {
      const { id } = req.body;
      
      const flexToDelete = liffConfig.flexMessages.find(m => m.id === id);
      if (!flexToDelete) {
        console.warn('⚠️ Flex message not found for deletion:', id);
        return res.status(404).json({ success: false, message: 'ไม่พบ Flex Message' });
      }

      console.log('🗑️ Deleting flex message:', flexToDelete.title, 'by:', req.session.username);
      
      liffConfig.flexMessages = liffConfig.flexMessages.filter(m => m.id !== id);
      saveLiffConfig();
      
      console.log('✅ Flex message deleted successfully');
      res.json({ success: true, message: 'ลบ Flex Message สำเร็จ' });
    } catch (error) {
      console.error('❌ Error deleting flex message:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // เปลี่ยนลำดับ Flex Messages
  router.post('/liff/reorder-flex', requireLogin, (req, res) => {
    try {
      const { flexIds } = req.body;
      
      if (!Array.isArray(flexIds)) {
        console.warn('⚠️ Invalid flex IDs format');
        return res.status(400).json({ success: false, message: 'Invalid flex IDs format' });
      }

      console.log('🔄 Reordering flex messages by:', req.session.username);

      flexIds.forEach((id, index) => {
        const flex = liffConfig.flexMessages.find(m => m.id === id);
        if (flex) {
          flex.order = index;
        }
      });

      saveLiffConfig();
      
      console.log('✅ Flex messages reordered successfully');
      res.json({ success: true, message: 'จัดเรียงลำดับสำเร็จ' });
    } catch (error) {
      console.error('❌ Error reordering flex messages:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Toggle Flex Message
  router.post('/liff/toggle-flex', requireLogin, (req, res) => {
    try {
      const { id, enabled } = req.body;
      
      const flex = liffConfig.flexMessages.find(m => m.id === id);
      if (!flex) {
        console.warn('⚠️ Flex message not found for toggle:', id);
        return res.status(404).json({ success: false, message: 'ไม่พบ Flex Message' });
      }

      const newStatus = enabled === 'true' || enabled === true;
      console.log(`🔄 Toggling flex message "${flex.title}" to ${newStatus ? 'enabled' : 'disabled'} by:`, req.session.username);

      flex.enabled = newStatus;
      saveLiffConfig();
      
      console.log('✅ Flex message toggled successfully');
      res.json({ success: true, message: `${newStatus ? 'เปิด' : 'ปิด'}ใช้งาน Flex Message สำเร็จ` });
    } catch (error) {
      console.error('❌ Error toggling flex message:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Preview Flex Messages
  router.get('/liff/preview', requireLogin, (req, res) => {
    try {
      console.log('🔍 Preview request received from:', req.session.username);
      
      const flexArray = generateFlexMessagesArray();
      
      console.log(`📊 Preview: Generated ${flexArray.length} flex message(s)`);
      
      if (flexArray.length === 0) {
        return res.json({ 
          success: false, 
          message: 'ไม่มี Flex Message ที่เปิดใช้งาน กรุณาเพิ่มและเปิดใช้งาน Flex Message อย่างน้อย 1 รายการ',
          flex: null,
          count: 0
        });
      }

      // ส่ง Flex Carousel พร้อมข้อมูลเพิ่มเติม
      res.json({ 
        success: true,
        count: flexArray.length,
        flex: {
          type: 'carousel',
          contents: flexArray
        },
        timestamp: new Date().toISOString()
      });

      console.log('✅ Preview generated successfully');
    } catch (error) {
      console.error('❌ Error creating preview:', error);
      res.status(500).json({ 
        success: false, 
        message: 'เกิดข้อผิดพลาดในการสร้างตัวอย่าง: ' + error.message,
        error: error.toString(),
        count: 0
      });
    }
  });

  return router;
}

module.exports = { 
  setupLiffRoutes,
  liffConfig
};