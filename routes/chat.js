const express = require('express');
const { body, validationResult } = require('express-validator');
const Chat = require('../models/Chat');
const User = require('../models/User');
const FAQ = require('../models/FAQ');
const { v4: uuidv4 } = require('uuid');
const errorHandler = require('../middleware/errorHandler');

const router = express.Router();

// Improved FAQ matching function with better keyword matching
function findBestFAQMatch(query, faqs) {
    const normalizedQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    let bestMatch = { score: 0, faq: null, matchedPattern: '' };
    
    // Searching FAQs for query
    
    // FIRST: Try to find exact question match (for clicked FAQs)
    for (const faq of faqs) {
        const normalizedQuestion = faq.question.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (normalizedQuery === normalizedQuestion) {
            return { score: 1.0, faq, matchedPattern: faq.question };
        }
    }
    
    // SECOND: Try pattern matching
    for (const faq of faqs) {
        let faqBestScore = 0;
        let faqBestPattern = '';
        
        // Also check if query matches part of the answer
        const normalizedAnswer = faq.answer.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Check if answer contains the query
        if (normalizedAnswer.includes(normalizedQuery) && normalizedQuery.length >= 10) {
            const answerScore = Math.min(0.7, normalizedQuery.length / normalizedAnswer.length);
            if (answerScore > faqBestScore) {
                faqBestScore = answerScore;
                faqBestPattern = 'ANSWER_MATCH';
            }
        }
        
        // Check if query contains part of the answer (for longer queries)
        if (normalizedQuery.includes(normalizedAnswer.substring(0, 50)) && normalizedAnswer.length >= 20) {
            const answerScore = 0.6;
            if (answerScore > faqBestScore) {
                faqBestScore = answerScore;
                faqBestPattern = 'QUERY_CONTAINS_ANSWER';
            }
        }
        
        for (const pattern of faq.patterns) {
            const normalizedPattern = pattern.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
            let score = 0;
            let matchType = '';
            
            // 1. EXACT MATCH (highest priority)
            if (normalizedQuery === normalizedPattern) {
                score = 1.0;
                matchType = 'EXACT';
            }
            // 2. CONTAINS MATCH (query contains pattern)
            else if (normalizedQuery.includes(normalizedPattern) && normalizedPattern.length >= 3) {
                score = 0.9;
                matchType = 'CONTAINS';
            }
            // 3. PATTERN CONTAINS QUERY
            else if (normalizedPattern.includes(normalizedQuery) && normalizedQuery.length >= 3) {
                score = 0.8;
                matchType = 'CONTAINED';
            }
            // 4. IMPROVED WORD MATCHING
            else {
                // Remove only very common words, keep important ones
                const stopWords = ['is', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
                
                const queryWords = normalizedQuery.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
                const patternWords = normalizedPattern.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
                
                if (queryWords.length > 0 && patternWords.length > 0) {
                    let matches = 0;
                    let importantMatches = 0;
                    
                    queryWords.forEach(qWord => {
                        if (patternWords.includes(qWord)) {
                            matches++;
                            // Give extra weight to important keywords
                            if (['free', 'cost', 'price', 'create', 'share', 'update', 'information', 'include', 'card', 'digital'].includes(qWord)) {
                                importantMatches++;
                            }
                        }
                    });
                    
                    if (matches > 0) {
                        let wordRatio = matches / Math.max(queryWords.length, patternWords.length);
                        
                        // Boost score for important keyword matches
                        if (importantMatches > 0) {
                            wordRatio += (importantMatches * 0.2);
                        }
                        
                        // Much lower threshold for word matching
                        if (wordRatio >= 0.1) {
                            score = Math.min(wordRatio, 0.85); // Cap at 0.85
                            matchType = 'WORDS';
                        }
                    }
                }
            }
            
            // Pattern matching completed
            
            // Track best score for this FAQ
            if (score > faqBestScore) {
                faqBestScore = score;
                faqBestPattern = pattern;
            }
        }
        
        // FAQ scoring completed
        
        // Update global best match
        if (faqBestScore > bestMatch.score) {
            bestMatch = {
                score: faqBestScore,
                faq: faq,
                matchedPattern: faqBestPattern
            };
        }
    }
    
    // Best match found
    
    return bestMatch;
}

// Start new chat session
router.post('/start', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('metadata').optional().isObject()
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { sessionId, metadata = {} } = req.body;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';

        // Find or create user session
        const user = await User.findOrCreateSession({
            sessionId,
            ipAddress,
            userAgent,
            metadata
        });

        res.json({
            success: true,
            data: {
                sessionId,
                welcomeMessage: "Hi there! 👋 I'm your QueryNest assistant. How can I help you today?"
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to start chat session'
        });
    }
}));

