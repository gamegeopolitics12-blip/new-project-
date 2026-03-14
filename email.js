// backend/utils/email.js - Email Service with Nodemailer
const nodemailer = require('nodemailer');
const { logger } = require('./logger');

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Verify transporter configuration
transporter.verify((error) => {
  if (error) {
    logger.error('Email transporter configuration error', { error: error.message });
  } else {
    logger.info('Email transporter is ready');
  }
});

// Email templates
const templates = {
  'email-verification': (data) => ({
    subject: 'Verify Your ODRkart Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #de18c7;">Welcome to ODRkart!</h2>
        <p>Hi ${data.firstName},</p>
        <p>Thank you for registering with ODRkart. Please verify your email address by clicking the button below:</p>
        <a href="${data.verificationUrl}" style="display: inline-block; background: #de18c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Verify Email</a>
        <p>Or copy and paste this link: ${data.verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">ODRkart - India's Premier Online Dispute Resolution Platform</p>
      </div>
    `
  }),

  'password-reset': (data) => ({
    subject: 'Reset Your ODRkart Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #de18c7;">Password Reset Request</h2>
        <p>Hi ${data.firstName},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <a href="${data.resetUrl}" style="display: inline-block; background: #de18c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
        <p>Or copy and paste this link: ${data.resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">ODRkart - India's Premier Online Dispute Resolution Platform</p>
      </div>
    `
  }),

  'payment-success': (data) => ({
    subject: 'Payment Confirmed - ODRkart Case Filed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2ecc71;">✓ Payment Successful!</h2>
        <p>Hi ${data.firstName},</p>
        <p>Your payment of ₹${data.amount} has been confirmed.</p>
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Case Number:</strong> ${data.caseNumber}</p>
          <p><strong>Case Title:</strong> ${data.caseTitle}</p>
          <p><strong>Amount Paid:</strong> ₹${data.amount}</p>
        </div>
        <p>Your case is now active and will be reviewed by our team within 24 hours.</p>
        <p>You can track your case status by logging into your ODRkart account.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">ODRkart - India's Premier Online Dispute Resolution Platform</p>
      </div>
    `
  }),

  'payment-failed': (data) => ({
    subject: 'Payment Failed - ODRkart',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">Payment Failed</h2>
        <p>Hi ${data.firstName},</p>
        <p>Unfortunately, your payment could not be processed.</p>
        <p><strong>Error:</strong> ${data.error}</p>
        <p>Please try again or contact our support team for assistance.</p>
        <p>Common reasons for payment failure:</p>
        <ul>
          <li>Insufficient funds</li>
          <li>Card declined by bank</li>
          <li>Incorrect card details</li>
          <li>Payment limit exceeded</li>
        </ul>
        <p>If you continue to experience issues, please contact us at support@odrkart.com</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">ODRkart - India's Premier Online Dispute Resolution Platform</p>
      </div>
    `
  })
};

/**
 * Send email using template
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject (optional if using template)
 * @param {string} options.template - Template name
 * @param {Object} options.data - Template data
 * @param {string} options.html - Raw HTML (alternative to template)
 */
const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    // Get template content if template name provided
    let emailContent = { subject, html };
    if (template && templates[template]) {
      emailContent = templates[template](data);
    }

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject: subject || emailContent.subject,
      html: html || emailContent.html
    };

    const info = await transporter.sendMail(mailOptions);

    logger.info('Email sent successfully', {
      to,
      subject: mailOptions.subject,
      messageId: info.messageId
    });

    return { success: true, messageId: info.messageId };

  } catch (error) {
    logger.error('Email sending failed', {
      to,
      subject,
      error: error.message
    });

    throw error;
  }
};

module.exports = { sendEmail };
