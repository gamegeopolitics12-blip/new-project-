// backend/routes/payments.js - Secure Stripe Payment Integration
const express = require('express');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Stripe webhook signature verification
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ═══════════════════════════════════════════════════════
// VALIDATION RULES
// ═══════════════════════════════════════════════════════

const createPaymentIntentValidation = [
  body('caseId').isUUID(),
  body('amount').isInt({ min: 199900, max: 100000000 }), // ₹1,999 to ₹10,00,000 in paise
  body('currency').equals('inr')
];

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

const calculatePlatformFee = (amount, caseType) => {
  // Base fees based on case type
  const baseFees = {
    mediation: 299900, // ₹2,999
    arbitration: 599900, // ₹5,999
    consultation: 49900, // ₹499
    filing: 199900 // ₹1,999
  };

  return baseFees[caseType] || baseFees.filing;
};

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// POST /api/payments/create-intent
// Create Stripe Payment Intent
router.post('/create-intent',
  authenticate,
  createPaymentIntentValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.user.id;
      const { caseId, amount, currency } = req.body;

      // Verify case belongs to user
      const caseData = await prisma.case.findFirst({
        where: {
          id: caseId,
          userId
        }
      });

      if (!caseData) {
        return res.status(404).json({
          error: 'Case not found',
          message: 'Case not found or you do not have permission'
        });
      }

      // Check if already paid
      if (caseData.paymentStatus === 'paid') {
        return res.status(400).json({
          error: 'Already paid',
          message: 'This case has already been paid for'
        });
      }

      // Create Stripe customer if doesn't exist
      let stripeCustomerId = req.user.stripeCustomerId;
      
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          name: `${req.user.firstName} ${req.user.lastName}`,
          metadata: {
            userId: req.user.id
          }
        });

        stripeCustomerId = customer.id;

        // Save customer ID to database
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId }
        });
      }

      // Create Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount, // Amount in paise (smallest currency unit)
        currency,
        customer: stripeCustomerId,
        metadata: {
          userId,
          caseId,
          caseTitle: caseData.title
        },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never' // Ensure card-only flow
        },
        description: `ODRkart Case Filing - ${caseData.title}`
      });

      // Save payment record
      await prisma.payment.create({
        data: {
          userId,
          caseId,
          amount,
          currency,
          stripePaymentIntentId: paymentIntent.id,
          status: 'pending'
        }
      });

      logger.info('Payment intent created', {
        userId,
        caseId,
        amount,
        paymentIntentId: paymentIntent.id
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });

    } catch (error) {
      logger.error('Payment intent creation error', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Payment intent creation failed',
        message: 'An error occurred while creating payment intent'
      });
    }
  }
);

// GET /api/payments/status/:paymentIntentId
// Check payment status
router.get('/status/:paymentIntentId', authenticate, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.id;

    // Get payment from database
    const payment = await prisma.payment.findFirst({
      where: {
        stripePaymentIntentId: paymentIntentId,
        userId
      },
      include: {
        case: {
          select: {
            id: true,
            title: true,
            caseNumber: true
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        message: 'Payment record not found'
      });
    }

    // Get latest status from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Update local record if status changed
    if (payment.status !== paymentIntent.status) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: paymentIntent.status }
      });
    }

    res.json({
      status: paymentIntent.status,
      amount: payment.amount,
      currency: payment.currency,
      case: payment.case,
      createdAt: payment.createdAt
    });

  } catch (error) {
    logger.error('Payment status check error', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Status check failed',
      message: 'An error occurred while checking payment status'
    });
  }
});

// GET /api/payments/history
// Get payment history for current user
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { userId },
        include: {
          case: {
            select: {
              id: true,
              title: true,
              caseNumber: true,
              category: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.payment.count({ where: { userId } })
    ]);

    res.json({
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Payment history error', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve history',
      message: 'An error occurred while fetching payment history'
    });
  }
});

// POST /api/payments/webhook
// Stripe webhook handler (NO AUTH - uses signature verification)
router.post('/webhook',
  express.raw({ type: 'application/json' }), // Raw body for signature verification
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      logger.error('Webhook signature verification failed', {
        error: err.message
      });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentSuccess(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        case 'charge.refunded':
          await handleRefund(event.data.object);
          break;

        default:
          logger.info('Unhandled webhook event type', { type: event.type });
      }

      res.json({ received: true });

    } catch (error) {
      logger.error('Webhook handler error', {
        eventType: event.type,
        error: error.message
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// ═══════════════════════════════════════════════════════
// WEBHOOK HANDLERS
// ═══════════════════════════════════════════════════════

async function handlePaymentSuccess(paymentIntent) {
  const { id, amount, metadata } = paymentIntent;
  const { userId, caseId } = metadata;

  logger.info('Payment succeeded', {
    paymentIntentId: id,
    userId,
    caseId,
    amount
  });

  // Update payment record
  await prisma.payment.update({
    where: { stripePaymentIntentId: id },
    data: {
      status: 'succeeded',
      paidAt: new Date()
    }
  });

  // Update case status
  await prisma.case.update({
    where: { id: caseId },
    data: {
      paymentStatus: 'paid',
      status: 'active',
      paidAt: new Date()
    }
  });

  // Send confirmation email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true }
  });

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseNumber: true, title: true }
  });

  const { sendEmail } = require('../utils/email');
  await sendEmail({
    to: user.email,
    subject: 'Payment Confirmed - ODRkart Case Filed',
    template: 'payment-success',
    data: {
      firstName: user.firstName,
      caseNumber: caseData.caseNumber,
      caseTitle: caseData.title,
      amount: (amount / 100).toFixed(2)
    }
  });
}

async function handlePaymentFailed(paymentIntent) {
  const { id, last_payment_error, metadata } = paymentIntent;
  const { userId, caseId } = metadata;

  logger.warn('Payment failed', {
    paymentIntentId: id,
    userId,
    caseId,
    error: last_payment_error?.message
  });

  // Update payment record
  await prisma.payment.update({
    where: { stripePaymentIntentId: id },
    data: {
      status: 'failed',
      error: last_payment_error?.message || 'Payment failed'
    }
  });

  // Send failure notification
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true }
  });

  const { sendEmail } = require('../utils/email');
  await sendEmail({
    to: user.email,
    subject: 'Payment Failed - ODRkart',
    template: 'payment-failed',
    data: {
      firstName: user.firstName,
      error: last_payment_error?.message || 'Payment could not be processed'
    }
  });
}

async function handleRefund(charge) {
  const { payment_intent, amount_refunded } = charge;

  logger.info('Refund processed', {
    paymentIntentId: payment_intent,
    amountRefunded: amount_refunded
  });

  // Update payment record
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: payment_intent }
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'refunded',
        refundedAt: new Date(),
        refundAmount: amount_refunded
      }
    });

    // Update case status
    await prisma.case.update({
      where: { id: payment.caseId },
      data: { paymentStatus: 'refunded' }
    });
  }
}

module.exports = router;
