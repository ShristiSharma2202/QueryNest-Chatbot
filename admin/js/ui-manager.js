/**
 * UI Manager Module
 * Handles modal displays, navigation, and UI state management
 */

import { PermissionManager } from './permissions.js';
import { DataLoader } from './data-loaders.js';
import Utils from './utils.js';

export const UI = {
    /**
     * Show login screen
     */
    showLoginScreen: () => {
        const loginScreen = document.getElementById('loginScreen');
        const dashboard = document.getElementById('dashboard');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (dashboard) dashboard.style.display = 'none';
    },

    /**
     * Show dashboard
     */
    showDashboard: () => {
        const loginScreen = document.getElementById('loginScreen');
        const dashboard = document.getElementById('dashboard');
        if (loginScreen) loginScreen.style.display = 'none';
        if (dashboard) dashboard.style.display = 'flex';

        // Update admin info (sidebar) and dashboard greeting
        const currentAdmin = window.currentAdmin;
        let firstName = '';
        if (currentAdmin) {
            if (currentAdmin.name) {
                firstName = currentAdmin.name.split(' ')[0];
            } else if (currentAdmin.email) {
                firstName = currentAdmin.email.split('@')[0];
            } else {
                firstName = 'Admin';
            }
            const adminNameEl = document.getElementById('adminName');
            const adminRoleEl = document.getElementById('adminRole');
            if (adminNameEl) adminNameEl.textContent = firstName;
            if (adminRoleEl) adminRoleEl.textContent = currentAdmin.role === 'super_admin' ? 'Super Admin' : 'Administrator';
            // Set dashboard greeting
            const welcomeDiv = document.getElementById('welcomeMessage');
            if (welcomeDiv) welcomeDiv.textContent = `Welcome back, ${firstName}!`;
        }

        // Update account section (main profile)
        const accountName = document.getElementById('accountName');
        const accountEmail = document.getElementById('accountEmail');
        const accountRole = document.getElementById('accountRole');
        const accountUsername = document.getElementById('accountUsername');
        const memberSince = document.getElementById('memberSince');
        if (currentAdmin) {
            if (accountName) accountName.textContent = currentAdmin.name || currentAdmin.username || '';
            if (accountUsername) accountUsername.textContent = currentAdmin.username || '';
            if (accountEmail) accountEmail.textContent = currentAdmin.email || '';
            if (accountRole) accountRole.textContent = currentAdmin.role === 'super_admin' ? 'Super Admin' : 'Administrator';
            if (memberSince && currentAdmin.createdAt) {
                memberSince.textContent = Utils.formatShortDate(currentAdmin.createdAt);
            }
        }

        // Username edit logic: always show existing username with pencil, allow inline edit with confirm/cancel,
                // Name edit logic: always show existing name with pencil, allow inline edit with confirm/cancel, and update via API.
                const editNameBtn = document.getElementById('editNameBtn');
                const editNameInput = document.getElementById('editNameInput');
                if (accountName) {
                    accountName.textContent = window.currentAdmin?.name || window.currentAdmin?.username || 'Admin User';
                    accountName.style.display = 'inline';
                }

                if (editNameBtn && accountName) {
                    editNameBtn.onclick = () => {
                        let input = editNameInput;
                        if (!input) {
                            input = document.createElement('input');
                            input.id = 'editNameInput';
                            input.type = 'text';
                            input.className = 'inline-name-input';
                            input.style.display = 'none';
                            accountName.parentNode.insertBefore(input, accountName.nextSibling);
                        }
                        // Remove any previous controls or errors
                        const existingConfirm = document.getElementById('confirmNameBtn');
                        const existingCancel = document.getElementById('cancelNameBtn');
                        const existingError = document.getElementById('nameError');
                        if (existingConfirm) existingConfirm.remove();
                        if (existingCancel) existingCancel.remove();
                        if (existingError) existingError.remove();

                        // Hide the name text and show input
                        input.value = accountName.textContent === 'Admin User' ? '' : accountName.textContent;
                        accountName.style.display = 'none';
                        input.style.display = 'inline-block';
                        input.focus();

                        // Create confirm and cancel buttons
                        const confirmBtn = document.createElement('button');
                        confirmBtn.id = 'confirmNameBtn';
                        confirmBtn.className = 'btn-icon confirm';
                        confirmBtn.title = 'Save name';
                        confirmBtn.innerHTML = '✔';

                        const cancelBtn = document.createElement('button');
                        cancelBtn.id = 'cancelNameBtn';
                        cancelBtn.className = 'btn-icon cancel';
                        cancelBtn.title = 'Cancel';
                        cancelBtn.innerHTML = '✖';

                        input.parentNode.insertBefore(confirmBtn, input.nextSibling);
                        input.parentNode.insertBefore(cancelBtn, confirmBtn.nextSibling);

                        const errorSpan = document.createElement('div');
                        errorSpan.id = 'nameError';
                        errorSpan.className = 'inline-error';
                        errorSpan.style.color = 'var(--danger-color)';
                        errorSpan.style.marginTop = '4px';
                        input.parentNode.insertBefore(errorSpan, cancelBtn.nextSibling);

                        const finishEdit = (saved) => {
                            input.style.display = 'none';
                            accountName.style.display = 'inline';
                            if (confirmBtn) confirmBtn.remove();
                            if (cancelBtn) cancelBtn.remove();
                            if (errorSpan) errorSpan.remove();
                            if (!saved) {
                                accountName.textContent = window.currentAdmin?.name || window.currentAdmin?.username || 'Admin User';
                            }
                        };

                        const saveName = async () => {
                            const newName = input.value.trim();
                            if (!newName) {
                                errorSpan.textContent = 'Name cannot be empty';
                                return;
                            }
                            if (newName === (window.currentAdmin?.name || '')) {
                                finishEdit(false);
                                return;
                            }
                            try {
                                const { default: API } = await import('./api.js');
                                const adminId = window.currentAdmin?._id || window.currentAdmin?.id;
                                if (!adminId) {
                                    errorSpan.textContent = 'Admin ID not ready';
                                    return;
                                }
                                const resp = await API.updateAdmin(adminId, { name: newName });
                                if (resp && (resp.success || resp.data || resp._id)) {
                                    accountName.textContent = newName;
                                    window.currentAdmin = window.currentAdmin || {};
                                    window.currentAdmin.name = newName;
                                    finishEdit(true);
                                    UI.showToast('Name updated', 'success');
                                } else {
                                    const msg = resp.message || 'Failed to update name';
                                    errorSpan.textContent = msg;
                                    UI.showToast(msg, 'error');
                                }
                            } catch (err) {
                                console.error('Name update error:', err);
                                const msg = err.message || 'Failed to update name';
                                errorSpan.textContent = msg;
                                UI.showToast(msg, 'error');
                            }
                        };

                        confirmBtn.onclick = (e) => { e.preventDefault(); saveName(); };
                        cancelBtn.onclick = (e) => { e.preventDefault(); finishEdit(false); };
                        input.onkeydown = (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                saveName();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                finishEdit(false);
                            }
                        };
                    };
                }
        // and check availability before sending update.
        const editBtn = document.getElementById('editUsernameBtn');
        const editInput = document.getElementById('editUsernameInput');
        if (accountUsername) {
            // Ensure username text is always visible (use placeholder when empty)
            accountUsername.textContent = window.currentAdmin?.username || 'username not set';
            accountUsername.style.display = 'inline';
        }

        if (editBtn && accountUsername) {
            editBtn.onclick = () => {
                // Prepare input element (may be provided by HTML or created dynamically)
                let input = editInput;
                if (!input) {
                    input = document.createElement('input');
                    input.id = 'editUsernameInput';
                    input.type = 'text';
                    input.className = 'inline-username-input';
                    input.style.display = 'none';
                    accountUsername.parentNode.insertBefore(input, accountUsername.nextSibling);
                }

                // Remove any previous controls or errors
                const existingConfirm = document.getElementById('confirmUsernameBtn');
                const existingCancel = document.getElementById('cancelUsernameBtn');
                const existingError = document.getElementById('usernameError');
                if (existingConfirm) existingConfirm.remove();
                if (existingCancel) existingCancel.remove();
                if (existingError) existingError.remove();

                // Hide the username text and show input
                input.value = accountUsername.textContent === 'username not set' ? '' : accountUsername.textContent;
                accountUsername.style.display = 'none';
                input.style.display = 'inline-block';
                input.focus();

                // Create confirm and cancel buttons
                const confirmBtn = document.createElement('button');
                confirmBtn.id = 'confirmUsernameBtn';
                confirmBtn.className = 'btn-icon confirm';
                confirmBtn.title = 'Save username';
                confirmBtn.innerHTML = '✔';

                const cancelBtn = document.createElement('button');
                cancelBtn.id = 'cancelUsernameBtn';
                cancelBtn.className = 'btn-icon cancel';
                cancelBtn.title = 'Cancel';
                cancelBtn.innerHTML = '✖';

                input.parentNode.insertBefore(confirmBtn, input.nextSibling);
                input.parentNode.insertBefore(cancelBtn, confirmBtn.nextSibling);

                const errorSpan = document.createElement('div');
                errorSpan.id = 'usernameError';
                errorSpan.className = 'inline-error';
                errorSpan.style.color = 'var(--danger-color)';
                errorSpan.style.marginTop = '4px';
                input.parentNode.insertBefore(errorSpan, cancelBtn.nextSibling);

                const finishEdit = (saved) => {
                    input.style.display = 'none';
                    accountUsername.style.display = 'inline';
                    if (confirmBtn) confirmBtn.remove();
                    if (cancelBtn) cancelBtn.remove();
                    if (errorSpan) errorSpan.remove();
                    if (!saved) {
                        // revert display text to current value
                        accountUsername.textContent = window.currentAdmin?.username || 'username not set';
                    }
                };

                const saveUsername = async () => {
                    const newUsername = input.value.trim();
                    if (!newUsername) {
                        errorSpan.textContent = 'Username cannot be empty';
                        return;
                    }
                    if (newUsername === (window.currentAdmin?.username || '')) {
                        // Nothing changed
                        finishEdit(false);
                        return;
                    }

                    try {
                        const { default: API } = await import('./api.js');
                        // Check availability using dedicated endpoint (works for normal admins)
                        const excludeId = window.currentAdmin?._id || window.currentAdmin?.id;
                        const checkResp = await API.checkUsername(newUsername, excludeId);
                        const available = checkResp.data?.available;
                        if (!available) {
                            errorSpan.textContent = 'Username is not available';
                            return;
                        }

                        const adminId = window.currentAdmin?._id || window.currentAdmin?.id;
                        if (!adminId) {
                            errorSpan.textContent = 'Admin ID not ready';
                            return;
                        }

                        const resp = await API.updateAdmin(adminId, { username: newUsername });
                        if (resp && (resp.success || resp.data || resp._id)) {
                            // Update UI and global state
                            accountUsername.textContent = newUsername;
                            window.currentAdmin = window.currentAdmin || {};
                            window.currentAdmin.username = newUsername;
                            if (!window.currentAdmin.name) {
                                const accountNameEl = document.getElementById('accountName');
                                if (accountNameEl) accountNameEl.textContent = newUsername;
                            }
                            finishEdit(true);
                            UI.showToast('Username updated', 'success');
                        } else {
                            const msg = resp.message || 'Failed to update username';
                            errorSpan.textContent = msg;
                            UI.showToast(msg, 'error');
                        }
                    } catch (err) {
                        console.error('Username update error:', err);
                        const msg = err.message || 'Failed to update username';
                        errorSpan.textContent = msg;
                        UI.showToast(msg, 'error');
                    }
                };

                confirmBtn.onclick = (e) => { e.preventDefault(); saveUsername(); };
                cancelBtn.onclick = (e) => { e.preventDefault(); finishEdit(false); };

                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveUsername();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        finishEdit(false);
                    }
                };
            };
        }

        // Update navigation permissions after dashboard is shown
        if (currentAdmin && currentAdmin.permissions) {
            PermissionManager.setPermissions(currentAdmin.permissions);
            if (currentAdmin.role === 'super_admin') {
                PermissionManager.showAllSections();
            } else {
                PermissionManager.updateNavigation();
            }
            // If current user cannot manage admins, disable admin-management controls
            if (!PermissionManager.hasPermission('canManageAdmins')) {
                const addBtn = document.getElementById('addAdminBtn');
                if (addBtn) {
                    addBtn.disabled = true;
                    addBtn.title = "You don't have permission to manage admins";
                    addBtn.classList.add('disabled');
                }
                const isSuperAdminCheckbox = document.getElementById('isSuperAdmin');
                if (isSuperAdminCheckbox) isSuperAdminCheckbox.disabled = true;
                const permInputs = document.querySelectorAll('#permissionsGroup input[type="checkbox"], #permissionsGroup input[type="radio"]');
                permInputs.forEach(el => el.disabled = true);
                const saveAdminBtn = document.getElementById('saveAdminBtn');
                if (saveAdminBtn) saveAdminBtn.disabled = true;
            }
        }
    },

    /**
     * Switch to different section
     * @param {string} sectionName - Section name to switch to
     */
    switchSection: (sectionName) => {
        // Check permissions before switching sections
        const permissionMap = {
            dashboard: 'canViewDashboard',
            chats: 'canViewChats',
            tickets: 'canViewTickets',
            faqs: 'canViewFAQs',
            account: 'canViewDashboard' // Account is always accessible
        };

        const requiredPermission = permissionMap[sectionName];
        if (requiredPermission && !PermissionManager.hasPermission(requiredPermission)) {
            // Show unauthorized modal instead of switching
            UI.showModal('unauthorizedModal');
            return;
        }

        // Update navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
        });
        const activeItem = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeItem) activeItem.classList.add('active');

        // Update content sections
        const contentSections = document.querySelectorAll('.content-section');
        contentSections.forEach(section => {
            section.classList.remove('active');
        });
        const activeSection = document.getElementById(`${sectionName}Section`);
        if (activeSection) activeSection.classList.add('active');

        // Update header
        const titles = {
            dashboard: { title: 'Dashboard', subtitle: 'Overview of your chatbot performance' },
            chats: { title: 'Chat History', subtitle: 'View and analyze chat conversations' },
            tickets: { title: 'Support Tickets', subtitle: 'Manage customer support requests' },
            faqs: { title: 'FAQ Management', subtitle: 'Manage chatbot questions and answers' },
            account: { title: 'Account Settings', subtitle: 'Manage your admin account and preferences' },
        };

        const titleInfo = titles[sectionName];
        const pageTitleEl = document.getElementById('pageTitle');
        const pageSubtitleEl = document.getElementById('pageSubtitle');
        if (pageTitleEl) pageTitleEl.textContent = titleInfo.title;
        if (pageSubtitleEl) pageSubtitleEl.textContent = titleInfo.subtitle;

        window.currentSection = sectionName;

        // Load section data
        DataLoader.loadSectionData(sectionName);
    },

    /**
     * Show modal by ID
     * @param {string} modalId - Modal element ID
     */
    showModal: (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('show');
    },

    /**
     * Hide modal by ID
     * @param {string} modalId - Modal element ID
     */
    hideModal: (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    },

    /**
     * Show confirmation modal
     * @param {Object} opts - Options object
     * @returns {Promise<boolean>} True if confirmed
     */
    confirm: (opts) => new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const bodyEl = document.getElementById('confirmBody');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const closeBtn = modal?.querySelector('.modal-close');

        if (titleEl) titleEl.textContent = opts.title || 'Confirm Action';
        if (bodyEl) bodyEl.innerHTML = opts.message || 'Are you sure?';

        const close = () => {
            if (modal) modal.classList.remove('show');
            if (okBtn) okBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        if (okBtn) okBtn.onclick = () => { close(); resolve(true); };
        if (cancelBtn) cancelBtn.onclick = () => { close(); resolve(false); };
        if (closeBtn) closeBtn.onclick = () => { close(); resolve(false); };

        if (modal) modal.classList.add('show');
    })
};

