const express = require('express');
const Chat = require('../models/Chat');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const FAQ = require('../models/FAQ');
const Admin = require('../models/Admin');
const auth = require('../middleware/auth');
const roleValidation = require('../middleware/roleValidation');
const errorHandler = require('../middleware/errorHandler');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { calculatePerformanceMetrics } = require('../utils/analyticsHelpers');
const { convertToCSV, getCSVSchema } = require('../utils/csvHelpers');

// Input validation schemas
const adminValidation = {
    create: [
        body('name').trim().isLength({ min: 2, max: 50 })
            .withMessage('Name must be between 2 and 50 characters'),
        body('username').trim().isLength({ min: 3 })
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Username must be at least 3 characters and can only contain letters, numbers and underscores'),
        // Password is not required from client for new admin
        body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail()
            .withMessage('If provided, email must be a valid email address'),
    ],
    update: [
        body('name').optional().trim().isLength({ min: 2, max: 50 })
            .withMessage('Name must be between 2 and 50 characters'),
        body('username').optional().trim().isLength({ min: 3 })
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Username must be at least 3 characters and can only contain letters, numbers and underscores'),
        body('email').optional().isEmail().normalizeEmail()
            .withMessage('Must be a valid email address'),
        body('password').optional().isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
            .withMessage('Password must be at least 8 characters and include uppercase, lowercase, number and special character'),
    ]
};

// Utility function to parse user agent
function parseUserAgent(userAgent) {
    if (!userAgent) return 'Unknown';
    
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edg')) return 'Edge';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
    if (ua.includes('msie') || ua.includes('trident')) return 'Internet Explorer';
    
    return 'Other';
}

// Utility function to get country from IP (simplified)
function getCountryFromIP(ip) {
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return 'Local';
    }
    // For now, return 'Unknown' for external IPs
    // In production, you'd use a service like ipapi.co or similar
    return 'Unknown';
}

