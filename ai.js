// backend/routes/ai.js - Secure AI Integration with Claude API
const express = require('express');
const { body, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const DOMPurify = require('isomorphic-dompurify');

const router = express.Router();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL);

// Initialize Anthropic client (server-side only!)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ═══════════════════════════════════════════════════════
// VALIDATION RULES
// ═══════════════════════════════════════════════════════

const analysisSummaryValidation = [
  body('title').trim().isLength({ min: 5, max: 200 }),
  body('category').isIn([
    'contract', 'payment', 'consumer', 'employment', 
    'real_estate', 'ip', 'ecommerce', 'cross_border'
  ]),
  body('amount').optional().isNumeric(),
  body('description').trim().isLength({ min: 10, max: 5000 })
];

const blogGenerationValidation = [
  body('topic').isIn(['arbitration', 'technology', 'consumer', 'international', 'all']),
  body('count').optional().isInt({ min: 1, max: 6 })
];

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

const sanitizeInput = (text) => {
  return DOMPurify.sanitize(text, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [] 
  });
};

const getCacheKey = (type, params) => {
  const hash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');
  return `ai:${type}:${hash}`;
};

const callClaudeAPI = async (prompt, userId, context = {}) => {
  try {
    // Log API call
    const apiCall = await prisma.aiApiCall.create({
      data: {
        userId,
        prompt: prompt.substring(0, 500), // Store truncated prompt
        context: JSON.stringify(context),
        model: 'claude-sonnet-4-20250514'
      }
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract text from response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Update API call with response
    await prisma.aiApiCall.update({
      where: { id: apiCall.id },
      data: {
        response: text.substring(0, 5000),
        tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0,
        success: true
      }
    });

    logger.info('Claude API call successful', {
      userId,
      model: 'claude-sonnet-4-20250514',
      tokens: response.usage?.input_tokens + response.usage?.output_tokens
    });

    return { text, usage: response.usage };

  } catch (error) {
    logger.error('Claude API error', {
      userId,
      error: error.message
    });

    // Update API call with error
    await prisma.aiApiCall.update({
      where: { id: apiCall.id },
      data: {
        error: error.message,
        success: false
      }
    });

    throw error;
  }
};

// ═══════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════

// POST /api/ai/analyze-case
// Generate dual reports (company + client) for dispute analysis
router.post('/analyze-case', 
  authenticate, 
  analysisSummaryValidation, 
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
      const caseData = {
        title: sanitizeInput(req.body.title),
        category: req.body.category,
        amount: req.body.amount || 'Not specified',
        resolution: req.body.resolution || 'Mediation',
        description: sanitizeInput(req.body.description),
        claimant: sanitizeInput(req.body.claimant || 'Claimant'),
        respondent: sanitizeInput(req.body.respondent || 'Respondent'),
        documents: req.body.documents || 'None',
        date: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      };

      // Check cache
      const cacheKey = getCacheKey('case-analysis', caseData);
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        logger.info('Returning cached analysis', { userId });
        return res.json(JSON.parse(cached));
      }

      // Generate company report prompt
      const companyPrompt = `You are a senior legal analyst at ODRkart. Case: Title="${caseData.title}", Category="${caseData.category}", Amount="₹${caseData.amount}", Mode="${caseData.resolution}", Claimant="${caseData.claimant}", Respondent="${caseData.respondent}", Description="${caseData.description}", Docs="${caseData.documents}", Date="${caseData.date}".

Write a CONFIDENTIAL INTERNAL REPORT with these exact headers (plain text, no asterisks):
CASE OVERVIEW
LEGAL MERIT ASSESSMENT
RISK ANALYSIS
PANELIST RECOMMENDATION
RESOLUTION TIMELINE
INTERNAL NOTES

Each section: 3-5 sentences. Professional, analytical tone.`;

      // Generate client report prompt
      const clientPrompt = `You are a friendly legal advisor at ODRkart. Case for ${caseData.claimant}: Title="${caseData.title}", Category="${caseData.category}", Amount="₹${caseData.amount}", Mode="${caseData.resolution}", Other party="${caseData.respondent}", Description="${caseData.description}", Docs="${caseData.documents}", Date="${caseData.date}".

Write a FRIENDLY CLIENT SUMMARY with these exact headers (plain text, no asterisks):
CASE SUMMARY
YOUR LEGAL POSITION
WHAT HAPPENS NEXT
DOCUMENTS CHECKLIST REVIEW
TIPS FOR A STRONG CASE
ESTIMATED OUTCOME

Each section: 3-5 sentences. Warm, supportive, empowering tone.`;

      // Call Claude API for both reports in parallel
      const [companyResult, clientResult] = await Promise.allSettled([
        callClaudeAPI(companyPrompt, userId, { type: 'company_report', caseData }),
        callClaudeAPI(clientPrompt, userId, { type: 'client_report', caseData })
      ]);

      const response = {
        companyReport: companyResult.status === 'fulfilled' 
          ? { text: companyResult.value.text, error: null }
          : { text: null, error: companyResult.reason.message },
        clientReport: clientResult.status === 'fulfilled'
          ? { text: clientResult.value.text, error: null }
          : { text: null, error: clientResult.reason.message },
        caseData,
        generatedAt: new Date().toISOString()
      };

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(response));

      res.json(response);

    } catch (error) {
      logger.error('Case analysis error', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Analysis failed',
        message: 'An error occurred while analyzing the case'
      });
    }
  }
);