/**
 * Show a temporary toast message.
 * @param {string} message
 * @param {'success'|'error'} type
 * @param {number} duration ms
 */
UI.showToast = (message, type = 'success', duration = 3000) => {
    let toast = document.getElementById('globalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('error');
    if (type === 'error') toast.classList.add('error');
    // trigger show
    setTimeout(() => toast.classList.add('show'), 10);
    // hide after duration
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
};

/**
 * Load section data based on current section
 * @param {string} section - Section name
 */
/**
 * View chat details in modal
 * @param {string} sessionId - Session ID
 * @param {string} convId - Conversation ID
 */
UI.viewChat = async (sessionId, convId) => {
    try {
        const { API } = await import('./api.js');
        const { Utils } = await import('./utils.js');

        // Fetch chat history for session and filter conversation
        const resp = await API.request(`/api/chat/history/${sessionId}?limit=50&page=1`);
        const chats = resp.data?.chats || [];
        const convo = chats.find(c => c.conversationId === convId);
        const body = document.getElementById('chatModalBody');

        if (!convo) {
            body.innerHTML = '<div class="loading">Conversation not found</div>';
        } else {
            const escape = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const msgs = (convo.messages || []).map(m => {
                const type = (m.type || '').toLowerCase() === 'user' ? 'user' : 'bot';
                const when = Utils.formatDate(m.timestamp || convo.createdAt);
                const text = escape(m.content || '');
                return `
                    <div class="chat-bubble ${type}">
                        <div class="chat-meta">
                            <span class="chat-role">${type === 'user' ? 'User' : 'Assistant'}</span>
                            <span class="chat-time">${when}</span>
                        </div>
                        <div class="chat-text">${text}</div>
                    </div>
                `;
            }).join('');
            body.innerHTML = `<div class="chat-log">${msgs || '<div class="loading">No messages</div>'}</div>`;
        }
        UI.showModal('chatModal');
    } catch (e) {
        alert('Failed to load conversation: ' + e.message);
    }
};

/**
 * View ticket details in modal
 * @param {string} ticketId - Ticket ID
 */
UI.viewTicket = async (ticketId) => {
    try {
        const { API } = await import('./api.js');
        const { Utils } = await import('./utils.js');

        const resp = await API.request(`/api/tickets/admin/${ticketId}`);
        const t = resp.data.ticket;
        const body = document.getElementById('ticketModalBody');

        // Format activity log
        const activityLog = (t.activity || []).map(activity => {
            let byText = activity.by || 'System';
            // If activity.user exists, show name and email
            if (activity.user) {
                byText = `${activity.user.name || 'User'} <${activity.user.email || 'N/A'}>`;
            } else if (activity.byUser) {
                byText = `${activity.byUser.name || 'User'} <${activity.byUser.email || 'N/A'}>`;
            }

            return `
            <div class="activity-item">
                <div class="activity-action">${activity.action || 'Activity'}</div>
                <div class="activity-meta">
                    By: ${byText} | ${Utils.formatDate(activity.timestamp)}
                </div>
                ${activity.notes ? `<div class="activity-notes">${(activity.notes || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
            </div>
        `;
        }).join('');

        body.innerHTML = `
            <div class="ticket-detail">
                <div class="ticket-header-strip">
                    <div class="ticket-id">${t.ticketId}</div>
                    <div style="display: flex; gap: 10px; align-items: center;">${Utils.createStatusBadge(t.status)} ${Utils.createPriorityBadge(t.priority)}</div>
                </div>
                
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Name</div>
                        <div class="detail-value">${t.name}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Email</div>
                        <div class="detail-value"><a href="mailto:${t.email}">${t.email}</a></div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Mobile</div>
                        <div class="detail-value">${t.mobile || '-'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Created</div>
                        <div class="detail-value">${Utils.formatDate(t.createdAt)}</div>
                    </div>
                </div>
                
                <div>
                    <div class="detail-label">Customer Message</div>
                    <div class="ticket-message">
                        ${(t.message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
                    </div>
                </div>
                
                <!-- Reply Section -->
                <div style="padding: 20px; background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); border: 1px solid #dbeafe; border-radius: 8px;">
                    <div class="reply-section-header">
                        <i class="fas fa-reply"></i>
                        <h4>Reply to Customer</h4>
                    </div>
                    <div class="reply-info">
                        <i class="fas fa-envelope"></i>
                        <span>Your reply will be automatically sent to <strong>${t.email}</strong> via email</span>
                    </div>
                    <form id="ticketReplyForm" data-ticket-id="${t.ticketId}">
                        <textarea 
                            id="ticketReplyMessage" 
                            name="message" 
                            rows="6" 
                            required
                            placeholder="Type your reply here. This will be sent to ${t.email} via email..."
                        ></textarea>
                        <div class="reply-buttons">
                            <button type="button" class="cancel-reply-btn">Cancel</button>
                            <button type="submit" class="btn-primary">
                                <span class="btn-loading" style="display:none"><i class="fas fa-spinner fa-spin"></i></span>
                                <span class="btn-text"><i class="fas fa-paper-plane"></i> Send Reply & Email</span>
                            </button>
                        </div>
                    </form>
                </div>
                
                <!-- Activity Log -->
                ${activityLog ? `
                <div class="activity-log-section">
                    <div class="activity-log-header">
                        <i class="fas fa-history"></i>
                        <span>Activity Log</span>
                    </div>
                    <div class="activity-log-container">
                        ${activityLog}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        // Add event listeners for reply form
        setTimeout(() => {
            const cancelBtn = document.querySelector('.cancel-reply-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    document.getElementById('ticketReplyMessage').value = '';
                });
            }
        }, 100);

        UI.showModal('ticketModal');
    } catch (error) {
        alert('Failed to load ticket: ' + error.message);
    }
};

/**
 * Handle ticket reply submission
 */
window.handleTicketReply = async (event, ticketId) => {
    event.preventDefault();
    const form = event.target;
    const messageTextarea = document.getElementById('ticketReplyMessage');
    const message = messageTextarea.value.trim();
    const sendBtn = form.querySelector('.btn-primary[type="submit"]') || form.querySelector('.btn-primary');
    const btnText = sendBtn ? sendBtn.querySelector('.btn-text') : null;
    const btnLoading = sendBtn ? sendBtn.querySelector('.btn-loading') : null;
    if (!message || message.length < 10) {
        UI.showToast('Please enter a reply message (minimum 10 characters)', 'error');
        return false;
    }

    if (sendBtn) {
        sendBtn.classList.add('loading');
        if (btnText) btnText.style.opacity = 0;
        if (btnLoading) btnLoading.style.display = 'block';
    }

    try {
        const { API } = await import('./api.js');
        const { DataLoader } = await import('./data-loaders.js');

        // Send reply via API
        const response = await API.request(`/api/tickets/admin/${ticketId}/reply`, {
            method: 'POST',
            body: JSON.stringify({ message })
        });

        if (response.success) {
            UI.showToast('Reply sent successfully!', 'success');
            messageTextarea.value = '';
            // Reload tickets to show updated activity
            DataLoader.loadTickets();
            UI.hideModal('ticketModal');
        } else {
            UI.showToast('Failed to send reply: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        UI.showToast('Error sending reply: ' + error.message, 'error');
    } finally {
        if (sendBtn) {
            sendBtn.classList.remove('loading');
            if (btnText) btnText.style.opacity = 1;
            if (btnLoading) btnLoading.style.display = 'none';
        }
    }
};

export default UI;