const router = express.Router();
// Delete user by sessionId (admin only)
router.delete('/users/:sessionId', auth(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await User.deleteOne({ sessionId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});

// Get dashboard overview (admin only)
router.get('/dashboard', auth(), errorHandler.asyncHandler(async (req, res) => {
    // Start performance monitoring
    const startTime = process.hrtime();
    
    // Use Promise.allSettled to handle multiple parallel requests that might fail independently
        const [
            faqStats,
            ticketStats,
            chatStats,
            userStats,
            activeUserStats,
            userEngagementStats,
            recentTicketsResult,
            topFAQsResult,
            satisfactionStatsResult,
            recentRatingsResult,
            allUsersResult
        ] = await Promise.allSettled([
        // Basic statistics
        FAQ.countDocuments({ isActive: true }),
        Ticket.countDocuments(),
        Chat.countDocuments(),
        
        // User statistics
        User.countDocuments(),
        User.countDocuments({ lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        
        // User engagement
        User.aggregate([{
            $group: {
                _id: null,
                totalChats: { $sum: '$totalChats' },
                totalTickets: { $sum: '$totalTickets' },
                avgChatsPerUser: { $avg: '$totalChats' },
                avgTicketsPerUser: { $avg: '$totalTickets' }
            }
        }]),
        
        // Recent tickets
        Ticket.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('ticketId status priority createdAt name')
            .lean(),
            
        // Top FAQs
        FAQ.find({ isActive: true })
            .sort({ 'usage.hitCount': -1 })
            .limit(5)
            .select('question category usage.hitCount usage.averageRating')
            .lean(),
            
        // Satisfaction statistics
        Chat.aggregate([
            { $match: { 'satisfaction.rating': { $exists: true, $ne: null } } },
            { $group: { 
                _id: null,
                averageRating: { $avg: '$satisfaction.rating' },
                totalRatings: { $sum: 1 }
            }}
        ]),
        
        // Recent ratings
        Chat.find({ 'satisfaction.rating': { $exists: true, $ne: null } })
            .sort({ 'satisfaction.timestamp': -1 })
            .limit(5)
            .select('sessionId satisfaction.rating satisfaction.timestamp satisfaction.feedback')
            .lean(),
            
        // All users for browser/location stats
        User.find({}).select('userAgent ipAddress').lean()
    ]);

    // Helper function to safely extract value from Promise result
    const getValue = (result, defaultValue) => 
        result.status === 'fulfilled' ? result.value : defaultValue;

    // Process user location and browser statistics
    const allUsers = getValue(allUsersResult, []);
    const browserCounts = {};
    const countryCounts = {};
    
    allUsers.forEach(user => {
        const browser = parseUserAgent(user.userAgent);
        const country = getCountryFromIP(user.ipAddress);
        
        browserCounts[browser] = (browserCounts[browser] || 0) + 1;
        countryCounts[country] = (countryCounts[country] || 0) + 1;
    });
    
    // Convert to sorted arrays
    const geoStats = Object.entries(countryCounts)
        .map(([country, count]) => ({ _id: country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
        
    const deviceStats = Object.entries(browserCounts)
        .map(([browser, count]) => ({ _id: browser, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Get ticket status counts with aggregation
    const ticketStatusCounts = await Ticket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).then(rows => 
        rows.reduce((acc, r) => {
            acc[r._id] = r.count;
            return acc;
        }, { new: 0, open: 0, pending: 0, resolved: 0, closed: 0 })
    ).catch(() => ({ new: 0, open: 0, pending: 0, resolved: 0, closed: 0 }));

    // Extract user engagement stats
    const userEngagement = (getValue(userEngagementStats, [{ 
        totalChats: 0,
        totalTickets: 0,
        avgChatsPerUser: 0,
        avgTicketsPerUser: 0
    }]))[0];

    // Get satisfaction stats
    const satisfactionStats = (getValue(satisfactionStatsResult, [{ 
        averageRating: null,
        totalRatings: 0
    }]))[0];

    // Calculate execution time
    const executionTime = process.hrtime(startTime);
    const executionTimeMs = (executionTime[0] * 1000 + executionTime[1] / 1000000).toFixed(2);

    // Return dashboard data
    res.json({
        success: true,
        data: {
            summary: {
                totalUsers: getValue(userStats, 0),
                totalChats: getValue(chatStats, 0),
                totalTickets: getValue(ticketStats, 0),
                totalFAQs: getValue(faqStats, 0),
                averageSatisfaction: satisfactionStats?.averageRating ?? null,
                totalRatings: satisfactionStats?.totalRatings ?? 0,
                activeUsers: getValue(activeUserStats, 0),
                userEngagement: {
                    avgChatsPerUser: userEngagement?.avgChatsPerUser ?? 0,
                    avgTicketsPerUser: userEngagement?.avgTicketsPerUser ?? 0
                }
            },
            userAnalytics: {
                totalUsers: getValue(userStats, 0),
                activeUsers: getValue(activeUserStats, 0),
                // geoStats and deviceStats removed
                engagement: userEngagement
            },
            ticketStatusCounts,
            topFAQs: getValue(topFAQsResult, []),
            recentActivity: {
                tickets: getValue(recentTicketsResult, []),
                ratings: getValue(recentRatingsResult, []).map(chat => ({
                    sessionId: chat.sessionId,
                    rating: chat.satisfaction.rating,
                    feedback: chat.satisfaction.feedback,
                    timestamp: chat.satisfaction.timestamp
                }))
            },
            performance: {
                executionTimeMs: parseFloat(executionTimeMs),
                timestamp: new Date().toISOString()
            }
        }
    });
}));

// List chats for admin table
router.get('/chats', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { 
        status, 
        search, 
        ticketStatus, 
        showArchives, 
        importantStatus, 
        limit = 20, 
        page = 1,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    // Validate pagination parameters
    const validatedLimit = Math.min(Math.max(parseInt(limit), 1), 100); // Limit between 1 and 100
    const validatedPage = Math.max(parseInt(page), 1);
    
    // Build query with proper validation
    const query = {};
    
    // Status filtering with validation
    if (status && ['active', 'ended', 'archived'].includes(status)) {
        query.status = status;
    } else if (showArchives === 'true') {
        query.status = 'archived';
    } else {
        query.status = { $in: ['active', 'ended'] };
    }
    
    // Search with proper escaping and validation
    if (search) {
        const sanitizedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        query.$or = [
            { sessionId: { $regex: sanitizedSearch, $options: 'i' } },
            { conversationId: { $regex: sanitizedSearch, $options: 'i' } }
        ];
    }

    // Importance filtering
    if (importantStatus === 'important') {
        query['analytics.isImportant'] = true;
    } else if (importantStatus === 'normal') {
        query['analytics.isImportant'] = { $ne: true };
    }

    // Validate sort parameters
    const allowedSortFields = ['createdAt', 'status', 'duration', 'messageCount'];
    const validatedSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const validatedSortOrder = sortOrder === 'asc' ? 1 : -1;
    const sortOptions = { [validatedSortBy]: validatedSortOrder };

    try {
        // Execute main chat query and total count in parallel
        const [chats, total] = await Promise.all([
            Chat.find(query)
                .sort(sortOptions)
                .limit(validatedLimit)
                .skip((validatedPage - 1) * validatedLimit)
                .select('sessionId conversationId status duration createdAt messages satisfaction analytics')
                .lean(),
            Chat.countDocuments(query)
        ]);

        if (!chats.length && validatedPage > 1) {
            throw new errorHandler.ValidationError('Page number exceeds available results');
        }

        // Get all ticket information in one query
        const sessionIds = chats.map(chat => chat.sessionId);
        const conversationIds = chats.map(chat => chat.conversationId);
        
        const tickets = await Ticket.find({
            $or: [
                { sessionId: { $in: sessionIds } },
                { relatedConversationId: { $in: conversationIds } }
            ]
        })
        .select('ticketId status sessionId relatedConversationId')
        .lean();

        // Create lookup maps for efficient ticket matching
        const ticketMap = new Map();
        tickets.forEach(ticket => {
            if (ticket.sessionId) ticketMap.set(ticket.sessionId, ticket);
            if (ticket.relatedConversationId) ticketMap.set(ticket.relatedConversationId, ticket);
        });

        // Transform chat data with ticket information
        const chatsWithTickets = chats.map(chat => {
            const ticket = ticketMap.get(chat.sessionId) || ticketMap.get(chat.conversationId);

            return {
                sessionId: chat.sessionId,
                conversationId: chat.conversationId,
                status: chat.status,
                duration: chat.duration || 0,
                createdAt: chat.createdAt,
                messageCount: (chat.messages?.length) || 0,
                rating: chat.satisfaction?.rating || null,
                hasTicket: !!ticket,
                ticketId: ticket?.ticketId || null,
                ticketStatus: ticket?.status || null,
                escalatedToTicket: chat.analytics?.escalatedToTicket || false,
                isArchived: chat.status === 'archived',
                isImportant: chat.analytics?.isImportant || false
            };
        });

        // Apply ticket status filtering
        let filteredChats = chatsWithTickets;
        if (ticketStatus === 'converted') {
            filteredChats = chatsWithTickets.filter(chat => chat.hasTicket);
        } else if (ticketStatus === 'not_converted') {
            filteredChats = chatsWithTickets.filter(chat => !chat.hasTicket);
        }

        // Return paginated results with metadata
        res.json({
            success: true,
            data: {
                chats: filteredChats,
                pagination: {
                    page: validatedPage,
                    limit: validatedLimit,
                    total,
                    pages: Math.ceil(total / validatedLimit)
                },
                filters: {
                    status,
                    showArchives,
                    importantStatus,
                    ticketStatus
                },
                sorting: {
                    field: validatedSortBy,
                    order: sortOrder
                }
            }
        });
    } catch (error) {
        if (error instanceof errorHandler.ValidationError) {
            throw error;
        }
        throw new errorHandler.DatabaseError('Failed to retrieve chats', error);
    }
}));

// Get a specific chat by conversationId
router.get('/chats/:conversationId', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    
    const chat = await Chat.findOne({ conversationId })
        .populate('userId', 'name email')
        .lean();
    
    if (!chat) {
        throw new errorHandler.NotFoundError('Chat not found');
    }
    
    // Format messages if they exist
    const formattedMessages = (chat.messages || []).map(msg => ({
        sender: msg.sender || msg.role || 'user',
        text: msg.text || msg.content || msg.message || '',
        timestamp: msg.timestamp || msg.createdAt || new Date(),
        type: msg.type || 'text'
    }));
    
    res.json({
        success: true,
        data: {
            _id: chat._id,
            sessionId: chat.sessionId,
            conversationId: chat.conversationId,
            userId: chat.userId,
            status: chat.status,
            duration: chat.duration,
            messageCount: chat.messageCount,
            rating: chat.rating,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            messages: formattedMessages
        }
    });
}));

// End a chat (admin only)
router.patch('/chats/:conversationId/end', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const chat = await Chat.findOne({ conversationId });
    
    if (!chat) {
        throw new errorHandler.NotFoundError('Chat not found');
    }

    if (chat.status === 'archived') {
        throw new errorHandler.ValidationError('Cannot end an archived chat');
    }

    if (chat.status !== 'ended') {
        await chat.endConversation();
    }

    res.json({ 
        success: true, 
        message: 'Chat ended successfully',
        data: {
            conversationId,
            status: 'ended',
            endedAt: new Date().toISOString()
        }
    });
}));

// Delete a chat (admin only)
router.delete('/chats/:conversationId', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    
    // Start a transaction for atomicity
    const session = await Chat.startSession();
    
    try {
        await session.withTransaction(async () => {
            // Get chat for pre-deletion checks
            const chat = await Chat.findOne({ conversationId }).session(session);
            
            if (!chat) {
                throw new errorHandler.NotFoundError('Chat not found');
            }

            // Check if chat can be deleted (e.g., not linked to an active ticket)
            const linkedTicket = await Ticket.findOne({
                $or: [
                    { sessionId: chat.sessionId },
                    { relatedConversationId: conversationId }
                ],
                status: { $nin: ['closed'] }
            }).session(session);

            if (linkedTicket) {
                throw new errorHandler.ValidationError(
                    `Cannot delete chat with active ticket #${linkedTicket.ticketId}. Close the ticket first.`
                );
            }

            // Perform deletion
            const result = await Chat.deleteOne({ conversationId }).session(session);
            
            if (result.deletedCount === 0) {
                throw new errorHandler.NotFoundError('Chat was already deleted');
            }

            // Cleanup related data if needed
            await Promise.all([
                // Add any necessary cleanup operations here
            ]);
        });

        res.json({
            success: true,
            message: 'Chat deleted successfully',
            data: { 
                conversationId,
                deletedAt: new Date().toISOString()
            }
        });
    } finally {
        session.endSession();
    }
}));

// Archive a chat (admin only)
router.patch('/chats/:conversationId/archive', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    
    const chat = await Chat.findOne({ conversationId });
    if (!chat) {
        throw new errorHandler.NotFoundError('Chat not found');
    }
    
    if (chat.status === 'archived') {
        throw new errorHandler.ValidationError('Chat is already archived');
    }

    if (chat.status === 'active') {
        throw new errorHandler.ValidationError('Cannot archive an active chat. End the chat first.');
    }
    
    // Update chat status and add archival metadata
    chat.status = 'archived';
    chat.archivalInfo = {
        archivedAt: new Date(),
        archivedBy: req.user.id,
        previousStatus: chat.status
    };
    
    await chat.save();
    
    res.json({
        success: true,
        message: 'Chat archived successfully',
        data: {
            conversationId,
            status: 'archived',
            archivedAt: chat.archivalInfo.archivedAt
        }
    });
}));

