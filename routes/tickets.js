const express = require('express');
const { body, validationResult } = require('express-validator');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const errorHandler = require('../middleware/errorHandler');

// Try to load email service, but don't fail if it doesn't exist
let emailService = null;
try {
    emailService = require('../utils/emailService');
} catch (error) {
    console.warn('⚠️  Email service not found. Email functionality will be disabled.');
}

const router = express.Router();

// Priority detection function based on message content
function detectPriority(message) {
    const text = message.toLowerCase();
    
    // High priority keywords
    const highPriorityKeywords = [
        'urgent', 'critical', 'emergency', 'asap', 'immediately', 'broken', 'down', 'not working',
        'error', 'failed', 'crash', 'outage', 'disaster', 'severe', 'blocking', 'stuck',
        'cannot', 'unable', 'impossible', 'deadline', 'dead line', 'production down',
        'system down', 'server down', 'website down', 'app not working', 'login failed',
        'payment failed', 'transaction failed', 'order failed', 'checkout failed'
    ];
    
    // Low priority keywords
    const lowPriorityKeywords = [
        'question', 'inquiry', 'information', 'how to', 'tutorial', 'guide', 'help me understand',
        'curious', 'wondering', 'just asking', 'general question', 'feature request',
        'suggestion', 'improvement', 'enhancement', 'nice to have', 'when possible',
        'no rush', 'take your time', 'whenever', 'eventually', 'future', 'planning'
    ];
    
    // Check for high priority indicators
    const hasHighPriority = highPriorityKeywords.some(keyword => text.includes(keyword));
    if (hasHighPriority) {
        return 'high';
    }
    
    // Check for low priority indicators
    const hasLowPriority = lowPriorityKeywords.some(keyword => text.includes(keyword));
    if (hasLowPriority) {
        return 'low';
    }
    
    // Check for multiple exclamation marks or caps (urgency indicators)
    const exclamationCount = (message.match(/!/g) || []).length;
    const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    
    if (exclamationCount >= 3 || capsRatio > 0.3) {
        return 'high';
    }
    
    // Default to medium
    return 'medium';
}

// Create new support ticket
router.post('/create', [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('name').isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('mobile').isLength({ min: 10, max: 20 }).withMessage('Mobile number is required'),
    body('message').isLength({ min: 10, max: 2000 }).withMessage('Message must be 10-2000 characters'),
    body('conversationId').optional().isString(),
    body('priority').optional().isIn(['low', 'medium', 'high'])
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
            sessionId, 
            name, 
            email,
            mobile, 
            message, 
            conversationId, 
            priority 
        } = req.body;

        // Auto-detect priority based on message content if not provided
        const detectedPriority = priority || detectPriority(message);

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

        // Create ticket
        const ticket = new Ticket({
            ticketId,
            sessionId,
            userId: user._id,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            mobile: mobile.trim(),
            message: message.trim(),
            priority: detectedPriority,
            relatedConversationId: conversationId
        });

        // Add initial activity
        ticket.addActivity('Created', 'user', 'Support ticket created via chatbot');

        await ticket.save();

        // Update user ticket count
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

        // Send confirmation email
        if (emailService) {
            try {
                await emailService.sendTicketConfirmation({
                    to: ticket.email,
                    ticketId: ticket.ticketId,
                    customerName: ticket.name,
                    message: ticket.message
                });
            } catch (error) {
                console.error('Failed to send confirmation email:', error);
                // Don't fail the ticket creation if email fails
            }
        }

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            data: {
                ticketId,
                status: ticket.status,
                createdAt: ticket.createdAt,
                name: ticket.name,
                email: ticket.email,
                mobile: ticket.mobile,
                priority: ticket.priority
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create support ticket'
        });
    }
}));

// Get tickets (widget - by session ID)
router.get('/session/:sessionId', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { status, limit = 10, page = 1 } = req.query;

        const query = { sessionId };
        if (status) query.status = status;

        const tickets = await Ticket.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('ticketId status priority createdAt updatedAt');

        const totalTickets = await Ticket.countDocuments(query);

        res.json({
            success: true,
            data: {
                tickets,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalTickets,
                    pages: Math.ceil(totalTickets / limit)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve tickets'
        });
    }
}));

// Get single ticket details (widget - by ticket ID and session)
router.get('/:ticketId/session/:sessionId', errorHandler.asyncHandler(async (req, res) => {
    try {
        const { ticketId, sessionId } = req.params;

        const ticket = await Ticket.findOne({ 
            ticketId, 
            sessionId 
        }).select('-userId -__v');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        res.json({
            success: true,
            data: { ticket }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ticket details'
        });
    }
}));

// ========== ADMIN ROUTES ==========

