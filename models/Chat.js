const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['user', 'bot'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    metadata: {
        faqId: mongoose.Schema.Types.ObjectId,
        confidence: Number,
        processed: {
            type: Boolean,
            default: true
        },
        responseTime: Number // in milliseconds
    }
});

const chatSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    conversationId: {
        type: String,
        required: true,
        index: true
    },
    messages: [messageSchema],
    status: {
        type: String,
        enum: ['active', 'ended', 'archived'],
        default: 'active'
    },
    endedReason: {
        type: String,
        enum: ['user', 'inactivity', 'admin', 'system', null],
        default: null
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    endedAt: {
        type: Date
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    satisfaction: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        feedback: String,
        timestamp: Date
    },
    analytics: {
        totalMessages: {
            type: Number,
            default: 0
        },
        userMessages: {
            type: Number,
            default: 0
        },
        botMessages: {
            type: Number,
            default: 0
        },
        averageResponseTime: {
            type: Number,
            default: 0
        },
        resolvedIssues: {
            type: Number,
            default: 0
        },
        escalatedToTicket: {
            type: Boolean,
            default: false
        },
        isImportant: {
            type: Boolean,
            default: false
        }
    },
    tags: [String],
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for message count
chatSchema.virtual('messageCount').get(function() {
    return this.messages ? this.messages.length : 0;
});

// Virtual for last message
chatSchema.virtual('lastMessage').get(function() {
    return this.messages && this.messages.length > 0 
        ? this.messages[this.messages.length - 1] 
        : null;
});

// Indexes for better performance
chatSchema.index({ sessionId: 1, createdAt: -1 });
chatSchema.index({ status: 1, createdAt: -1 });
chatSchema.index({ 'satisfaction.rating': 1 });
chatSchema.index({ tags: 1 });

// Pre-save middleware to update analytics
chatSchema.pre('save', function(next) {
    if (this.isModified('messages')) {
        this.analytics.totalMessages = this.messages.length;
        this.analytics.userMessages = this.messages.filter(m => m.type === 'user').length;
        this.analytics.botMessages = this.messages.filter(m => m.type === 'bot').length;
        
        // Calculate average response time
        const responseTimes = this.messages
            .filter(m => m.metadata && m.metadata.responseTime)
            .map(m => m.metadata.responseTime);
        
        if (responseTimes.length > 0) {
            this.analytics.averageResponseTime = 
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }
    }
    
    // Update duration if conversation is ended
    if (this.status === 'ended' && !this.endedAt) {
        this.endedAt = new Date();
        this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
    }
    
    next();
});

// Instance method to add message
chatSchema.methods.addMessage = function(type, content, metadata = {}) {
    const message = {
        type,
        content,
        timestamp: new Date(),
        metadata
    };
    
    this.messages.push(message);
    return message;
};

// Instance method to end conversation
// Accepts optional reason: 'user', 'inactivity', 'admin', 'system', etc.
chatSchema.methods.endConversation = function(reason = 'user') {
    this.status = 'ended';
    this.endedAt = new Date();
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
    this.endedReason = reason;
    return this.save();
};

// Instance method to add satisfaction rating
chatSchema.methods.addSatisfactionRating = function(rating, feedback = '') {
    this.satisfaction = {
        rating,
        feedback,
        timestamp: new Date()
    };
    return this.save();
};

// Static method to get conversation analytics
chatSchema.statics.getAnalytics = async function(timeRange = 'week') {
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
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
    
    const analytics = await this.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalConversations: { $sum: 1 },
                totalMessages: { $sum: '$analytics.totalMessages' },
                averageMessagesPerChat: { $avg: '$analytics.totalMessages' },
                averageResponseTime: { $avg: '$analytics.averageResponseTime' },
                averageDuration: { $avg: '$duration' },
                satisfactionRatings: {
                    $push: {
                        $cond: [
                            { $ifNull: ['$satisfaction.rating', false] },
                            '$satisfaction.rating',
                            null
                        ]
                    }
                },
                ticketEscalations: {
                    $sum: {
                        $cond: ['$analytics.escalatedToTicket', 1, 0]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                totalConversations: 1,
                totalMessages: 1,
                averageMessagesPerChat: { $round: ['$averageMessagesPerChat', 2] },
                averageResponseTime: { $round: ['$averageResponseTime', 0] },
                averageDuration: { $round: ['$averageDuration', 0] },
                averageSatisfaction: {
                    $round: [{
                        $avg: {
                            $filter: {
                                input: '$satisfactionRatings',
                                cond: { $ne: ['$$this', null] }
                            }
                        }
                    }, 2]
                },
                ticketEscalations: 1,
                escalationRate: {
                    $round: [{
                        $multiply: [
                            { $divide: ['$ticketEscalations', '$totalConversations'] },
                            100
                        ]
                    }, 2]
                }
            }
        }
    ]);
    
    return analytics[0] || {};
};

module.exports = mongoose.model('Chat', chatSchema);