// Unarchive a chat (admin only)
router.patch('/chats/:conversationId/unarchive', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    
    const chat = await Chat.findOne({ conversationId });
    if (!chat) {
        throw new errorHandler.NotFoundError('Chat not found');
    }
    
    if (chat.status !== 'archived') {
        throw new errorHandler.ValidationError('Chat is not archived');
    }
    
    // Restore previous status or default to ended
    chat.status = (chat.archivalInfo?.previousStatus === 'active') ? 'ended' : 'ended';
    chat.archivalInfo = {
        ...chat.archivalInfo,
        unarchivedAt: new Date(),
        unarchivedBy: req.user.id
    };
    
    await chat.save();
    
    res.json({
        success: true,
        message: 'Chat unarchived successfully',
        data: {
            conversationId,
            status: chat.status,
            unarchivedAt: chat.archivalInfo.unarchivedAt
        }
    });
}));

// Mark chat as important (admin only)
router.patch('/chats/:conversationId/important', auth(), async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { important } = req.body;
        
        const chat = await Chat.findOne({ conversationId });
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }
        
        if (!chat.analytics) {
            chat.analytics = {};
        }
        chat.analytics.isImportant = important === true;
        await chat.save();
        
        res.json({ 
            success: true, 
            message: important ? 'Chat marked as important' : 'Chat marked as normal', 
            data: { conversationId, isImportant: chat.analytics.isImportant } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update importance' });
    }
});

