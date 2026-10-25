const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const FAQ = require('../models/FAQ');
const auth = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');
const { extractTextFromPDF, parseStructuredFAQs } = require('../utils/pdfParser');

const router = express.Router();

// Configure multer for PDF uploads
const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});

// Get all active FAQs (widget)
router.get('/', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { 
            category, 
            search, 
            limit = 50 
        } = req.query;

        let query = { isActive: true };
        
        if (category) {
            query.category = category;
        }

        let faqs;
        
        if (search) {
            faqs = await FAQ.search(search, { 
                category, 
                limit: parseInt(limit) 
            });
        } else {
            faqs = await FAQ.find(query)
                .sort({ priority: -1, 'usage.hitCount': -1 })
                .limit(parseInt(limit))
                .select('question answer patterns category tags usage.hitCount usage.averageRating');
        }

        // Transform for frontend (legacy format)
        const transformedFaqs = faqs.map(faq => ({
            q: faq.question,
            a: faq.answer,
            patterns: faq.patterns,
            category: faq.category,
            hitCount: faq.usage?.hitCount || 0,
            rating: faq.usage?.averageRating || 0
        }));

        res.json(transformedFaqs);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Unable to load FAQ data at this time. Please try again later.'
        });
    }
}));

// Get FAQ categories (widget)
router.get('/categories', errorHandler.asyncHandler(async (req, res) => {
    try {
        const categories = await FAQ.distinct('category', { isActive: true });
        res.json({
            success: true,
            data: { categories }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve FAQ categories'
        });
    }
}));

// Search FAQs (widget)
router.get('/search', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { q, category, limit = 10 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const results = await FAQ.search(q.trim(), {
            category: category || null,
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: {
                query: q.trim(),
                results: results.map(faq => ({
                    id: faq._id,
                    question: faq.question,
                    answer: faq.answer,
                    category: faq.category,
                    confidence: faq.score || 0,
                    hitCount: faq.usage.hitCount
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to search FAQs'
        });
    }
}));

// ========== ADMIN ROUTES ==========

// Get all FAQs with admin details (MUST come before /admin/:id)
router.get('/admin/all', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const {
            category,
            search,
            isActive,
            limit = 100,
            page = 1
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = {};
        
        if (category) {
            query.category = category;
        }
        
        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        let faqs;
        let total;

        if (search) {
            faqs = await FAQ.search(search, { 
                category,
                onlyActive: isActive !== undefined ? (isActive === 'true') : false,
                limit: parseInt(limit) 
            });
            total = faqs.length;
        } else {
            faqs = await FAQ.find(query)
                .sort({ priority: -1, 'usage.hitCount': -1, updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));
            
            total = await FAQ.countDocuments(query);
        }

        res.json({
            success: true,
            data: {
                faqs,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(total / parseInt(limit)),
                    count: total,
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to retrieve FAQs' });
    }
}));

// Get single FAQ by ID (admin only) - MUST come after /admin/all
router.get('/admin/:id', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const faq = await FAQ.findById(id);
        if (!faq) {
            return res.status(404).json({ success: false, message: 'FAQ not found' });
        }
        res.json({ success: true, data: { faq } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to retrieve FAQ' });
    }
}));

// Create new FAQ (admin only)
router.post('/admin/create', auth(), [
    body('question').isLength({ min: 5, max: 500 }).withMessage('Question must be 5-500 characters'),
    body('answer').isLength({ min: 10, max: 2000 }).withMessage('Answer must be 10-2000 characters'),
    body('patterns').isArray({ min: 1 }).withMessage('At least one pattern is required'),
    body('patterns.*').isLength({ min: 2, max: 200 }).withMessage('Each pattern must be 2-200 characters'),
    body('category').optional().isLength({ max: 50 }).withMessage('Category must be less than 50 characters'),
    body('tags').optional().isArray(),
    body('priority').optional().isInt({ min: 1, max: 10 })
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { 
            question, 
            answer, 
            patterns, 
            category = 'general',
            tags = [],
            priority = 5 
        } = req.body;

        // Check for duplicate question
        const existingFAQ = await FAQ.findOne({ 
            question: new RegExp(`^${question.trim()}$`, 'i') 
        });

        if (existingFAQ) {
            return res.status(409).json({
                success: false,
                message: 'A FAQ with this question already exists'
            });
        }

        const faq = new FAQ({
            question: question.trim(),
            answer: answer.trim(),
            patterns: patterns.map(p => p.trim().toLowerCase()),
            category: category.toLowerCase().trim(),
            tags: tags.map(t => t.toLowerCase().trim()),
            priority,
            createdBy: req.user.email || 'admin',
            isActive: true
        });

        await faq.save();

        res.status(201).json({
            success: true,
            message: 'FAQ created successfully',
            data: { faq }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create FAQ'
        });
    }
}));