// Send message and get response
router.post('/message', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('conversationId').optional(),
    body('message').isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1-1000 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { sessionId, conversationId: providedConversationId, message } = req.body;
        const startTime = Date.now();

        // Find or create the conversation
        let chat = null;
        if (providedConversationId) {
            chat = await Chat.findOne({ sessionId, conversationId: providedConversationId, status: 'active' });
        }
        if (!chat) {
            const user = await User.findOne({ sessionId });
            const conversationId = uuidv4();
            chat = new Chat({
                sessionId,
                userId: user?._id,
                conversationId,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent') || '',
                messages: []
            });
        }

        // Add user message
        chat.addMessage('user', message.trim());

        // Find FAQ answer using improved matching
        const faqs = await FAQ.find({ isActive: true });
        const bestMatch = findBestFAQMatch(message, faqs);
        const similarityThreshold = 0.05; // Much lower threshold for better matching

        const responseTime = Date.now() - startTime;
        let botResponse;
        let confidence = 0;
        let faqId = null;
        let suggestedFaqs = [];

        if (bestMatch.faq && bestMatch.score >= similarityThreshold) {
            botResponse = bestMatch.faq.answer;
            confidence = bestMatch.score;
            faqId = bestMatch.faq._id;
            
            // FAQ matched successfully
            
            // Record FAQ usage
            await bestMatch.faq.recordUsage(sessionId);
        } else {
            // Get top 3 most popular FAQs as suggestions
            const popularFaqs = await FAQ.find({ isActive: true })
                .sort({ 'usage.hitCount': -1, priority: -1 })
                .limit(3);
            
            suggestedFaqs = popularFaqs.map(faq => ({
                id: faq._id,
                question: faq.question,
                hitCount: faq.usage.hitCount
            }));
            
            botResponse = `Sorry, I couldn't find a specific answer to that question. 

Here are some popular questions that might help:`;
            
            confidence = 0;
            // No FAQ match found, showing suggestions
        }

        // Add bot response
        chat.addMessage('bot', botResponse, {
            faqId,
            confidence,
            responseTime,
            processed: true
        });

        // Update user activity
        await User.findOneAndUpdate(
            { sessionId },
            { 
                $inc: { totalChats: 1 },
                $set: { lastActivity: new Date() }
            }
        );

        await chat.save();

        res.json({
            success: true,
            data: {
                response: botResponse,
                confidence,
                conversationId: chat.conversationId,
                timestamp: new Date().toISOString(),
                metadata: {
                    faqMatched: !!faqId,
                    faqId: faqId, // Include the actual FAQ ID
                    responseTime,
                    needsEscalation: confidence < similarityThreshold,
                    suggestedFaqs: suggestedFaqs,
                    showCreateTicket: confidence < similarityThreshold
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to process message'
        });
    }
}));

// Get chat history
router.get('/history/:sessionId', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 10, page = 1 } = req.query;

        const chats = await Chat.find({ sessionId })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('conversationId messages status startedAt endedAt satisfaction endedReason');

        const totalChats = await Chat.countDocuments({ sessionId });

        res.json({
            success: true,
            data: {
                chats,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalChats,
                    pages: Math.ceil(totalChats / limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve chat history'
        });
    }
}));