// Get detailed analytics (admin only)
router.get('/analytics', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { 
        startDate: startParam, 
        endDate: endParam,
        granularity = 'day',
        timezone = 'UTC'
    } = req.query;

    // Validate date parameters
    const validGranularities = ['hour', 'day', 'week', 'month'];
    if (!validGranularities.includes(granularity)) {
        throw new errorHandler.ValidationError('Invalid granularity. Must be one of: hour, day, week, month');
    }

    // Parse and validate dates
    const now = new Date();
    const endDate = endParam ? new Date(endParam) : now;
    const startDate = startParam ? new Date(startParam) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new errorHandler.ValidationError('Invalid date format');
    }

    if (startDate > endDate) {
        throw new errorHandler.ValidationError('Start date must be before end date');
    }

    if (endDate > now) {
        throw new errorHandler.ValidationError('End date cannot be in the future');
    }

    // Maximum date range validation (e.g., 1 year)
    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (endDate.getTime() - startDate.getTime() > maxRange) {
        throw new errorHandler.ValidationError('Date range cannot exceed 1 year');
    }

    // Determine date grouping based on granularity with timezone consideration
    const dateGrouping = {
        hour: {
            year: { $year: { date: '$createdAt', timezone } },
            month: { $month: { date: '$createdAt', timezone } },
            day: { $dayOfMonth: { date: '$createdAt', timezone } },
            hour: { $hour: { date: '$createdAt', timezone } }
        },
        day: {
            year: { $year: { date: '$createdAt', timezone } },
            month: { $month: { date: '$createdAt', timezone } },
            day: { $dayOfMonth: { date: '$createdAt', timezone } }
        },
        week: {
            year: { $year: { date: '$createdAt', timezone } },
            week: { $week: { date: '$createdAt', timezone } }
        },
        month: {
            year: { $year: { date: '$createdAt', timezone } },
            month: { $month: { date: '$createdAt', timezone } }
        }
    }[granularity];

    // Execute all aggregations in parallel with error handling
    try {
        const [
            chatTrends,
            ticketTrends,
            userTrends,
            faqUsageTrends,
            geoData,
            satisfactionTrends
        ] = await Promise.all([
            // Chat analytics
            Chat.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: dateGrouping,
                        totalChats: { $sum: 1 },
                        totalMessages: { $sum: { $size: '$messages' } },
                        averageDuration: { $avg: '$duration' },
                        escalatedChats: {
                            $sum: { $cond: ['$analytics.escalatedToTicket', 1, 0] }
                        },
                        satisfactionAvg: { 
                            $avg: '$satisfaction.rating'
                        }
                    }
                },
                { $sort: { '_id': 1 } }
            ]),

            // Ticket trends
            Ticket.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: dateGrouping,
                        totalTickets: { $sum: 1 },
                        statusCounts: {
                            $push: {
                                k: '$status',
                                v: 1
                            }
                        },
                        priorityCounts: {
                            $push: {
                                k: '$priority',
                                v: 1
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        statusDistribution: { $arrayToObject: '$statusCounts' },
                        priorityDistribution: { $arrayToObject: '$priorityCounts' }
                    }
                },
                { $sort: { '_id': 1 } }
            ]),

            // User activity
            User.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: dateGrouping,
                        newUsers: { $sum: 1 },
                        activeUsers: {
                            $sum: {
                                $cond: [
                                    { $gte: ['$lastActivity', startDate] },
                                    1,
                                    0
                                ]
                            }
                        },
                        totalEngagement: {
                            $sum: { $add: ['$totalChats', '$totalTickets'] }
                        }
                    }
                },
                { $sort: { '_id': 1 } }
            ]),

            // FAQ usage
            FAQ.aggregate([
                {
                    $match: {
                        'usage.lastUsed': { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $unwind: '$usage.ratings'
                },
                {
                    $match: {
                        'usage.ratings.timestamp': { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            ...dateGrouping,
                            category: '$category'
                        },
                        hits: { $sum: '$usage.hitCount' },
                        averageRating: { $avg: '$usage.ratings.rating' },
                        uniqueUsers: { $addToSet: '$usage.ratings.userId' }
                    }
                },
                { $sort: { '_id': 1 } }
            ]),

            // Geographical data
            User.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate },
                        'location.country': { $exists: true }
                    }
                },
                {
                    $group: {
                        _id: {
                            country: '$location.country',
                            city: '$location.city'
                        },
                        userCount: { $sum: 1 },
                        engagementMetrics: {
                            totalChats: { $sum: '$totalChats' },
                            totalTickets: { $sum: '$totalTickets' },
                            averageChatsPerUser: { $avg: '$totalChats' }
                        }
                    }
                },
                { $sort: { userCount: -1 } },
                { $limit: 20 }
            ]),

            // Satisfaction trends
            Chat.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate },
                        'satisfaction.rating': { $exists: true }
                    }
                },
                {
                    $group: {
                        _id: dateGrouping,
                        averageRating: { $avg: '$satisfaction.rating' },
                        totalRatings: { $sum: 1 },
                        ratingDistribution: {
                            $push: '$satisfaction.rating'
                        }
                    }
                },
                {
                    $addFields: {
                        ratingStats: {
                            min: { $min: '$ratingDistribution' },
                            max: { $max: '$ratingDistribution' },
                            median: { $median: '$ratingDistribution' }
                        }
                    }
                },
                { $sort: { '_id': 1 } }
            ])
        ]);

        // Calculate performance metrics
        const metrics = calculatePerformanceMetrics({
            chatTrends,
            ticketTrends,
            userTrends,
            satisfactionTrends
        });

        res.json({
            success: true,
            data: {
                dateRange: {
                    startDate,
                    endDate,
                    granularity,
                    timezone
                },
                trends: {
                    chats: chatTrends,
                    tickets: ticketTrends,
                    users: userTrends,
                    faqUsage: faqUsageTrends,
                    satisfaction: satisfactionTrends
                },
                geography: geoData,
                metrics,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        if (error.name === 'MongoServerError') {
            throw new errorHandler.DatabaseError('Failed to retrieve analytics data', error);
        }
        throw error;
    }
}));

