// backend/middleware/auth.js - Authentication & Authorization Middleware
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════

const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No access token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Your session has expired. Please refresh your token.'
        });
      }
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid'
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
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
        error: 'User not found',
        message: 'User associated with this token does not exist'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled'
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        error: 'Email not verified',
        message: 'Please verify your email address'
      });
    }

    // Attach user to request
    req.user = user;
    next();

  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
};

// ═══════════════════════════════════════════════════════
// AUTHORIZATION MIDDLEWARE
// ═══════════════════════════════════════════════════════

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed', {
        userId: req.user.id,
        requiredRoles: roles,
        userRole: req.user.role
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

// ═══════════════════════════════════════════════════════
// OPTIONAL AUTHENTICATION (for public/private content)
// ═══════════════════════════════════════════════════════

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue as guest
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          accountType: true,
          role: true,
          isVerified: true,
          isActive: true
        }
      });

      if (user && user.isActive && user.isVerified) {
        req.user = user;
      } else {
        req.user = null;
      }
    } catch (err) {
      // Invalid token, continue as guest
      req.user = null;
    }

    next();

  } catch (error) {
    logger.error('Optional auth error', { error: error.message });
    req.user = null;
    next();
  }
};

// ═══════════════════════════════════════════════════════
// OWNERSHIP VERIFICATION
// ═══════════════════════════════════════════════════════

const verifyOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user.id;

      let resource;
      
      switch (resourceType) {
        case 'case':
          resource = await prisma.case.findUnique({
            where: { id: resourceId },
            select: { userId: true }
          });
          break;
          
        case 'document':
          resource = await prisma.document.findUnique({
            where: { id: resourceId },
            select: { case: { select: { userId: true } } }
          });
          break;
          
        default:
          return res.status(400).json({
            error: 'Invalid resource type',
            message: 'Resource type not supported for ownership verification'
          });
      }

      if (!resource) {
        return res.status(404).json({
          error: 'Resource not found',
          message: `${resourceType} not found`
        });
      }

      const ownerId = resourceType === 'case' 
        ? resource.userId 
        : resource.case.userId;

      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }

      // Check ownership
      if (ownerId !== userId) {
        logger.warn('Ownership verification failed', {
          userId,
          resourceType,
          resourceId,
          ownerId
        });

        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource'
        });
      }

      next();

    } catch (error) {
      logger.error('Ownership verification error', { error: error.message });
      res.status(500).json({
        error: 'Verification failed',
        message: 'An error occurred while verifying resource ownership'
      });
    }
  };
};

// ═══════════════════════════════════════════════════════
// API KEY VERIFICATION (for MCP/external integrations)
// ═══════════════════════════════════════════════════════

const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'No API key',
        message: 'API key is required'
      });
    }

    // Hash the API key to compare with stored hash
    const crypto = require('crypto');
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    const key = await prisma.apiKey.findUnique({
      where: { 
        keyHash: apiKeyHash,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true
          }
        }
      }
    });

    if (!key) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'API key is invalid or has been revoked'
      });
    }

    if (!key.user.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        message: 'The account associated with this API key has been disabled'
      });
    }

    // Check rate limits
    if (key.rateLimit) {
      const now = Date.now();
      const windowStart = now - key.rateLimitWindow * 1000;
      
      const requestCount = await prisma.apiRequest.count({
        where: {
          apiKeyId: key.id,
          createdAt: {
            gte: new Date(windowStart)
          }
        }
      });

      if (requestCount >= key.rateLimit) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'API rate limit exceeded. Please try again later.'
        });
      }
    }

    // Log API request
    await prisma.apiRequest.create({
      data: {
        apiKeyId: key.id,
        endpoint: req.path,
        method: req.method,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    });

    req.user = key.user;
    req.apiKey = key;
    next();

  } catch (error) {
    logger.error('API key verification error', { error: error.message });
    res.status(500).json({
      error: 'Verification failed',
      message: 'An error occurred while verifying API key'
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  verifyOwnership,
  verifyApiKey
};