// End chat conversation
router.post('/end', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('conversationId').optional(),
    body('satisfaction').optional().isObject(),
    body('reason').optional().isString()
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { sessionId, conversationId, satisfaction, reason } = req.body;

        // If no conversationId provided, just end the session
        if (!conversationId) {
            res.json({
                success: true,
                message: 'Chat session ended (no active conversation)',
                data: {
                    sessionId
                }
            });
            return;
        }

        const chat = await Chat.findOne({ 
            sessionId, 
            conversationId 
        });

        if (!chat) {
            // If no chat found, still return success (session ended)
            return res.json({
                success: true,
                message: 'Chat session ended (no conversation found)',
                data: {
                    sessionId,
                    conversationId
                }
            });
        }

        await chat.endConversation(reason || 'user');

        // Add satisfaction rating if provided
        if (satisfaction && satisfaction.rating) {
            await chat.addSatisfactionRating(satisfaction.rating, satisfaction.feedback || '');
        }

        res.json({
            success: true,
            message: 'Chat conversation ended',
            data: {
                conversationId,
                duration: chat.duration,
                messageCount: chat.messageCount,
                endedReason: chat.endedReason
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to end chat conversation'
        });
    }
}));

// Rate FAQ response
router.post('/rate-faq', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('faqId').notEmpty().withMessage('FAQ ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { sessionId, faqId, rating } = req.body;
        
        const faq = await FAQ.findById(faqId);
        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        await faq.addRating(rating, sessionId);

        res.json({
            success: true,
            message: 'FAQ rating recorded',
            data: {
                averageRating: faq.usage.averageRating
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to record FAQ rating'
        });
    }
}));

// Get popular questions
router.get('/popular-questions', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { limit = 6 } = req.query;

        const popularFAQs = await FAQ.getPopular(parseInt(limit));

        const questions = popularFAQs.map(faq => ({
            id: faq._id,
            question: faq.question,
            category: faq.category,
            hitCount: faq.usage.hitCount
        }));

        res.json({
            success: true,
            data: { questions }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve popular questions'
        });
    }
}));

// Create support ticket endpoint
router.post('/create-ticket', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('message').isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10-1000 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('name').optional().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2-100 characters'),
    body('mobile').optional().isLength({ min: 10, max: 20 }).withMessage('Mobile number must be 10-20 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { sessionId, message, email, name, mobile, conversationId } = req.body;
        
        // Import Ticket model
        const Ticket = require('../models/Ticket');
        
        // Find or create user
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        const user = await User.findOrCreateSession({
            sessionId,
            ipAddress,
            userAgent
        });

        // Generate unique ticket ID
        const ticketId = 'SD' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
        
        const ticket = new Ticket({
            ticketId,
            sessionId,
            userId: user._id,
            name: (name || 'Anonymous').trim(),
            email: email.toLowerCase().trim(),
            mobile: (mobile || 'N/A').trim(),
            message: message.trim(),
            status: 'new',
            priority: 'medium',
            origin: 'chatbot',
            relatedConversationId: conversationId
        });

        // Add initial activity
        ticket.addActivity('Created', 'user', 'Support ticket created via chatbot');

        await ticket.save();

        // Update user's ticket count
        await User.findOneAndUpdate(
            { sessionId },
            { 
                $inc: { totalTickets: 1 },
                $set: { lastActivity: new Date() }
            }
        );

        // Mark related conversation as escalated if exists
        if (conversationId) {
            await Chat.findOneAndUpdate(
                { conversationId },
                { 'analytics.escalatedToTicket': true }
            );
        }

        res.json({
            success: true,
            data: {
                ticketId: ticket.ticketId,
                status: ticket.status,
                createdAt: ticket.createdAt,
                message: 'Support ticket created successfully! Our team will get back to you soon.'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create support ticket'
        });
    }
}));

module.exports = router;