// Export data (admin only)
router.get('/export/:type', auth(), errorHandler.asyncHandler(async (req, res) => {
    const { type } = req.params;
    const { 
        startDate: startParam, 
        endDate: endParam,
        format = 'json',
        fields,
        includeMetadata = true
    } = req.query;

    // Validate export type
    const validTypes = ['chats', 'tickets', 'users', 'faqs'];
    if (!validTypes.includes(type)) {
        throw new errorHandler.ValidationError(
            `Invalid export type. Must be one of: ${validTypes.join(', ')}`
        );
    }

    // Validate and parse dates
    const now = new Date();
    const endDate = endParam ? new Date(endParam) : now;
    const startDate = startParam ? new Date(startParam) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new errorHandler.ValidationError('Invalid date format');
    }

    if (startDate > endDate) {
        throw new errorHandler.ValidationError('Start date must be before end date');
    }

    if (endDate > now) {
        throw new errorHandler.ValidationError('End date cannot be in the future');
    }

    // Validate format
    const validFormats = ['json', 'csv'];
    if (!validFormats.includes(format)) {
        throw new errorHandler.ValidationError(
            `Invalid format. Must be one of: ${validFormats.join(', ')}`
        );
    }

    // Initialize query config
    const queryConfig = {
        chats: {
            model: Chat,
            filename: 'chats_export',
            timeField: 'createdAt',
            populate: [
                { path: 'userId', select: 'sessionId location' }
            ],
            allowedFields: ['sessionId', 'conversationId', 'status', 'duration', 'createdAt', 'satisfaction'],
            exportTransform: (chat) => ({
                sessionId: chat.sessionId,
                conversationId: chat.conversationId,
                status: chat.status,
                duration: chat.duration || 0,
                messageCount: chat.messages?.length || 0,
                satisfaction: chat.satisfaction?.rating || null,
                createdAt: chat.createdAt
            })
        },
        tickets: {
            model: Ticket,
            filename: 'tickets_export',
            timeField: 'createdAt',
            populate: [
                { path: 'userId', select: 'sessionId location' }
            ],
            allowedFields: ['ticketId', 'status', 'priority', 'createdAt', 'name', 'email'],
            exportTransform: (ticket) => ({
                ticketId: ticket.ticketId,
                status: ticket.status,
                priority: ticket.priority,
                name: ticket.name,
                email: ticket.email,
                createdAt: ticket.createdAt,
                resolvedAt: ticket.resolvedAt
            })
        },
        users: {
            model: User,
            filename: 'users_export',
            timeField: 'createdAt',
            allowedFields: ['sessionId', 'location', 'totalChats', 'totalTickets', 'createdAt', 'lastActivity'],
            exportTransform: (user) => ({
                sessionId: user.sessionId,
                location: user.location,
                totalChats: user.totalChats || 0,
                totalTickets: user.totalTickets || 0,
                createdAt: user.createdAt,
                lastActivity: user.lastActivity
            })
        },
        faqs: {
            model: FAQ,
            filename: 'faqs_export',
            query: { isActive: true },
            allowedFields: ['question', 'answer', 'category', 'tags', 'priority', 'isActive', 'usage', 'createdAt', 'updatedAt'],
            exportTransform: (faq) => ({
                question: faq.question,
                answer: faq.answer,
                category: faq.category,
                tags: faq.tags,
                priority: faq.priority,
                isActive: faq.isActive,
                hitCount: faq.usage?.hitCount || 0,
                averageRating: faq.usage?.averageRating || null,
                createdAt: faq.createdAt,
                updatedAt: faq.updatedAt
            })
        }
    };

    const config = queryConfig[type];

    // Build query
    const query = {
        ...(config.query || {}),
        ...(config.timeField ? { [config.timeField]: { $gte: startDate, $lte: endDate } } : {})
    };

    // Validate and filter fields if specified
    let selectedFields = undefined;
    if (fields) {
        const requestedFields = fields.split(',').map(f => f.trim());
        const invalidFields = requestedFields.filter(f => !config.allowedFields.includes(f));
        if (invalidFields.length > 0) {
            throw new errorHandler.ValidationError(
                `Invalid fields: ${invalidFields.join(', ')}. Allowed fields: ${config.allowedFields.join(', ')}`
            );
        }
        selectedFields = requestedFields.join(' ');
    }

    try {
        // Fetch data with proper error handling
        const data = await config.model.find(query)
            .select(selectedFields)
            .populate(config.populate || [])
            .sort({ [config.timeField || 'createdAt']: -1 })
            .lean();

        if (data.length === 0) {
            if (format === 'csv') {
                // Return empty CSV with headers for CSV format
                const schema = getCSVSchema(type);
                const csv = schema.headers.join(',') + '\n';
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=${config.filename}_${new Date().toISOString()}.csv`);
                return res.send(csv);
            } else {
                // Return empty JSON for JSON format
                return res.json({
                    success: true,
                    message: 'No data found for the specified criteria',
                    data: [],
                    count: 0
                });
            }
        }

        // Transform data for export
        const transformedData = data.map(config.exportTransform);

        // Prepare metadata
        const metadata = includeMetadata ? {
            type,
            dateRange: { startDate, endDate },
            count: transformedData.length,
            fields: selectedFields ? selectedFields.split(' ') : config.allowedFields,
            exportedAt: new Date().toISOString()
        } : undefined;

        if (format === 'csv' && ['chats', 'tickets', 'users'].includes(type)) {
            const csv = convertToCSV(transformedData, type);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${config.filename}_${new Date().toISOString()}.csv`);
            return res.send(csv);
        }

        // JSON export
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${config.filename}_${new Date().toISOString()}.json`);
        res.json({
            success: true,
            ...(metadata ? { exportInfo: metadata } : {}),
            data: transformedData
        });
    } catch (error) {
        if (error.name === 'MongoServerError') {
            throw new errorHandler.DatabaseError('Failed to export data', error);
        }
        throw error;
    }
}));

// Get system info (admin only)
router.get('/system', auth(), async (req, res) => {
    try {
        const systemInfo = {
            server: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                environment: process.env.NODE_ENV || 'development'
            },
            database: {
                connected: true, // This would be checked from mongoose connection
                collections: {
                    users: await User.countDocuments(),
                    chats: await Chat.countDocuments(),
                    tickets: await Ticket.countDocuments(),
                    faqs: await FAQ.countDocuments()
                }
            },
            api: {
                version: '1.0.0',
                startTime: new Date().toISOString(), // This should be set at server start
                health: 'OK'
            }
        };

        res.json({
            success: true,
            data: systemInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve system information'
        });
    }
});

// Admin Management Routes
// Get list of all admins (admin only)
router.get('/list', auth(), roleValidation.canManageAdmins, errorHandler.asyncHandler(async (req, res) => {
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin.canManageAdmins()) {
        throw new errorHandler.ForbiddenError('You do not have permission to view admin list');
    }

    const admins = await Admin.find({})
        .select('-password')
        .sort({ createdAt: -1 })
        .lean();

    res.json({
        success: true,
        data: { admins }
    });
}));

// Check username availability (authenticated admins) - does NOT require canManageAdmins
router.get('/check-username', auth(), errorHandler.asyncHandler(async (req, res) => {
    const username = (req.query.username || '').toString().trim().toLowerCase();
    const excludeId = req.query.excludeId;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const query = { username };
    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const existing = await Admin.findOne(query).lean();
    res.json({ success: true, data: { available: !existing } });
}));

// Get specific admin details (admin only)
router.get('/:id', auth(), errorHandler.asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.params.id)
        .select('-password')
        .lean();

    if (!admin) {
        throw new errorHandler.NotFoundError('Admin not found');
    }

    res.json({
        success: true,
        data: { admin }
    });
}));

// Create new admin (admin only)
router.post('/', auth(), roleValidation.canManageAdmins, adminValidation.create, errorHandler.asyncHandler(async (req, res) => {
    const { name, username, email, role = 'admin', permissions = [], isSuperAdmin = false } = req.body;
        // Process permissions - handle both array and object formats
        let processedPermissions = permissions;
        if (Array.isArray(permissions)) {
            processedPermissions = permissions;
        } else if (typeof permissions === 'object' && permissions !== null) {
            processedPermissions = Object.keys(permissions).filter(key => 
                permissions[key] === 'on' || permissions[key] === true || permissions[key] === 'true'
            );
        }
        // Generate a secure random password for the new admin
        function generateRandomPassword(length = 12) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$!%*?&';
            let pwd = '';
            for (let i = 0; i < length; i++) {
                pwd += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return pwd;
        }
        const password = generateRandomPassword();

    // Check if current user can manage admins
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin.canManageAdmins()) {
        throw new errorHandler.ForbiddenError('You do not have permission to create admins');
    }

    // Check if username is already in use (required field)
    const existingAdminWithUsername = await Admin.findOne({ username: username.toLowerCase() });
    if (existingAdminWithUsername) {
        throw new errorHandler.ConflictError('An admin with this username already exists');
    }
    
    // Check if email is already in use (only if email is provided)
    if (email && email.trim()) {
        const existingAdminWithEmail = await Admin.findOne({ email: email.toLowerCase() });
        if (existingAdminWithEmail) {
            throw new errorHandler.ConflictError('An admin with this email already exists');
        }
    }

    // Determine final role and permissions
    const finalRole = isSuperAdmin ? 'super_admin' : role;
    
    // Convert checkbox values to boolean helper function
    const convertCheckboxToBoolean = (value) => {
        if (typeof value === 'string') {
            return value === 'on' || value === 'true' || value === '1';
        }
        return Boolean(value);
    };

    // Build permissions object with proper inheritance and security checks
    const permissionsObj = {
        // Core permissions (always enabled for all admins)
        canViewDashboard: true,
        
        // Feature access permissions
        canViewChats: isSuperAdmin || (processedPermissions.includes('canViewChats') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canViewChats)),
        canViewTickets: isSuperAdmin || (processedPermissions.includes('canViewTickets') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canViewTickets)),
        canViewFAQs: isSuperAdmin || (processedPermissions.includes('canViewFAQs') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canViewFAQs)),
        canViewAnalytics: isSuperAdmin || (processedPermissions.includes('canViewAnalytics') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canViewAnalytics)),
        
        // Management permissions
        canManageUsers: isSuperAdmin || (processedPermissions.includes('canManageUsers') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canManageUsers)),
        canManageTickets: isSuperAdmin || (processedPermissions.includes('canManageTickets') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canManageTickets)),
        canManageFAQs: isSuperAdmin || (processedPermissions.includes('canManageFAQs') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canManageFAQs)),
        canExportData: isSuperAdmin || (processedPermissions.includes('canExportData') && (currentAdmin.isSuperAdmin() || currentAdmin.permissions.canExportData)),
        
        // Special permissions (only for super admins)
        canManageAdmins: isSuperAdmin,
    };

    // Convert any remaining checkbox values in the permissions object
    Object.keys(permissionsObj).forEach(key => {
        if (permissionsObj[key] !== undefined) {
            permissionsObj[key] = convertCheckboxToBoolean(permissionsObj[key]);
        }
    });

    // Ensure non-super admins can't grant permissions they don't have
    if (!currentAdmin.isSuperAdmin()) {
        Object.entries(permissionsObj).forEach(([key, value]) => {
            if (value && !currentAdmin.permissions[key]) {
                throw new errorHandler.ForbiddenError(`Cannot grant permission '${key}' that you don't have`);
            }
        });
    }

    // Create new admin (password will be hashed by pre-save hook)
    const adminData = {
        name,
        username: username.toLowerCase(),
        password,
        role: finalRole,
        permissions: permissionsObj
    };
    if (email && email.trim()) {
        adminData.email = email.toLowerCase();
    }
    const newAdmin = new Admin(adminData);
    try {
        await newAdmin.save();
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            throw new errorHandler.ConflictError(`An admin with this ${field} already exists`);
        }
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            throw new errorHandler.ValidationError(messages.join(', '));
        }
        throw err;
    }
    // Send credentials email if email is provided
    if (email && email.trim()) {
        const { sendAdminCredentials } = require('../utils/emailService');
        try {
            await sendAdminCredentials({
                to: email,
                name,
                username,
                password
            });
        } catch (e) {
            // Log but do not block admin creation
            console.error('Failed to send admin credentials email:', e.message);
        }
    }
    // Return admin without password
    const adminResponse = newAdmin.toObject();
    delete adminResponse.password;
    res.status(201).json({
        success: true,
        message: 'Admin created successfully',
        data: { admin: adminResponse }
    });
}));