// Update FAQ (admin only)
router.put('/admin/:id', auth(), [
    body('question').optional().isLength({ min: 5, max: 500 }),
    body('answer').optional().isLength({ min: 10, max: 2000 }),
    body('patterns').optional().isArray({ min: 1 }),
    body('patterns.*').optional().isLength({ min: 2, max: 200 }),
    body('category').optional().isLength({ max: 50 }),
    body('tags').optional().isArray(),
    body('priority').optional().isInt({ min: 1, max: 10 }),
    body('isActive').optional().isBoolean()
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { id } = req.params;
        const updates = req.body;

        // Find FAQ
        const faq = await FAQ.findById(id);
        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        // Update fields
        Object.keys(updates).forEach(key => {
            if (key === 'patterns' && Array.isArray(updates[key])) {
                faq[key] = updates[key].map(p => p.trim().toLowerCase());
            } else if (key === 'tags' && Array.isArray(updates[key])) {
                faq[key] = updates[key].map(t => t.toLowerCase().trim());
            } else if (key === 'category') {
                faq[key] = updates[key].toLowerCase().trim();
            } else if (typeof updates[key] === 'string') {
                faq[key] = updates[key].trim();
            } else {
                faq[key] = updates[key];
            }
        });

        faq.updatedBy = req.user.email || 'admin';
        await faq.save();

        res.json({
            success: true,
            message: 'FAQ updated successfully',
            data: { faq }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update FAQ'
        });
    }
}));

// Toggle FAQ status (admin only)
router.patch('/admin/:id/toggle', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        
        const faq = await FAQ.findById(id);
        if (!faq) {
            return res.status(404).json({ success: false, message: 'FAQ not found' });
        }
        
        // Toggle the isActive status
        const newStatus = !faq.isActive;
        faq.isActive = newStatus;
        faq.updatedBy = req.user.email || 'admin';
        await faq.save();
        
        res.json({
            success: true,
            message: `FAQ ${newStatus ? 'activated' : 'deactivated'}`,
            data: { faq }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to toggle FAQ status',
            error: error.message
        });
    }
}));

// Delete FAQ (admin only) - soft delete by setting isActive to false
router.delete('/admin/:id', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;

        const hard = req.query.hard === 'true';

        if (hard) {
            const result = await FAQ.deleteOne({ _id: id });
            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, message: 'FAQ not found' });
            }
            return res.json({ success: true, message: 'FAQ permanently deleted' });
        } else {
            const faq = await FAQ.findById(id);
            if (!faq) {
                return res.status(404).json({
                    success: false,
                    message: 'FAQ not found'
                });
            }

            faq.isActive = false;
            faq.updatedBy = req.user.email || 'admin';
            await faq.save();

            res.json({
                success: true,
                message: 'FAQ deleted successfully'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete FAQ'
        });
    }
}));