// Get all tickets (admin only)
router.get('/admin/all', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { 
            status, 
            priority, 
            assignedTo, 
            search,
            showArchives,
            limit = 20, 
            page = 1,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (assignedTo) query.assignedTo = assignedTo;
        
        // Archive logic
        if (showArchives === 'true') {
            query.isArchived = true;
        } else {
            query.isArchived = { $ne: true }; // Show non-archived by default
        }
        
        if (search) {
            query.$or = [
                { ticketId: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Build sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const tickets = await Ticket.find(query)
            .populate('userId', 'sessionId location metadata')
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const totalTickets = await Ticket.countDocuments(query);

        // Get status counts
        const statusCounts = await Ticket.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                tickets,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalTickets,
                    pages: Math.ceil(totalTickets / limit)
                },
                statusCounts: statusCounts.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve tickets'
        });
    }
}));

// Get single ticket by ticketId (admin only)
router.get('/admin/:ticketId', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { ticketId } = req.params;
        // Support both exact match and case-insensitive fallback
        let ticket = await Ticket.findOne({ ticketId }).lean();
        if (!ticket) {
            ticket = await Ticket.findOne({ ticketId: new RegExp(`^${ticketId}$`, 'i') }).lean();
        }
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        res.json({ success: true, data: { ticket } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to retrieve ticket' });
    }
}));

// Delete ticket (admin only)
router.delete('/admin/:ticketId', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { ticketId } = req.params;

        const ticket = await Ticket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        await Ticket.deleteOne({ ticketId });

        res.json({
            success: true,
            message: 'Ticket deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete ticket'
        });
    }
}));

// Update ticket status (admin only)
router.patch('/admin/:ticketId/status', auth(), [
    body('status').isIn(['new', 'in_progress', 'closed']).withMessage('Invalid status'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ticketId } = req.params;
        const { status, notes = '' } = req.body;

        const ticket = await Ticket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const oldStatus = ticket.status;
        ticket.status = status;
        ticket.addActivity(
            `Status changed from ${oldStatus} to ${status}`, 
            req.user.email || 'admin',
            notes
        );

        await ticket.save();

        res.json({
            success: true,
            message: 'Ticket status updated',
            data: {
                ticketId,
                oldStatus,
                newStatus: status,
                updatedAt: ticket.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update ticket status'
        });
    }
}));

// Assign ticket (admin only)
router.patch('/admin/:ticketId/assign', auth(), [
    body('assignedTo').notEmpty().withMessage('Assigned to is required'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ticketId } = req.params;
        const { assignedTo, notes = '' } = req.body;

        const ticket = await Ticket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const oldAssignee = ticket.assignedTo || 'unassigned';
        ticket.assignedTo = assignedTo;
        ticket.addActivity(
            `Ticket assigned from ${oldAssignee} to ${assignedTo}`, 
            req.user.email || 'admin',
            notes
        );

        // Auto-change status to 'in_progress' if it's 'new'
        if (ticket.status === 'new') {
            ticket.status = 'in_progress';
            ticket.addActivity('Status changed to in_progress', req.user.email || 'admin', 'Auto-changed when assigned');
        }

        await ticket.save();

        res.json({
            success: true,
            message: 'Ticket assigned successfully',
            data: {
                ticketId,
                assignedTo,
                status: ticket.status,
                updatedAt: ticket.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to assign ticket'
        });
    }
}));

// Update ticket priority (admin only)
router.patch('/admin/:ticketId/priority', auth(), [
    body('priority').isIn(['low', 'medium', 'high']).withMessage('Priority must be low, medium, or high'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ticketId } = req.params;
        const { priority, notes = '' } = req.body;

        const ticket = await Ticket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        const oldPriority = ticket.priority;
        ticket.priority = priority;
        ticket.addActivity(
            `Priority changed from ${oldPriority} to ${priority}`, 
            req.user.email || 'admin',
            notes
        );

        await ticket.save();

        res.json({
            success: true,
            message: 'Ticket priority updated successfully',
            data: {
                ticketId,
                priority: ticket.priority,
                updatedAt: ticket.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update ticket priority'
        });
    }
}));

// Add note to ticket (admin only)
router.post('/admin/:ticketId/note', auth(), [
    body('notes').isLength({ min: 1, max: 1000 }).withMessage('Notes must be 1-1000 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ticketId } = req.params;
        const { notes } = req.body;

        const ticket = await Ticket.findOne({ ticketId });
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        ticket.addActivity('Note added', req.user.email || 'admin', notes);
        await ticket.save();

        res.json({
            success: true,
            message: 'Note added to ticket',
            data: {
                ticketId,
                updatedAt: ticket.updatedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to add note to ticket'
        });
    }
}));