// Update admin (admin only)
router.put('/:id', auth(), adminValidation.update, errorHandler.asyncHandler(async (req, res) => {
    const { name, username, email, password, role, isSuperAdmin, permissions } = req.body;
    const adminId = req.params.id;

    // Get current (acting) admin and target admin
    const [currentAdmin, targetAdmin] = await Promise.all([
        Admin.findById(req.user.id),
        Admin.findById(adminId)
    ]);

    if (!targetAdmin) {
        throw new errorHandler.NotFoundError('Admin not found');
    }

    const isSelf = String(adminId) === String(req.user.id);

    // If editing someone else, require manage-admins permission
    if (!isSelf && !currentAdmin.canManageAdmins()) {
        throw new errorHandler.ForbiddenError('You do not have permission to manage admins');
    }

    // Prevent super admin modification by non-super admins (except when editing self)
    if (!isSelf && targetAdmin.role === 'super_admin' && !currentAdmin.isSuperAdmin()) {
        throw new errorHandler.ForbiddenError('Only super admins can modify other super admins');
    }

    // Prevent self-promotion to super admin
    if (isSelf && (isSuperAdmin || role === 'super_admin')) {
        throw new errorHandler.ForbiddenError('Cannot promote yourself to super admin');
    }

    // Start building update object
    const updates = {};

    // Validate and prepare name update
    if (name) {
        updates.name = name;
    }

    // Handle email update with duplicate check
    if (email) {
        const existingAdmin = await Admin.findOne({ email: email.toLowerCase(), _id: { $ne: adminId } });
        if (existingAdmin) {
            throw new errorHandler.ConflictError('Email already taken by another admin');
        }
        updates.email = email.toLowerCase();
    }

    // Handle username update with duplicate check
    if (username) {
        const existingByUsername = await Admin.findOne({ username: username, _id: { $ne: adminId } });
        if (existingByUsername) {
            throw new errorHandler.ConflictError('Username already taken by another admin');
        }
        updates.username = username;
    }

    // Handle role update (super admin only)
    if (role && role !== targetAdmin.role) {
        if (!currentAdmin.isSuperAdmin()) {
            throw new errorHandler.ForbiddenError('Only super admins can change admin roles');
        }
        updates.role = role;
    }

    // Handle password update with validation and hashing
    if (password) {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            throw new errorHandler.ValidationError('Password must be at least 8 characters long and include uppercase, lowercase, number and special character');
        }
        updates.password = await bcrypt.hash(password, 12);
    }

    // Handle permissions update with proper inheritance and security checks
    if (permissions) {
        const updatedPermissions = { ...targetAdmin.permissions };
        
        // Convert checkbox values to boolean helper function
        const convertCheckboxToBoolean = (value) => {
            if (typeof value === 'string') {
                return value === 'on' || value === 'true' || value === '1';
            }
            return Boolean(value);
        };

        // Handle both array and object permission formats
        if (Array.isArray(permissions)) {
            // Frontend sends array of permission names - reset all permissions first
            const allPermissions = ['canViewDashboard', 'canViewChats', 'canViewTickets', 'canViewFAQs', 'canViewAnalytics', 'canManageUsers', 'canManageTickets', 'canManageFAQs', 'canExportData', 'canManageAdmins'];
            allPermissions.forEach(perm => {
                updatedPermissions[perm] = permissions.includes(perm);
            });
        } else if (typeof permissions === 'object' && permissions !== null) {
            // Handle object format (from form data)
            if (currentAdmin.isSuperAdmin()) {
                // Super admins can update all permissions except core ones
                Object.entries(permissions).forEach(([key, value]) => {
                    if (key === 'canViewDashboard') return; // Cannot modify core permission
                    updatedPermissions[key] = convertCheckboxToBoolean(value);
                });
            } else {
                // Non-super admins can only grant permissions they have
                Object.entries(permissions).forEach(([key, value]) => {
                    if (key === 'canViewDashboard' || key === 'canManageAdmins') return; // Cannot modify core/restricted permissions
                    const booleanValue = convertCheckboxToBoolean(value);
                    if (booleanValue && !currentAdmin.permissions[key]) {
                        throw new errorHandler.ForbiddenError(`Cannot grant permission '${key}' that you don't have`);
                    }
                    updatedPermissions[key] = booleanValue;
                });
            }
        }

        // Ensure core permissions remain unchanged
        updatedPermissions.canViewDashboard = true;
        if (!currentAdmin.isSuperAdmin()) {
            updatedPermissions.canManageAdmins = targetAdmin.permissions.canManageAdmins;
        }

        updates.permissions = updatedPermissions;
    }

    try {
        // Apply updates with validation
        const updatedAdmin = await Admin.findByIdAndUpdate(
            adminId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedAdmin) {
            throw new errorHandler.NotFoundError('Admin not found');
        }

        res.json({
            success: true,
            message: 'Admin updated successfully',
            data: { admin: updatedAdmin }
        });
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            throw new errorHandler.ValidationError(messages.join(', '));
        }
        throw err;
    }
}));

