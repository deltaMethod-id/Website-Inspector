require("dotenv").config();

const express = require("express");

const app = express();

// Middleware
app.use(express.json());

// API Verifikasi Password
app.post("/api/verify-password", (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password wajib diisi."
    });
  }

  if (password === process.env.APP_PASSWORD) {
    return res.json({
      success: true,
      message: "Akses diizinkan."
    });
  }

  return res.status(401).json({
    success: false,
    message: "Akses ditolak."
  });
});

// Export untuk Vercel
module.exports = app;
