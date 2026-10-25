/**
 * Main Module - Application Bootstrap
 * Initializes all modules and sets up the admin dashboard
 */

import { API_BASE_URL, AppState } from './config.js';
import { Utils } from './utils.js';
import { API } from './api.js';
import { Auth } from './auth.js';
import { PermissionManager } from './permissions.js';
import { UI } from './ui-manager.js';
import { DataLoader } from './data-loaders.js';

// --- FAQ Sort State Management ---
const FAQ_SORT_KEY = 'faqSort';
const FAQ_DEFAULT_SORT = { field: 'updated', direction: 'desc' };

export function getFaqSortState() {
    const saved = localStorage.getItem(FAQ_SORT_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            return { ...FAQ_DEFAULT_SORT };
        }
    }
    return { ...FAQ_DEFAULT_SORT };
}

export function setFaqSortState(field, direction) {
    localStorage.setItem(FAQ_SORT_KEY, JSON.stringify({ field, direction }));
}

// --- FAQ Sort Dropdown Handler ---
function setupFaqSortDropdown() {
    const dropdown = document.getElementById('sortDropdown');
    if (!dropdown) return;
    const { field, direction } = getFaqSortState();
    // Set dropdown value
    let value = `${field}_${direction}`;
    if ([...dropdown.options].some(opt => opt.value === value)) {
        dropdown.value = value;
    }
    dropdown.addEventListener('change', () => {
        const [newField, newDir] = dropdown.value.split('_');
        setFaqSortState(newField, newDir);
        DataLoader.loadFAQs({ sortField: newField, sortDirection: newDir, page: 1 });
    });
}

// --- FAQ Table Header Sort Handler ---
function setupFaqTableHeaderSort() {
    const ths = document.querySelectorAll('#faqsTable thead th');
    const sortMap = {
        'Question': 'question',
        'Hit Count': 'hitCount',
        'Rating': 'rating',
        'Updated': 'updated',
    };
    ths.forEach(th => {
        const key = sortMap[th.textContent.trim()];
        if (!key) return;
        th.classList.add('sortable');
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            let { field, direction } = getFaqSortState();
            if (field === key) {
                direction = direction === 'asc' ? 'desc' : 'asc';
            } else {
                field = key;
                direction = 'desc';
            }
            setFaqSortState(field, direction);
            // Sync dropdown
            const dropdown = document.getElementById('sortDropdown');
            if (dropdown) dropdown.value = `${field}_${direction}`;
            DataLoader.loadFAQs({ sortField: field, sortDirection: direction, page: 1 });
        });
    });
}

// --- FAQ Sort Visuals (Arrow, Highlight) ---
export function updateFaqSortVisuals() {
    const { field, direction } = getFaqSortState();
    const ths = document.querySelectorAll('#faqsTable thead th');
    const sortMap = {
        'question': 'Question',
        'hitCount': 'Hit Count',
        'rating': 'Rating',
        'updated': 'Updated',
    };
    ths.forEach(th => {
        th.classList.remove('active-sort');
        const arrowSpan = th.querySelector('.sort-arrow');
        if (arrowSpan) arrowSpan.remove();
        const key = Object.keys(sortMap).find(k => sortMap[k] === th.textContent.trim());
        if (key && key === field) {
            th.classList.add('active-sort');
            const arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            arrow.textContent = direction === 'asc' ? '↑' : '↓';
            th.appendChild(arrow);
        }
    });
}

// --- FAQ Sort Initialization ---
export function initializeFaqSorting() {
    setupFaqSortDropdown();
    setupFaqTableHeaderSort();
    updateFaqSortVisuals();
}
import { BulkUpload } from './bulk-upload.js';
import { ExportManager } from './export-manager.js';
import { AdminForm } from './admin-forms.js';
import { setupEventHandlers } from './event-handlers.js';

/**
 * Security: Clear sensitive data from URL
 * This prevents credentials from being exposed in browser history or logs
 */