// Delete admin (admin only)
router.delete('/:id', auth(), roleValidation.canManageAdmins, errorHandler.asyncHandler(async (req, res) => {
    const adminId = req.params.id;

    // Check if admin exists
    const adminToDelete = await Admin.findById(adminId);
    if (!adminToDelete) {
        throw new errorHandler.NotFoundError('Admin not found');
    }

    // Prevent deleting the current admin
    if (adminId === req.user.id) {
        throw new errorHandler.ValidationError('Cannot delete your own account');
    }

    // Verify current admin's permissions
    const currentAdmin = await Admin.findById(req.user.id);
    if (adminToDelete.role === 'super_admin' && !currentAdmin.isSuperAdmin()) {
        throw new errorHandler.ForbiddenError('Only super admins can delete other super admins');
    }

    // Check if attempting to delete last super admin
    if (adminToDelete.role === 'super_admin') {
        const superAdminCount = await Admin.countDocuments({ role: 'super_admin' });
        if (superAdminCount === 1) {
            throw new errorHandler.ValidationError('Cannot delete the last super admin');
        }
    }

    // Perform deletion with transaction to ensure atomicity
    const session = await Admin.startSession();
    try {
        await session.withTransaction(async () => {
            const result = await Admin.deleteOne({ _id: adminId }, { session });
            if (result.deletedCount === 0) {
                throw new errorHandler.NotFoundError('Admin not found or already deleted');
            }

            // Additional cleanup if needed (e.g., removing references, etc.)
            await Promise.all([
                // Add any necessary cleanup operations here
            ]);
        });

        res.json({
            success: true,
            message: 'Admin deleted successfully',
            data: { deletedId: adminId }
        });
    } finally {
        session.endSession();
    }
}));