// Bulk import FAQs (admin only) - Updated with better validation
router.post('/admin/bulk-import', auth(), [
    body('faqs').isArray({ min: 1 }).withMessage('FAQs array is required'),
    body('faqs.*.question').isLength({ min: 5, max: 500 }),
    body('faqs.*.answer').isLength({ min: 10, max: 2000 }),
    body('faqs.*.patterns').isArray({ min: 1 }),
    body('faqs.*.category').optional().isLength({ max: 50 }),
    body('faqs.*.priority').optional().isInt({ min: 1, max: 10 })
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { faqs, overwrite = false } = req.body;
        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            skippedItems: [] // New array to track skipped items
        };

        for (let i = 0; i < faqs.length; i++) {
            try {
                const faqData = faqs[i];
                
                // Detailed validation
                if (!faqData.question || typeof faqData.question !== 'string') {
                    throw new Error('Question is required and must be a string');
                }
                if (!faqData.answer || typeof faqData.answer !== 'string') {
                    throw new Error('Answer is required and must be a string');
                }
                if (!Array.isArray(faqData.patterns) || faqData.patterns.length === 0) {
                    throw new Error('At least one pattern is required');
                }
                
                // Normalize and validate data
                const normalizedData = {
                    question: faqData.question.trim(),
                    answer: faqData.answer.trim(),
                    patterns: faqData.patterns
                        .map(p => (typeof p === 'string' ? p.trim().toLowerCase() : ''))
                        .filter(p => p.length >= 2 && p.length <= 200),
                    category: (faqData.category || 'general').toLowerCase().trim(),
                    priority: Math.max(1, Math.min(10, parseInt(faqData.priority) || 5))
                };

                // Additional validation on normalized data
                if (normalizedData.question.length < 5 || normalizedData.question.length > 500) {
                    throw new Error('Question must be between 5 and 500 characters');
                }
                if (normalizedData.answer.length < 10 || normalizedData.answer.length > 2000) {
                    throw new Error('Answer must be between 10 and 2000 characters');
                }
                if (normalizedData.patterns.length === 0) {
                    throw new Error('At least one valid pattern (2-200 characters) is required');
                }
                
                // Check if FAQ exists - perform a case-insensitive match
                const normalizedQuestion = normalizedData.question.toLowerCase().trim();
                const existingFAQ = await FAQ.findOne({
                    $expr: {
                        $eq: [
                            { $toLower: '$question' },
                            normalizedQuestion
                        ]
                    }
                });

                if (existingFAQ) {
                    if (overwrite) {
                        // Update existing FAQ with new values
                        Object.assign(existingFAQ, {
                            answer: normalizedData.answer,
                            patterns: normalizedData.patterns,
                            category: normalizedData.category,
                            priority: normalizedData.priority,
                            updatedBy: req.user.email || 'admin',
                            updatedAt: new Date()
                        });
                        await existingFAQ.save();
                        results.updated++;
                    } else {
                        // Track skipped items with more detail
                        results.skipped++;
                        results.skippedItems.push({
                            question: normalizedData.question,
                            reason: 'Question already exists and overwrite is disabled',
                            existingId: existingFAQ._id
                        });
                    }
                } else {
                    // Create new FAQ
                    const newFAQ = new FAQ({
                        ...normalizedData,
                        createdBy: req.user.email || 'admin',
                        isActive: true
                    });
                    await newFAQ.save();
                    results.created++;
                }
            } catch (error) {
                results.errors.push({
                    index: i + 1, // Using 1-based index for user-friendly reporting
                    question: faqs[i]?.question || 'Unknown',
                    error: error.message,
                    rowData: faqs[i] // Include the problematic data for reference
                });
            }
        }

        res.json({
            success: true,
            message: 'Bulk import completed',
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import FAQs'
        });
    }
}));

// Download FAQ JSON template (admin only)
router.get('/admin/template/json', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const template = {
            faqs: [
                {
                    question: "What is QueryNest?",
                    answer: "QueryNestis a comprehensive business solution platform that helps companies streamline their operations and improve efficiency.",
                    patterns: ["what is QueryNest", "about QueryNest", "QueryNestinfo", "tell me about QueryNest"],
                    category: "general",
                    priority: 5
                },
                {
                    question: "How much does QueryNestcost?",
                    answer: "QueryNestoffers flexible pricing plans to suit different business needs. Please contact our sales team for detailed pricing information.",
                    patterns: ["QueryNestpricing", "how much does QueryNestcost", "QueryNestprice", "cost of QueryNest"],
                    category: "pricing",
                    priority: 7
                },
                {
                    question: "How do I get technical support?",
                    answer: "You can get technical support by contacting our support team through email, phone, or our support portal.",
                    patterns: ["technical support", "help desk", "support contact", "get help"],
                    category: "technical",
                    priority: 8
                }
            ]
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="faq_template.json"');
        res.json(template);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to download JSON template'
        });
    }
}));

