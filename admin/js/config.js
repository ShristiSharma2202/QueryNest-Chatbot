/**
 * Configuration Module
 * Global constants, API URLs, and app state
 */

// API Configuration
export const API_BASE_URL = window.location.origin;

// Application State
export const AppState = {
    currentSection: 'dashboard',
    refreshInterval: null,
    showingArchives: false,
    showingTicketArchives: false,
    authToken: localStorage.getItem('admin_token'),
    currentAdmin: null,
    currentPermissions: null
};

// Ticket Status Lifecycle
export const TICKET_STATUS_LIFECYCLE = {
    'new': 'in_progress',
    'in_progress': 'closed'
};

// Status Labels
export const STATUS_LABELS = {
    'new': 'New',
    'in_progress': 'In Progress',
    'closed': 'Closed',
    'active': 'Active',
    'ended': 'Ended',
    'archived': 'Archived'
};

// Priority Levels
export const PRIORITY_LEVELS = ['low', 'medium', 'high'];

export const PRIORITY_NAMES = {
    'low': 'Low',
    'medium': 'Medium',
    'high': 'High'
};

// Permission Mappings
export const PERMISSION_MAP = {
    dashboard: 'canViewDashboard',
    chats: 'canViewChats',
    tickets: 'canViewTickets',
    faqs: 'canViewFAQs',
    account: 'canViewDashboard' // Account is always accessible
};

// Available Permissions
export const AVAILABLE_PERMISSIONS = [
    'canViewDashboard',
    'canViewChats',
    'canViewTickets',
    'canViewFAQs',
    'canViewAnalytics',
    'canManageAdmins',
    'canManageUsers',
    'canExportData'
];

// Session Configuration
export const SESSION_CONFIG = {
    CHECK_INTERVAL: 60000, // 1 minute
    INACTIVE_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    TOKEN_REFRESH_THRESHOLD: 60 * 60 * 1000 // 1 hour before expiration
};

// API Endpoints
export const API_ENDPOINTS = {
    // Auth
    LOGIN: '/api/auth/admin/login',
    LOGOUT: '/api/auth/admin/logout',
    CURRENT_ADMIN: '/api/auth/admin/me',
    REFRESH_TOKEN: '/api/auth/admin/refresh-token',
    CHANGE_PASSWORD: '/api/auth/admin/change-password',

    // Dashboard
    DASHBOARD: '/api/admin/dashboard',

    // Chats
    CHATS: '/api/admin/chats',
    CHAT_HISTORY: '/api/chat/history',

    // Tickets
    TICKETS: '/api/tickets/admin/all',
    TICKET_DETAIL: '/api/tickets/admin',

    // FAQs
    FAQS: '/api/faqs/admin/all',
    FAQ_DETAIL: '/api/faqs/admin',
    FAQ_TEMPLATE: '/api/faqs/admin/template',
    FAQ_BULK_IMPORT: '/api/faqs/admin/bulk-import',

    // Admin Management
    ADMIN_LIST: '/api/admin/list',
    ADMIN: '/api/admin',

    // Export
    EXPORT: '/api/admin/export'
};

// UI Configuration
export const UI_CONFIG = {
    MODAL_ANIMATION_DURATION: 300,
    TOAST_DURATION: 5000,
    TOAST_SUCCESS_DURATION: 3000,
    DEFAULT_DEBOUNCE_DELAY: 500,
    SEARCH_DEBOUNCE_DELAY: 300
};

// File Upload Configuration
export const FILE_UPLOAD_CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['.json', '.csv'],
    MIME_TYPES: {
        '.json': 'application/json',
        '.csv': 'text/csv'
    }
};

// Bulk Upload Constants
export const BULK_UPLOAD_CONFIG = {
    QUESTION_MIN_LENGTH: 5,
    QUESTION_MAX_LENGTH: 500,
    ANSWER_MIN_LENGTH: 10,
    ANSWER_MAX_LENGTH: 2000,
    PATTERN_MIN_LENGTH: 2,
    PATTERN_MAX_LENGTH: 200,
    CATEGORY_MAX_LENGTH: 50,
    PRIORITY_MIN: 1,
    PRIORITY_MAX: 10,
    DEFAULT_CATEGORY: 'general',
    DEFAULT_PRIORITY: 5
};

// Password Requirements
export const PASSWORD_CONFIG = {
    MIN_LENGTH: 8,
    REQUIRES_UPPERCASE: true,
    REQUIRES_LOWERCASE: true,
    REQUIRES_NUMBER: true,
    REQUIRES_SPECIAL: true,
    SPECIAL_CHARS: '@$!%*?&'
};

// Role Configuration
export const ROLE_CONFIG = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    SUPER_ADMIN_PERMISSIONS: [
        'canViewDashboard',
        'canViewChats',
        'canViewTickets',
        'canViewFAQs',
        'canViewAnalytics',
        'canManageAdmins',
        'canManageUsers',
        'canExportData'
    ]
};

// CSV Template for Bulk Import
export const CSV_TEMPLATE = `# REQUIRED FIELDS FORMAT
# ---------------------
# Question: 5-500 characters (Required)
# Answer: 10-2000 characters (Required)
# Patterns: At least 1 pattern, 2-200 characters each (Required)
# Category: Optional, max 50 characters (default: general)
# Priority: Optional, number 1-10 (default: 5)
#
# INSTRUCTIONS
# ---------------------
# 1. Delete all these instruction lines (lines starting with #)
# 2. Keep only the header row and your data rows
# 3. Use | (pipe) to separate multiple patterns
# 4. Save as CSV and upload
# ---------------------

question,answer,patterns,category,priority
What is QueryNest?,QueryNestis a comprehensive business solution platform that helps companies streamline their operations and improve efficiency.,what is QueryNest|about QueryNest|QueryNestinfo|tell me about QueryNest,general,5
How much does QueryNestcost?,QueryNestoffers flexible pricing plans to suit different business needs. Please contact our sales team for detailed pricing information.,QueryNestpricing|how much does QueryNestcost|QueryNestprice|cost of QueryNest,pricing,7
How do I get technical support?,You can get technical support by contacting our support team through email phone or our support portal.,technical support|help desk|support contact|get help,technical,8

# ---------------------
# IMPORTANT: Delete all lines with # before uploading
# Only keep the header row and your data rows above`;

// JSON Template for Bulk Import
export const JSON_TEMPLATE = {
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

// Error Messages
export const ERROR_MESSAGES = {
    EMAIL_EXISTS: 'This email address is already registered with another admin account. Please use a different email.',
    USERNAME_EXISTS: 'This username is already taken. Please choose a different username.',
    INVALID_PASSWORD: 'Please ensure your password is at least 8 characters and includes uppercase, lowercase, number and special characters.',
    NOT_AUTHENTICATED: 'Not authenticated. Please log in again.',
    NETWORK_ERROR: 'Network error. Please check your connection.',
    SERVER_ERROR: 'Server error. Please try again later.',
    PERMISSION_DENIED: 'You don\'t have permission to access this section.'
};

// Success Messages
export const SUCCESS_MESSAGES = {
    ADMIN_SAVED: 'Admin saved successfully',
    PASSWORD_CHANGED: 'Password changed successfully',
    FAQ_SAVED: 'FAQ saved successfully',
    DATA_EXPORTED: 'Successfully exported data',
    OPERATION_COMPLETED: 'Operation completed successfully'
};