// Toggle admin status (enable/disable) - admin only
router.patch('/:id/toggle', auth(), roleValidation.canManageAdmins, errorHandler.asyncHandler(async (req, res) => {
    const adminId = req.params.id;
    
    // Prevent toggling your own account
    if (adminId === req.user.id) {
        throw new errorHandler.ValidationError('Cannot disable your own account');
    }
    
    // Get target admin
    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
        throw new errorHandler.NotFoundError('Admin not found');
    }
    
    // Prevent disabling super admins by non-super admins
    const currentAdmin = await Admin.findById(req.user.id);
    if (targetAdmin.role === 'super_admin' && !currentAdmin.isSuperAdmin()) {
        throw new errorHandler.ForbiddenError('Only super admins can disable other super admins');
    }
    
    // Check if trying to disable the last super admin
    if (targetAdmin.role === 'super_admin' && targetAdmin.isActive !== false) {
        const activeSuperAdminCount = await Admin.countDocuments({ 
            role: 'super_admin', 
            isActive: { $ne: false } 
        });
        if (activeSuperAdminCount === 1) {
            throw new errorHandler.ValidationError('Cannot disable the last active super admin');
        }
    }
    
    // Toggle the admin status
    const newStatus = targetAdmin.isActive === false ? true : false;
    const updatedAdmin = await Admin.findByIdAndUpdate(
        adminId,
        { isActive: newStatus },
        { new: true }
    ).select('-password');
    
    res.json({
        success: true,
        message: `Admin ${newStatus ? 'enabled' : 'disabled'} successfully`,
        data: { 
            admin: updatedAdmin,
            newStatus 
        }
    });
}));

// Update admin permissions - admin only
router.put('/:id/permissions', auth(), roleValidation.canManageAdmins, errorHandler.asyncHandler(async (req, res) => {
    const adminId = req.params.id;
    const { permissions } = req.body;
    
    if (!Array.isArray(permissions)) {
        throw new errorHandler.ValidationError('Permissions must be an array');
    }
    
    // Get target admin
    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
        throw new errorHandler.NotFoundError('Admin not found');
    }
    
    // Get current admin
    const currentAdmin = await Admin.findById(req.user.id);
    
    // Prevent modifying super admin permissions by non-super admins
    if (targetAdmin.role === 'super_admin' && !currentAdmin.isSuperAdmin()) {
        throw new errorHandler.ForbiddenError('Only super admins can modify super admin permissions');
    }
    
    // Build permissions object
    const allPermissions = [
        'canViewDashboard', 'canViewChats', 'canViewTickets', 'canViewFAQs', 
        'canViewAnalytics', 'canManageUsers', 'canManageTickets', 'canManageFAQs', 
        'canExportData', 'canManageAdmins'
    ];
    
    const updatedPermissions = {};
    allPermissions.forEach(perm => {
        updatedPermissions[perm] = permissions.includes(perm);
    });
    
    // Ensure core permissions remain unchanged
    updatedPermissions.canViewDashboard = true;
    
    // Ensure non-super admins can't grant permissions they don't have
    if (!currentAdmin.isSuperAdmin()) {
        Object.entries(updatedPermissions).forEach(([key, value]) => {
            if (value && !currentAdmin.permissions[key]) {
                throw new errorHandler.ForbiddenError(`Cannot grant permission '${key}' that you don't have`);
            }
        });
    }
    
    // Update admin permissions
    const updatedAdmin = await Admin.findByIdAndUpdate(
        adminId,
        { permissions: updatedPermissions },
        { new: true }
    ).select('-password');
    
    res.json({
        success: true,
        message: 'Permissions updated successfully',
        data: { admin: updatedAdmin }
    });
}));

module.exports = router;