// Download FAQ CSV template (admin only)
router.get('/admin/template/csv', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const csvContent = `question*,answer*,patterns*,category,priority
"What is QueryNest?","QueryNestis a comprehensive business solution platform that helps companies streamline their operations and improve efficiency.","what is QueryNest; about QueryNest; QueryNestinfo; tell me about QueryNest",general,5
"How much does QueryNestcost?","QueryNestoffers flexible pricing plans to suit different business needs. Please contact our sales team for detailed pricing information.","QueryNestpricing; how much does QueryNestcost; QueryNestprice; cost of QueryNest",pricing,7
"How do I get technical support?","You can get technical support by contacting our support team through email, phone, or our support portal.","technical support; help desk; support contact; get help",technical,8`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="faq_template.csv"');
        res.send(csvContent);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to download CSV template'
        });
    }
}));

// Download FAQ PDF template (admin only)
router.get('/admin/template/pdf', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="faq_template.pdf"');

        doc.pipe(res);


        // Title
        doc.fontSize(20).font('Helvetica-Bold').text('FAQ Upload Template', { align: 'center' });
        doc.fontSize(11).font('Courier').text('PDF Format Guide', { align: 'center' });
        doc.moveDown(0.5);

        // Instructions
        doc.fontSize(11).font('Courier-Bold').text('Instructions:');
        doc.fontSize(10).font('Courier');
        doc.list([
            'Each FAQ starts with "Q:" followed by the question',
            'Answer starts with "A:" on the next line',
            'Patterns (optional) can be provided after the answer',
            'If patterns are not provided, they will be auto-generated from the question',
            'Category and Priority are optional (defaults: general, 5)',
            'Separate multiple patterns with commas',
            'Separate multiple FAQs with a blank line'
        ]);
        doc.moveDown(0.5);

        // Sample FAQ 1
        doc.fontSize(12).font('Courier-Bold').text('Example 1:', { underline: true });
        doc.fontSize(10).font('Courier');
        doc.text('Q: How do I create my digital card?', { lineBreak: true });
        doc.text('A: To create your digital card, log in to your account and navigate to the card creation wizard. Follow the step-by-step instructions to add your information and design your card.', { lineBreak: true });
        doc.text('Patterns: create digital card, how to make card, card creation, digital card setup', { lineBreak: true });
        doc.text('Category: getting-started', { lineBreak: true });
        doc.text('Priority: 8', { lineBreak: true });
        doc.moveDown(0.5);

        // Sample FAQ 2
        doc.fontSize(12).font('Courier-Bold').text('Example 2 (Auto-generated patterns):', { underline: true });
        doc.fontSize(10).font('Courier');
        doc.text('Q: How do I share my card?', { lineBreak: true });
        doc.text('A: You can share your digital card via direct link, QR code, email, or social media. Simply click the share button on your card and choose your preferred method.', { lineBreak: true });
        doc.text('(Patterns will be auto-generated as: "share card", "share my card", "share")', { font: 'Courier-Oblique' });
        doc.moveDown(0.5);

        // Format Notes
        doc.fontSize(11).font('Courier-Bold').text('Important Notes:', { underline: true });
        doc.fontSize(10).font('Courier');
        doc.list([
            'Question must be 5-500 characters',
            'Answer must be 10-2000 characters',
            'Each pattern must be 2-200 characters',
            'At least one pattern is required (auto-generated if not provided)',
            'Priority must be a number between 1-10',
            'Use "A:" prefix on separate lines for multi-line answers',
            'Duplicate questions will be skipped unless "Update existing" is enabled'
        ]);
        doc.moveDown(0.5);

        // Field explanations
        doc.fontSize(11).font('Courier-Bold').text('Field Explanations:', { underline: true });
        doc.fontSize(10).font('Courier');
        doc.text('Question: The FAQ question that users might search for');
        doc.text('Answer: The complete answer to the question');
        doc.text('Patterns: Search keywords to match this FAQ (comma-separated). Leave blank for auto-generation.');
        doc.text('Category: FAQ category (default: general). Examples: getting-started, pricing, technical, billing');
        doc.text('Priority: Importance level 1-10 (default: 5). Higher numbers appear first in search results.');

        doc.end();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to download PDF template'
        });
    }
}));

