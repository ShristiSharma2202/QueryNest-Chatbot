const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
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
    name: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    message: { type: String, required: true },
    status: {
        type: String,
        enum: ['new', 'in_progress', 'closed'],
        default: 'new'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    origin: {
        type: String,
        enum: ['chatbot', 'email', 'web', 'admin'],
        default: 'chatbot'
    },
    relatedConversationId: String,
    tags: [String],
    assignedTo: String,
    isArchived: { type: Boolean, default: false },
    isImportant: { type: Boolean, default: false },
    activity: [{
        timestamp: { type: Date, default: Date.now },
        action: String,
        by: String,
        notes: String
    }]
}, {
    timestamps: true
});

// Indexes for performance
ticketSchema.index({ status: 1, createdAt: -1 });

// Methods to update ticket status
ticketSchema.methods.addActivity = function(action, by = 'system', notes = '') {
    this.activity.push({ action, by, notes, timestamp: new Date() });
};

module.exports = mongoose.model('Ticket', ticketSchema);