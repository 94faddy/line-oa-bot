const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Middleware ตรวจสอบการ Login
function requireLogin(req, res, next) {
  if (req.session && req.session.isLoggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Login Page
router.get('/login', (req, res) => {
  if (req.session && req.session.isLoggedIn) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// Login Handler
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  const adminUsername = process.env.ADMIN_USERNAME || 'jonz';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  
  if (!adminPasswordHash) {
    return res.render('login', { 
      error: 'ระบบยังไม่ได้ตั้งค่ารหัสผ่าน กรุณาตั้งค่า ADMIN_PASSWORD_HASH ใน .env' 
    });
  }
  
  if (username === adminUsername && bcrypt.compareSync(password, adminPasswordHash)) {
    req.session.isLoggedIn = true;
    req.session.username = username;
    res.redirect('/');
  } else {
    res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = { router, requireLogin };