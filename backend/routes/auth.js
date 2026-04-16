const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check DB status
    if (mongoose.connection.readyState !== 1) {
      console.error("[AUTH SIGNUP] Database not connected");
      return res.status(503).json({ error: "Service temporarily unavailable: Database disconnected" });
    }

    if (!username || !email || !password) {
      console.warn(`[AUTH SIGNUP] Missing fields for ${email || 'unknown email'}`);
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ success: true, message: "User created successfully" });
  } catch (error) {
    console.error(`[AUTH SIGNUP] Critical error: ${error.message}`, error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check DB status
    if (mongoose.connection.readyState !== 1) {
      console.error("[AUTH LOGIN] Database not connected");
      return res.status(503).json({ error: "Service temporarily unavailable: Database disconnected" });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.warn(`[AUTH LOGIN] Failed login attempt: User not found (${email})`);
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn(`[AUTH LOGIN] Failed login attempt: Incorrect password for ${email}`);
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || "fallback_secret_for_dev_mode",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(`[AUTH LOGIN] Critical error for ${req.body.email || 'unknown'}: ${error.message}`, error);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
