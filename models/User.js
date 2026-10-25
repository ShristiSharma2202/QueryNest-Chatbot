const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        default: ''
    },
    location: {
        country: String,
        city: String,
        region: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    totalChats: {
        type: Number,
        default: 0
    },
    totalTickets: {
        type: Number,
        default: 0
    },
    metadata: {
        referrer: String,
        page: String,
        device: String,
        browser: String
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for user's chat history
userSchema.virtual('chats', {
    ref: 'Chat',
    localField: 'sessionId',
    foreignField: 'sessionId'
});

// Virtual for user's tickets
userSchema.virtual('tickets', {
    ref: 'Ticket',
    localField: 'sessionId',
    foreignField: 'sessionId'
});

// Index for performance
userSchema.index({ createdAt: 1 });
userSchema.index({ isActive: 1, lastActivity: -1 });

// Update last activity before saving
userSchema.pre('save', function(next) {
    this.lastActivity = new Date();
    next();
});

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

// Static method to find or create user session
userSchema.statics.findOrCreateSession = async function(sessionData) {
    let user = await this.findOne({ sessionId: sessionData.sessionId });
    
    if (!user) {
        // Parse browser and location for new users
        const browser = parseUserAgent(sessionData.userAgent);
        const country = getCountryFromIP(sessionData.ipAddress);
        
        const userData = {
            ...sessionData,
            metadata: {
                ...sessionData.metadata,
                browser: browser
            },
            location: {
                country: country
            }
        };
        
        user = new this(userData);
        await user.save();
    } else {
        // Update last activity and metadata
        user.lastActivity = new Date();
        user.ipAddress = sessionData.ipAddress;
        if (sessionData.userAgent) {
            user.userAgent = sessionData.userAgent;
            // Update browser info
            user.metadata = {
                ...user.metadata,
                browser: parseUserAgent(sessionData.userAgent)
            };
        }
        if (sessionData.metadata) user.metadata = { ...user.metadata, ...sessionData.metadata };
        await user.save();
    }
    
    return user;
};

// Instance method to update activity
userSchema.methods.updateActivity = async function() {
    this.lastActivity = new Date();
    this.isActive = true;
    return await this.save();
};

module.exports = mongoose.model('User', userSchema);