function sanitizeURL() {
    const url = new URL(window.location);
    
    // Check if sensitive parameters exist in URL
    const sensitiveParams = ['email', 'password', 'token', 'auth', 'session'];
    let hasSensitiveData = false;
    
    for (const param of sensitiveParams) {
        if (url.searchParams.has(param)) {
            console.warn('⚠️ WARNING: Sensitive data detected in URL! Removing for security...');
            url.searchParams.delete(param);
            hasSensitiveData = true;
        }
    }
    
    // If sensitive data was found, replace history to remove it
    if (hasSensitiveData) {
        window.history.replaceState({}, document.title, url.toString());
    }
}

/**
 * Initialize logo fallback handling
 */
function initLogoFallback() {
    const logoImage = document.getElementById('logoImage');
    const logoFallback = document.getElementById('logoFallback');
    
    if (logoImage && logoFallback) {
        logoImage.addEventListener('error', function() {
            this.style.display = 'none';
            logoFallback.style.display = 'flex';
        });
        
        logoImage.addEventListener('load', function() {
            logoFallback.style.display = 'none';
        });
        
        // Check if image is already loaded
        if (logoImage.complete && logoImage.naturalHeight !== 0) {
            logoFallback.style.display = 'none';
        } else if (logoImage.complete) {
            logoImage.style.display = 'none';
            logoFallback.style.display = 'flex';
        }
    }
}

/**
 * Main initialization function
 */
async function initialize() {
    try {
        // Security: Sanitize URL first
        sanitizeURL();
        
        // Get stored token
        const storedToken = localStorage.getItem('admin_token');
        const tokenExpiration = parseInt(localStorage.getItem('token_expiration') || '0');
        const currentTime = new Date().getTime();
        
        // Only clear token if it's actually expired (with a small buffer)
        if (storedToken && tokenExpiration > 0 && currentTime >= (tokenExpiration - 60000)) {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('token_expiration');
        } else if (storedToken) {
            // Token is still valid, it will be used for API calls
        }
        
        // Check authentication
        const isAuthenticated = await Auth.checkAuth();
        
        if (isAuthenticated) {
            // Show dashboard
            UI.showDashboard();
            DataLoader.loadDashboard();

            // Personalized Welcome Message (Name only)
            setTimeout(() => {
                const welcomeDiv = document.getElementById('welcomeMessage');
                let adminName = '';
                if (window.currentAdmin && window.currentAdmin.name) {
                    adminName = window.currentAdmin.name.split(' ')[0];
                } else if (window.currentAdmin && window.currentAdmin.email) {
                    adminName = window.currentAdmin.email.split('@')[0];
                } else {
                    adminName = 'Admin';
                }
                if (welcomeDiv) {
                    welcomeDiv.textContent = `Welcome back, ${adminName}!`;
                }
                // Sidebar footer admin name update
                const sidebarName = document.getElementById('adminName');
                if (sidebarName) {
                    sidebarName.textContent = adminName;
                }
            }, 200);

            // Initialize logo fallback after dashboard is shown
            setTimeout(() => {
                initLogoFallback();
            }, 100);

            // Initialize bulk upload functionality
            BulkUpload.init();

            // Initialize export functionality
            ExportManager.init();

            // Setup all event handlers
            await setupEventHandlers();

            // Initialize FAQ sorting (after DOM is ready)
            setTimeout(() => {
                initializeFaqSorting();
            }, 300);
        } else {
            // Show login screen
            UI.showLoginScreen();

            // Setup login form
            setupLoginForm();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        UI.showLoginScreen();
        setupLoginForm();
    }
}

/**
 * Setup login form event listeners
 */
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    // Ensure event handlers (including password toggle) are set up on login screen
    setupEventHandlers();

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const loginBtn = document.getElementById('loginBtn');
        const errorDiv = document.getElementById('loginError');
        
        loginBtn.classList.add('loading');
        Utils.hideError(errorDiv);

        try {
            const formData = new FormData(e.target);
            const keepLoggedIn = formData.get('keepLoggedIn') === 'on';
            const email = (formData.get('email') || '').toString().trim();
            const password = (formData.get('password') || '').toString();

            // Basic client-side validation to avoid server 400s
            if (!email) {
                throw new Error('Email/Username is required');
            }
            if (!password || password.length < 8) {
                throw new Error('Password must be at least 8 characters');
            }

            await Auth.login({ email, password }, keepLoggedIn);
            
            UI.showDashboard();
            DataLoader.loadDashboard();
            
            // Initialize logo fallback
            setTimeout(() => {
                initLogoFallback();
            }, 100);
            
            // Initialize bulk upload functionality
            BulkUpload.init();
            
            // Initialize export functionality
            ExportManager.init();
            
            // Setup all event handlers
            await setupEventHandlers();
            
        } catch (error) {
            Utils.showError(error.message, errorDiv);
        } finally {
            loginBtn.classList.remove('loading');
        }
    });
}

