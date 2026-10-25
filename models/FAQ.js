const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
        index: true
    },
    answer: {
        type: String,
        required: true
    },
    patterns: [{
        type: String,
        required: true
    }],
    category: {
        type: String,
        default: 'general'
    },
    tags: [String],
    isActive: {
        type: Boolean,
        default: true
    },
    priority: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
    },
    usage: {
        hitCount: {
            type: Number,
            default: 0
        },
        lastUsed: Date,
        averageRating: {
            type: Number,
            default: null,
            min: 0,
            max: 5
        },
        ratings: [{
            rating: { type: Number, min: 1, max: 5 },
            sessionId: String,
            timestamp: { type: Date, default: Date.now }
        }]
    },
    createdBy: {
        type: String,
        default: 'system'
    },
    updatedBy: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for normalized patterns (for search)
faqSchema.virtual('normalizedPatterns').get(function() {
    return this.patterns.map(p => p.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim());
});

// Indexes for performance
faqSchema.index({ category: 1, isActive: 1 });
faqSchema.index({ tags: 1, isActive: 1 });
faqSchema.index({ 'usage.hitCount': -1 });
faqSchema.index({ patterns: 'text', question: 'text', answer: 'text' });

// Pre-save middleware to calculate average rating
faqSchema.pre('save', function(next) {
    if (this.usage.ratings && this.usage.ratings.length > 0) {
        const totalRating = this.usage.ratings.reduce((sum, r) => sum + r.rating, 0);
        this.usage.averageRating = totalRating / this.usage.ratings.length;
    } else {
        this.usage.averageRating = null; // Set to null when no ratings exist
    }
    next();
});

// Instance method to record usage
faqSchema.methods.recordUsage = function(sessionId = null) {
    this.usage.hitCount += 1;
    this.usage.lastUsed = new Date();
    return this.save();
};

// Instance method to add rating
faqSchema.methods.addRating = function(rating, sessionId = null) {
    this.usage.ratings.push({
        rating,
        sessionId,
        timestamp: new Date()
    });
    
    // Keep only last 100 ratings to prevent document bloat
    if (this.usage.ratings.length > 100) {
        this.usage.ratings = this.usage.ratings.slice(-100);
    }
    
    return this.save();
};

// Static method to search FAQs
faqSchema.statics.search = function(query, options = {}) {
    const {
        category = null,
        limit = 10,
        onlyActive = true
    } = options;
    
    const pipeline = [];
    
    // Match stage
    const matchStage = {};
    if (onlyActive) matchStage.isActive = true;
    if (category) matchStage.category = category;
    
    pipeline.push({ $match: matchStage });
    
    // Text search if query provided
    if (query && query.trim()) {
        pipeline.unshift({
            $match: {
                $text: { $search: query }
            }
        });
        
        pipeline.push({
            $addFields: {
                score: { $meta: 'textScore' }
            }
        });
        
        pipeline.push({
            $sort: { score: { $meta: 'textScore' }, priority: -1, 'usage.hitCount': -1 }
        });
    } else {
        pipeline.push({
            $sort: { priority: -1, 'usage.hitCount': -1, updatedAt: -1 }
        });
    }
    
    if (limit > 0) {
        pipeline.push({ $limit: limit });
    }
    
    return this.aggregate(pipeline);
};

// Static method to get popular FAQs
faqSchema.statics.getPopular = function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ 'usage.hitCount': -1, 'usage.averageRating': -1 })
        .limit(limit);
};

// Static method to get FAQs by category
faqSchema.statics.getByCategory = function(category, limit = 0) {
    const query = this.find({ category, isActive: true })
        .sort({ priority: -1, 'usage.hitCount': -1 });
    
    return limit > 0 ? query.limit(limit) : query;
};

module.exports = mongoose.model('FAQ', faqSchema);