// Get ticket statistics (admin only)
router.get('/admin/stats', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        
        let startDate;
        const now = new Date();
        
        switch (period) {
            case 'day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        const stats = await Ticket.aggregate([
            {
                $facet: {
                    totalStats: [
                        {
                            $group: {
                                _id: null,
                                total: { $sum: 1 },
                                byStatus: {
                                    $push: {
                                        status: '$status',
                                        count: 1
                                    }
                                },
                                byPriority: {
                                    $push: {
                                        priority: '$priority',
                                        count: 1
                                    }
                                }
                            }
                        }
                    ],
                    periodStats: [
                        {
                            $match: {
                                createdAt: { $gte: startDate }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalInPeriod: { $sum: 1 },
                                resolvedInPeriod: {
                                    $sum: {
                                        $cond: [{ $eq: ['$status', 'closed'] }, 1, 0]
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        ]);

        // Process status counts
        const statusCounts = {};
        stats[0].totalStats[0]?.byStatus.forEach(item => {
            statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
        });

        // Process priority counts
        const priorityCounts = {};
        stats[0].totalStats[0]?.byPriority.forEach(item => {
            priorityCounts[item.priority] = (priorityCounts[item.priority] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                total: stats[0].totalStats[0]?.total || 0,
                statusCounts,
                priorityCounts,
                period: {
                    name: period,
                    startDate,
                    totalInPeriod: stats[0].periodStats[0]?.totalInPeriod || 0,
                    resolvedInPeriod: stats[0].periodStats[0]?.resolvedInPeriod || 0,
                    resolutionRate: stats[0].periodStats[0] ? 
                        Math.round((stats[0].periodStats[0].resolvedInPeriod / stats[0].periodStats[0].totalInPeriod) * 100) || 0
                        : 0
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve ticket statistics'
        });
    }
}));

// Archive ticket
router.patch('/admin/:ticketId/archive', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }
        if (ticket.isImportant) {
            return res.status(400).json({ success: false, message: 'Cannot archive a starred (important) ticket. Unstar it first.' });
        }
        ticket.isArchived = true;
        ticket.addActivity('archived', req.user?.name || 'Admin', 'Ticket archived');
        await ticket.save();
        res.json({ success: true, message: 'Ticket archived successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to archive ticket' });
    }
}));

// Unarchive ticket
router.patch('/admin/:ticketId/unarchive', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        ticket.isArchived = false;
        ticket.addActivity('unarchived', req.user?.name || 'Admin', 'Ticket unarchived');
        await ticket.save();

        res.json({ success: true, message: 'Ticket unarchived successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to unarchive ticket' });
    }
}));

// Mark ticket as important/normal
router.patch('/admin/:ticketId/important', auth(), errorHandler.asyncHandler(async (req, res) => {
    try {
        const { important } = req.body;
        const ticket = await Ticket.findOne({ ticketId: req.params.ticketId });
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        ticket.isImportant = important;
        ticket.addActivity(important ? 'marked_important' : 'marked_normal', req.user?.name || 'Admin', 
            important ? 'Ticket marked as important' : 'Ticket marked as normal');
        await ticket.save();

        res.json({ success: true, message: `Ticket ${important ? 'marked as important' : 'marked as normal'} successfully` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update ticket importance' });
    }
}));

// Reply to ticket and send email (admin only)
router.post('/admin/:ticketId/reply', auth(), [
    body('message').isLength({ min: 10, max: 5000 }).withMessage('Reply message must be between 10-5000 characters')
], errorHandler.asyncHandler(async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { ticketId } = req.params;
        const { message } = req.body;

        console.log('📧 Processing ticket reply:', { ticketId, messageLength: message.length });

        const ticket = await Ticket.findOne({ ticketId });
        if (!ticket) {
            console.warn('⚠️  Ticket not found:', ticketId);
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Get admin info
        const Admin = require('../models/Admin');
        const admin = await Admin.findById(req.user.id).select('name email');
        const adminName = admin?.name || req.user.email || 'Support Team';

        console.log('👤 Admin replying:', adminName);

        // Add reply to activity log
        ticket.addActivity('Reply sent to customer', adminName, message);
        
        // Update status to in_progress if it's new
        if (ticket.status === 'new') {
            ticket.status = 'in_progress';
            ticket.addActivity('Status changed to in_progress', adminName, 'Auto-changed when replying');
        }

        await ticket.save();
        console.log('✅ Ticket updated in database');

        // Send email to customer
        let emailSent = false;
        let emailError = null;

        if (emailService) {
            try {
                console.log('📧 Attempting to send email to:', ticket.email);
                await emailService.sendTicketReply({
                    to: ticket.email,
                    ticketId: ticket.ticketId,
                    customerName: ticket.name,
                    originalMessage: ticket.message,
                    replyMessage: message,
                    adminName: adminName
                });
                emailSent = true;
                console.log('✅ Email sent successfully');
            } catch (error) {
                console.error('❌ Failed to send email:', error.message);
                emailError = error.message;
                // Don't fail the request if email fails, just log it
            }
        } else {
            console.warn('⚠️  Email service not available');
            emailError = 'Email service is not configured';
        }

        const responseData = {
            success: true,
            message: 'Reply sent successfully' + (emailSent ? ' and email notification sent' : ''),
            data: {
                ticketId,
                replySent: true,
                emailSent,
                emailError: emailError || null,
                updatedAt: ticket.updatedAt
            }
        };

        console.log('📤 Sending response:', responseData);
        res.json(responseData);
    } catch (error) {
        console.error('❌ Error in ticket reply route:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send reply',
            error: error.message
        });
    }
}));

module.exports = router;