// backend/routes/auth.js - Secure Authentication Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { sendEmail } = require('../utils/email');
const { logger } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════
// VALIDATION RULES
// ═══════════════════════════════════════════════════════

const registerValidation = [
  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail()
    .custom(async (email) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) throw new Error('Email already registered');
      return true;
    }),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters'),
  body('accountType')
    .isIn(['individual', 'business', 'law_firm', 'mediator'])
    .withMessage('Invalid account type')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// POST /api/auth/register
router.post('/register', registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { email, password, firstName, lastName, accountType } = req.body;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        accountType,
        verificationToken,
        verificationExpires,
        role: 'user'
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        accountType: true,
        createdAt: true
      }
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: email,
      subject: 'Verify Your ODRkart Account',
      template: 'email-verification',
      data: { firstName, verificationUrl }
    });

    // Log registration
    logger.info('User registered', { userId: user.id, email });

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      user
    });

  } catch (error) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({ 
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// POST /api/auth/login
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        accountType: true,
        role: true,
        isVerified: true,
        isActive: true
      }
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ 
        error: 'Account disabled',
        message: 'Your account has been disabled. Please contact support.'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      // Log failed attempt
      await prisma.loginAttempt.create({
        data: {
          userId: user.id,
          success: false,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({ 
        error: 'Email not verified',
        message: 'Please verify your email address to login'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    // Log successful login
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Set HTTP-only cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info('User logged in', { userId: user.id });

    // Remove sensitive data
    delete user.passwordHash;

    res.json({
      message: 'Login successful',
      accessToken,
      user
    });

  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ 
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'No refresh token',
        message: 'Please login again'
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ 
        error: 'Invalid refresh token',
        message: 'Please login again'
      });
    }

    // Check if token exists in database
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        userId: decoded.userId,
        token: refreshToken,
        expiresAt: { gte: new Date() },
        revoked: false
      }
    });

    if (!storedToken) {
      return res.status(401).json({ 
        error: 'Invalid refresh token',
        message: 'Please login again'
      });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: decoded.userId },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken });

  } catch (error) {
    logger.error('Token refresh error', { error: error.message });
    res.status(500).json({ 
      error: 'Token refresh failed',
      message: 'An error occurred while refreshing token'
    });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      // Revoke refresh token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revoked: true }
      });
    }

    // Clear cookie
    res.clearCookie('refreshToken');

    res.json({ message: 'Logout successful' });

  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ 
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationExpires: { gte: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired token',
        message: 'Email verification link is invalid or has expired'
      });
    }

    // Mark as verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpires: null
      }
    });

    logger.info('Email verified', { userId: user.id });

    res.json({ message: 'Email verified successfully. You can now login.' });

  } catch (error) {
    logger.error('Email verification error', { error: error.message });
    res.status(500).json({ 
      error: 'Verification failed',
      message: 'An error occurred during email verification'
    });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Don't reveal if user exists
    if (!user) {
      return res.json({ 
        message: 'If an account exists with this email, a password reset link will be sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    });

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'Reset Your ODRkart Password',
      template: 'password-reset',
      data: { firstName: user.firstName, resetUrl }
    });

    logger.info('Password reset requested', { userId: user.id });

    res.json({ 
      message: 'If an account exists with this email, a password reset link will be sent.'
    });

  } catch (error) {
    logger.error('Forgot password error', { error: error.message });
    res.status(500).json({ 
      error: 'Request failed',
      message: 'An error occurred while processing your request'
    });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { token, password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gte: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired token',
        message: 'Password reset link is invalid or has expired'
      });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true }
    });

    logger.info('Password reset successful', { userId: user.id });

    res.json({ message: 'Password reset successful. Please login with your new password.' });

  } catch (error) {
    logger.error('Password reset error', { error: error.message });
    res.status(500).json({ 
      error: 'Reset failed',
      message: 'An error occurred while resetting password'
    });
  }
});

module.exports = router;