// Upload and parse PDF (admin only)
router.post('/admin/upload-pdf', auth(), pdfUpload.single('pdf'), errorHandler.asyncHandler(async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No PDF file provided'
            });
        }

        // Extract text from PDF
        const pdfText = await extractTextFromPDF(req.file.buffer);
        // DEBUG: Log extracted text for troubleshooting spelling/character issues
        console.log('--- Extracted PDF Text Start ---');
        console.log(pdfText);
        console.log('--- Extracted PDF Text End ---');

        // Parse structured FAQs from text
        const parsedFaqs = parseStructuredFAQs(pdfText);
        
        if (parsedFaqs.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid FAQs found in PDF. Ensure format is: Q: question\nA: answer\nPatterns: pattern1, pattern2\nCategory: category\nPriority: 5'
            });
        }

        // Validate each FAQ
        const { faqs: validFaqs, errors: validationErrors } = await validateAndNormalizeFaqs(parsedFaqs);

        // Get overwrite flag from query
        const overwrite = req.query.overwrite === 'true';

        // Import FAQs
        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: validationErrors,
            skippedItems: []
        };

        for (let i = 0; i < validFaqs.length; i++) {
            try {
                const faqData = validFaqs[i];
                const normalizedQuestion = faqData.question.toLowerCase().trim();

                // Check if FAQ exists
                const existingFAQ = await FAQ.findOne({
                    $expr: {
                        $eq: [
                            { $toLower: '$question' },
                            normalizedQuestion
                        ]
                    }
                });

                if (existingFAQ) {
                    if (overwrite) {
                        Object.assign(existingFAQ, {
                            answer: faqData.answer,
                            patterns: faqData.patterns,
                            category: faqData.category,
                            priority: faqData.priority,
                            updatedBy: req.user.email || 'admin',
                            updatedAt: new Date()
                        });
                        await existingFAQ.save();
                        results.updated++;
                    } else {
                        results.skipped++;
                        results.skippedItems.push({
                            question: faqData.question,
                            reason: 'Question already exists and overwrite is disabled',
                            existingId: existingFAQ._id
                        });
                    }
                } else {
                    const newFAQ = new FAQ({
                        ...faqData,
                        createdBy: req.user.email || 'admin',
                        isActive: true
                    });
                    await newFAQ.save();
                    results.created++;
                }
            } catch (error) {
                results.errors.push({
                    index: i + 1,
                    question: validFaqs[i]?.question || 'Unknown',
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: 'PDF import completed',
            data: results
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to process PDF'
        });
    }
}));

/**
 * Helper function to validate and normalize FAQs
 */
async function validateAndNormalizeFaqs(faqs) {
    const validFaqs = [];
    const errors = [];

    for (let i = 0; i < faqs.length; i++) {
        const faq = faqs[i];
        const error = validateFaqFields(faq, i + 1);
        
        if (error) {
            errors.push(error);
        } else {
            validFaqs.push({
                question: faq.question.trim(),
                answer: faq.answer.trim(),
                patterns: faq.patterns.map(p => p.trim().toLowerCase()).filter(p => p),
                category: (faq.category || 'general').toLowerCase().trim(),
                priority: Math.max(1, Math.min(10, parseInt(faq.priority) || 5))
            });
        }
    }

    return { faqs: validFaqs, errors };
}

/**
 * Helper function to validate FAQ fields
 */
function validateFaqFields(faq, index) {
    if (!faq.question || faq.question.length < 5 || faq.question.length > 500) {
        return {
            index,
            question: faq.question || 'Empty',
            error: `Question must be 5-500 characters (got ${faq.question?.length || 0})`
        };
    }

    if (!faq.answer || faq.answer.length < 10 || faq.answer.length > 2000) {
        return {
            index,
            question: faq.question,
            error: `Answer must be 10-2000 characters (got ${faq.answer?.length || 0})`
        };
    }

    if (!Array.isArray(faq.patterns) || faq.patterns.length === 0) {
        return {
            index,
            question: faq.question,
            error: 'At least one search pattern is required'
        };
    }

    for (let i = 0; i < faq.patterns.length; i++) {
        const pattern = faq.patterns[i];
        if (!pattern || pattern.length < 2 || pattern.length > 200) {
            return {
                index,
                question: faq.question,
                error: `Pattern must be 2-200 characters (got ${pattern?.length || 0})`
            };
        }
    }

    return null;
}

module.exports = router;