// POST /api/ai/generate-blog-posts
// Generate AI blog posts for ODRkart AI Lab
router.post('/generate-blog-posts',
  authenticate,
  blogGenerationValidation,
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
      const { topic, count = 4 } = req.body;

      // Topic pools
      const topicPools = {
        arbitration: [
          'The Future of Arbitrator Selection in AI-Powered ODR Systems',
          'How Real-Time Transcription is Changing Online Arbitral Hearings',
          'Doctrine of Kompetenz-Kompetenz in the Age of Digital Arbitration'
        ],
        technology: [
          'Large Language Models as Legal Research Tools: Opportunities and Risks',
          'Smart Contracts and Self-Executing Dispute Clauses: A 2026 Analysis',
          'Deepfake Evidence in Arbitration: Detection, Admissibility and Safeguards'
        ],
        consumer: [
          'The Psychology of Online Dispute Resolution: Why Parties Settle Faster',
          'Consumer Protection Act 2019: Gaps That ODR Platforms Fill',
          'E-Commerce Return Fraud and the ODR Response Framework'
        ],
        international: [
          'UNCITRAL Model Law 2.0: What Changes Mean for Indian Practitioners',
          'Belt and Road Disputes: How Indian Firms Can Leverage ODR',
          'Cross-Border Insolvency and ADR: The New Frontier'
        ],
        all: [
          'Generative AI in ODR: From Document Drafting to Award Generation',
          'The Ethical Arbitrator in the Age of Algorithmic Justice',
          'Carbon Credits and Dispute Resolution: Emerging Practice Areas',
          'How Tokenized Assets Are Creating New Classes of Commercial Disputes',
          'ODR Accessibility: Bridging the Digital Divide in Rural India'
        ]
      };

      const pool = topicPools[topic] || topicPools.all;
      const shuffled = pool.sort(() => Math.random() - 0.5);
      const selectedTopics = shuffled.slice(0, count);

      // Check cache
      const cacheKey = getCacheKey('blog-posts', { topic, topics: selectedTopics });
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        logger.info('Returning cached blog posts', { userId });
        return res.json(JSON.parse(cached));
      }

      const prompt = `You are ODRkart's expert AI Legal Journalist. Write exactly ${selectedTopics.length} short blog post entries about these topics for ODRkart's AI Lab Blog (India's ODR platform):

${selectedTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Respond ONLY with valid JSON (no markdown, no backticks):
{"posts":[{"title":"...","excerpt":"2-3 sentence compelling excerpt about the topic","category":"one of: Arbitration, Legal Tech, Consumer, International, ODR Insights","readTime":"X min read","author":"ODRkart AI Lab","emoji":"single relevant emoji"}]}`;

      const result = await callClaudeAPI(prompt, userId, { type: 'blog_generation', topic });

      // Parse JSON response
      const clean = result.text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);

      if (!parsed.posts || !Array.isArray(parsed.posts)) {
        throw new Error('Invalid response format');
      }

      const response = {
        posts: parsed.posts,
        topic,
        generatedAt: new Date().toISOString()
      };

      // Cache for 2 hours
      await redis.setex(cacheKey, 7200, JSON.stringify(response));

      res.json(response);

    } catch (error) {
      logger.error('Blog generation error', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Generation failed',
        message: 'An error occurred while generating blog posts'
      });
    }
  }
);

// POST /api/ai/platform-summary
// Generate AI summary of ODRkart platform (for AI panel)
router.post('/platform-summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check cache
    const cacheKey = 'ai:platform-summary:latest';
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      logger.info('Returning cached platform summary', { userId });
      return res.json(JSON.parse(cached));
    }

    const prompt = `ODRkart (est.2018): India's ODR platform. Stats: 12K+ cases, ₹240Cr, 500+ panelists, 30d avg, 80% cheaper, blockchain, ISO 27001, 98% satisfaction. New: AI Lab Blog auto-generates legal articles. AI Document Analyser creates dual reports.

Write 4 labeled sections (plain text):
SECTION 1 — PLATFORM OVERVIEW
SECTION 2 — KEY STRENGTHS
SECTION 3 — WHO IT'S FOR
SECTION 4 — AI VERDICT

Each section: 2-4 sentences. Professional, compelling tone.`;

    const result = await callClaudeAPI(prompt, userId, { type: 'platform_summary' });

    const response = {
      summary: result.text,
      generatedAt: new Date().toISOString()
    };

    // Cache for 6 hours
    await redis.setex(cacheKey, 21600, JSON.stringify(response));

    res.json(response);

  } catch (error) {
    logger.error('Platform summary error', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Summary generation failed',
      message: 'An error occurred while generating platform summary'
    });
  }
});

// GET /api/ai/usage-stats
// Get AI usage statistics for current user
router.get('/usage-stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await prisma.aiApiCall.aggregate({
      where: { userId },
      _count: { id: true },
      _sum: { tokensUsed: true }
    });

    const recentCalls = await prisma.aiApiCall.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        model: true,
        tokensUsed: true,
        success: true,
        createdAt: true
      }
    });

    res.json({
      totalCalls: stats._count.id,
      totalTokens: stats._sum.tokensUsed || 0,
      recentCalls
    });

  } catch (error) {
    logger.error('Usage stats error', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve stats',
      message: 'An error occurred while fetching usage statistics'
    });
  }
});

// DELETE /api/ai/clear-cache
// Clear AI cache (admin only or own cache)
router.delete('/clear-cache', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query; // case-analysis, blog-posts, platform-summary, all

    let pattern;
    if (type === 'all' && req.user.role === 'admin') {
      pattern = 'ai:*';
    } else {
      pattern = `ai:${type || '*'}:*`;
    }

    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.info('AI cache cleared', { userId, pattern, keysDeleted: keys.length });

    res.json({
      message: 'Cache cleared successfully',
      keysDeleted: keys.length
    });

  } catch (error) {
    logger.error('Cache clear error', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Cache clear failed',
      message: 'An error occurred while clearing cache'
    });
  }
});

module.exports = router;
