/**
 * Utility functions for converting data to CSV format
 */

/**
 * Convert a value to a CSV-safe string
 * @param {*} value The value to convert
 * @returns {string} CSV-safe string
 */
function sanitizeForCSV(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'object') {
        if (value instanceof Date) {
            return value.toISOString();
        }
        return JSON.stringify(value).replace(/"/g, '""');
    }

    value = String(value);
    
    // Escape quotes and wrap in quotes if needed
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
}

/**
 * Generate CSV schema based on data type
 * @param {string} type Export type
 * @returns {Object} CSV schema configuration
 */
function getCSVSchema(type) {
    const schemas = {
        chats: {
            headers: [
                'Session ID',
                'Conversation ID',
                'Status',
                'Duration (s)',
                'Messages',
                'Satisfaction',
                'Started At',
                'Ended At',
                'Location',
                'Browser',
                'Device'
            ],
            getRow: (chat) => [
                chat.sessionId,
                chat.conversationId,
                chat.status,
                chat.duration || 0,
                chat.messageCount || 0,
                chat.satisfaction || '',
                chat.createdAt,
                chat.endedAt || '',
                chat.location ? `${chat.location.city || ''}, ${chat.location.country || ''}` : '',
                chat.userAgent?.browser || '',
                chat.userAgent?.device || ''
            ]
        },
        tickets: {
            headers: [
                'Ticket ID',
                'Status',
                'Priority',
                'Name',
                'Email',
                'Created At',
                'Updated At',
                'Resolution Time (hrs)',
                'Category',
                'Source'
            ],
            getRow: (ticket) => [
                ticket.ticketId,
                ticket.status,
                ticket.priority,
                ticket.name,
                ticket.email,
                ticket.createdAt,
                ticket.updatedAt || '',
                ticket.resolutionTime || '',
                ticket.category || '',
                ticket.source || ''
            ]
        },
        users: {
            headers: [
                'Session ID',
                'Total Chats',
                'Total Tickets',
                'Location',
                'Created At',
                'Last Activity',
                'Browser',
                'Device',
                'Satisfaction Average'
            ],
            getRow: (user) => [
                user.sessionId,
                user.totalChats || 0,
                user.totalTickets || 0,
                user.location ? `${user.location.city || ''}, ${user.location.country || ''}` : '',
                user.createdAt,
                user.lastActivity || '',
                user.userAgent?.browser || '',
                user.userAgent?.device || '',
                user.satisfactionAverage || ''
            ]
        },
        faqs: {
            headers: [
                'Question',
                'Answer',
                'Category',
                'Tags',
                'Priority',
                'Hit Count',
                'Average Rating',
                'Created At',
                'Updated At',
                'Is Active'
            ],
            getRow: (faq) => [
                faq.question || '',
                faq.answer || '',
                faq.category || '',
                Array.isArray(faq.tags) ? faq.tags.join('; ') : (faq.tags || ''),
                faq.priority || '',
                faq.usage?.hitCount || faq.hitCount || 0,
                faq.usage?.averageRating || faq.averageRating || '',
                faq.createdAt || '',
                faq.updatedAt || '',
                faq.isActive ? 'Yes' : 'No'
            ]
        }
    };

    return schemas[type] || {
        headers: [],
        getRow: () => []
    };
}

/**
 * Convert data array to CSV string
 * @param {Array} data Array of objects to convert
 * @param {string} type Export type for schema selection
 * @returns {string} CSV formatted string
 */
function convertToCSV(data, type) {
    if (!Array.isArray(data) || data.length === 0) {
        return '';
    }

    const schema = getCSVSchema(type);
    
    // Start with headers
    const lines = [schema.headers.join(',')];

    // Add data rows
    data.forEach(item => {
        const row = schema.getRow(item);
        lines.push(row.map(sanitizeForCSV).join(','));
    });

    return lines.join('\n');
}

/**
 * Validate CSV data before conversion
 * @param {Array} data Data to validate
 * @param {string} type Export type
 * @returns {Object} Validation result
 */
function validateCSVData(data, type) {
    if (!Array.isArray(data)) {
        return {
            valid: false,
            error: 'Data must be an array'
        };
    }

    if (data.length === 0) {
        return {
            valid: false,
            error: 'No data to export'
        };
    }

    const schema = getCSVSchema(type);
    if (!schema.headers.length) {
        return {
            valid: false,
            error: `Unsupported export type: ${type}`
        };
    }

    return { valid: true };
}

module.exports = {
    convertToCSV,
    validateCSVData,
    getCSVSchema,
    sanitizeForCSV
};