/**
 * Setup auto-refresh of dashboard
 */
function setupAutoRefresh() {
    setInterval(() => {
        const currentSection = AppState.currentSection || 'dashboard';
        if (currentSection === 'dashboard' && Auth.isAuthenticated()) {
            DataLoader.loadDashboard();
        }
    }, 30000); // Refresh every 30 seconds
}

/**
 * Expose global functions for backward compatibility
 */
window.AdminDashboard = {
    API,
    Auth,
    UI,
    DataLoader,
    Utils,
    ExportManager,
    PermissionManager,
    BulkUpload,
    AppState,
    API_BASE_URL
};

// Expose view functions globally for event handlers
window.viewChat = UI.viewChat;
window.viewTicket = UI.viewTicket;

// Expose ticket management functions globally
window.updateTicketStatus = async (ticketId, status) => {
    return await API.updateTicketStatus(ticketId, { status });
};

window.updateTicketPriority = async (ticketId, priority) => {
    return await API.updateTicketPriority(ticketId, { priority });
};

// Expose admin management functions
window.addAdmin = () => {
    const adminForm = document.getElementById('adminForm');
    if (adminForm) {
        adminForm.reset();
        delete adminForm.dataset.adminId;
    }
    
    // Show password field for new admin
    const passwordGroup = document.getElementById('adminFormPassword')?.closest('.form-group');
    const roleGroup = document.getElementById('adminFormRole')?.closest('.form-group');
    if (passwordGroup) passwordGroup.style.display = 'block';
    if (roleGroup) roleGroup.style.display = 'block';
    
    // Update modal title
    const modalTitle = document.getElementById('adminModalTitle');
    if (modalTitle) modalTitle.textContent = 'Add New Admin';
    
    // Make password required
    const passwordField = document.getElementById('adminFormPassword');
    if (passwordField) {
        passwordField.required = true;
        passwordField.placeholder = 'Enter password';
    }
    
    UI.showModal('adminModal');
};

window.editAdmin = async (adminId) => {
    try {
        const resp = await API.getAdmin(adminId);
        const admin = resp.data.admin;
        
        const form = document.getElementById('adminForm');
        if (form) {
            form.dataset.adminId = adminId;
            document.getElementById('adminFormName').value = admin.name || '';
            document.getElementById('adminFormUsername').value = admin.username || '';
            document.getElementById('adminFormEmail').value = admin.email || '';
            
            // Hide password field for edit
            const passwordGroup = document.getElementById('adminFormPassword')?.closest('.form-group');
            const roleGroup = document.getElementById('adminFormRole')?.closest('.form-group');
            if (passwordGroup) passwordGroup.style.display = 'none';
            if (roleGroup) roleGroup.style.display = 'none';
            
            // Make password not required
            const passwordField = document.getElementById('adminFormPassword');
            if (passwordField) {
                passwordField.required = false;
                passwordField.placeholder = 'Leave blank to keep current password';
                passwordField.value = '';
            }
            
            // Update modal title
            const modalTitle = document.getElementById('adminModalTitle');
            if (modalTitle) modalTitle.textContent = 'Edit Admin';
        }
        
        UI.showModal('adminModal');
    } catch (error) {
        Utils.showError('Failed to load admin details: ' + error.message);
    }
};

window.changePassword = () => {
    UI.showModal('changePasswordModal');
};

window.managePermissions = async (adminId) => {
    try {
        console.debug('managePermissions called for adminId=', adminId);
        const resp = await API.getAdmin(adminId);
        const admin = resp && resp.data ? resp.data.admin : null;

        if (!admin) {
            Utils.showError('Failed to load admin details');
            return;
        }

        const form = document.getElementById('permissionsForm');
        if (form) {
            form.dataset.adminId = adminId;
        }

        // Load and check permissions
        const permissionsGroup = document.getElementById('permissionsGroup');
        if (permissionsGroup) {
            const checkboxes = permissionsGroup.querySelectorAll('input[name="permissions"]');
            const rawPermissions = admin.permissions;
            let adminPermissions = [];

            if (Array.isArray(rawPermissions)) {
                adminPermissions = rawPermissions;
            } else if (typeof rawPermissions === 'string') {
                adminPermissions = rawPermissions.split(',').map(s => s.trim()).filter(Boolean);
            } else if (rawPermissions && typeof rawPermissions === 'object') {
                adminPermissions = Object.keys(rawPermissions).filter(k => !!rawPermissions[k]);
            } else {
                adminPermissions = [];
            }

            checkboxes.forEach(checkbox => {
                checkbox.checked = adminPermissions.includes(checkbox.value);
            });
        }

        UI.showModal('permissionsModal');
    } catch (err) {
        console.error('managePermissions error:', err);
        Utils.showError('An error occurred while loading permissions');
    }
};

window.toggleAdmin = async (adminId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const confirmed = await UI.confirm({
        title: 'Toggle Admin Status',
        message: `Change admin status to <strong>${newStatus}</strong>?`,
        confirmText: 'Confirm',
        cancelText: 'Cancel'
    });
    
    if (confirmed) {
        try {
            await API.toggleAdmin(adminId);
            DataLoader.loadAdminList();
        } catch (error) {
            Utils.showError('Failed to update admin status: ' + error.message);
        }
    }
};

window.deleteAdmin = async (adminId) => {
    const confirmed = await UI.confirm({
        title: 'Delete Admin',
        message: 'Are you sure you want to delete this admin? This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    
    if (confirmed) {
        try {
            await API.deleteAdmin(adminId);
            DataLoader.loadAdminList();
        } catch (error) {
            Utils.showError('Failed to delete admin: ' + error.message);
        }
    }
};

window.viewActivity = async (type, id) => {
    // Show activity modal or details
    const modal = document.getElementById('activityModal');
    if (modal) {
        UI.showModal('activityModal');
    }
};

window.editFAQ = async (faqId) => {
    try {
        const resp = await API.getFAQById(faqId);
        const faq = resp.data.faq || resp.data;
        const form = document.getElementById('faqForm');
        if (form) {
            form.dataset.faqId = faqId;
            document.getElementById('faqQuestion').value = faq.question || '';
            document.getElementById('faqCategory').value = faq.category || '';
            document.getElementById('faqAnswer').value = faq.answer || '';
            // Set patterns field (comma separated)
            if (faq.patterns && Array.isArray(faq.patterns)) {
                document.getElementById('faqPatterns').value = faq.patterns.join(', ');
            } else {
                document.getElementById('faqPatterns').value = '';
            }
            // Set priority field if present
            if (faq.priority !== undefined) {
                document.getElementById('faqPriority').value = faq.priority;
            }
        }
        // Update modal title if present
        const modalTitle = document.getElementById('faqModalTitle');
        if (modalTitle) modalTitle.textContent = 'Edit FAQ';
        UI.showModal('faqModal');
    } catch (error) {
        Utils.showError('Failed to load FAQ details: ' + error.message);
    }
};

/**
 * DOMContentLoaded event handler
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the application
    await initialize();
    
    // Setup auto-refresh
    setupAutoRefresh();
});

/**
 * Export all modules for potential external use
 */
export {
    API,
    Auth,
    UI,
    DataLoader,
    Utils,
    ExportManager,
    PermissionManager,
    BulkUpload,
    API_BASE_URL,
    AppState
};