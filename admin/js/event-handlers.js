/**
 * Event Handlers Module
 * Centralized setup for all DOM event listeners
 */


import { BulkUpload } from './bulk-upload.js';

// Utility to set up password toggle event listeners
export function setupPasswordToggleHandlers() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        // Remove previous listeners to avoid duplicates
        btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    if (icon) icon.classList.remove('fa-eye');
                    if (icon) icon.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    if (icon) icon.classList.remove('fa-eye-slash');
                    if (icon) icon.classList.add('fa-eye');
                }
            }
        });
    });
}

export async function setupEventHandlers() {
    // ==================== Password Toggle Event Listeners ====================
    setupPasswordToggleHandlers();
    const { UI } = await import('./ui-manager.js');
    const { Auth } = await import('./auth.js');
    const { DataLoader } = await import('./data-loaders.js');
    const { Utils } = await import('./utils.js');
    const { AdminForm, initializeAdminFormListeners } = await import('./admin-forms.js');

    // ==================== Navigation Event Listeners ====================
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            UI.switchSection(section);
            // Initialize FAQ sorting if navigating to FAQ section
            if (section === 'faqs') {
                import('./main.js').then(({ initializeFaqSorting }) => {
                    setTimeout(() => {
                        initializeFaqSorting();
                    }, 200);
                });
            }
            // Close sidebar after navigation
            // Sidebar is now always fixed and expanded; no JS sidebar collapse/expand needed
        });
    });

    // Link dashboard stat cards to sections
    const link = (id, section) => {
        const el = document.getElementById(id);
        if (el) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                // Permission check before switching section
                const permissionMap = {
                    dashboard: 'canViewDashboard',
                    chats: 'canViewChats',
                    tickets: 'canViewTickets',
                    faqs: 'canViewFAQs',
                    account: 'canViewDashboard'
                };
                const requiredPermission = permissionMap[section];
                // PermissionManager is imported in UI-manager and attached to window
                const PermissionManager = window.PermissionManager || (window.AdminDashboard && window.AdminDashboard.PermissionManager);
                if (PermissionManager && requiredPermission && !PermissionManager.hasPermission(requiredPermission)) {
                    import('./ui-manager.js').then(({ UI }) => UI.showModal && UI.showModal('unauthorizedModal'));
                    return;
                }
                import('./ui-manager.js').then(({ UI }) => UI.switchSection(section));
            });
        }
    };
    link('cardChats', 'chats');
    link('cardTickets', 'tickets');
    link('cardFAQs', 'faqs');

    // ==================== Logout Event Listeners ====================
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await Auth.logout();
        });
    }

    const logoutNavBtn = document.getElementById('logoutNavBtn');
    if (logoutNavBtn) {
        logoutNavBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await Auth.logout();
        });
    }

    // ==================== Refresh Button ====================
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const currentSection = document.querySelector('.nav-item.active')?.getAttribute('data-section') || 'dashboard';
            DataLoader.loadSectionData(currentSection);
        });
    }

    // ==================== Modal Event Listeners ====================
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal.id === 'adminModal') {
                // Special handling for admin modal - ensure form is reset
                AdminForm.close();
            } else {
                UI.hideModal(modal.id);
            }
        });
    });

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.id === 'adminModal') {
                    // Special handling for admin modal - ensure form is reset
                    AdminForm.close();
                } else {
                    UI.hideModal(modal.id);
                }
            }
        });
    });

    // Unauthorized modal close button
    const closeUnauthorizedBtn = document.getElementById('closeUnauthorizedModal');
    if (closeUnauthorizedBtn) {
        closeUnauthorizedBtn.addEventListener('click', () => {
            UI.hideModal('unauthorizedModal');
        });
    }

    // ==================== Chat Table Event Listeners ====================
    
    const chatsTable = document.getElementById('chatsTable');
    if (chatsTable) {
        chatsTable.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            const link = e.target.closest('a[data-action]');
            const element = btn || link;
            if (!element) return;
            
            const action = element.dataset.action;
            
            if (action === 'view-chat') {
                const sessionId = element.dataset.session;
                const convId = element.dataset.conv;
                window.viewChat(sessionId, convId);
            } else if (action === 'view-ticket') {
                const ticketId = element.dataset.ticket;
                window.viewTicket(ticketId);
            } else if (action === 'end-chat') {
                const convId = element.dataset.conv;
                const { API } = await import('./api.js');
                try { 
                    await API.endChat(convId); 
                    DataLoader.loadChats(); 
                } catch (err) { 
                    Utils.showError('Failed to end chat: ' + err.message); 
                }
            } else if (action === 'archive-chat') {
                const convId = element.dataset.conv;
                const { API } = await import('./api.js');
                try { 
                    await API.archiveChat(convId); 
                    DataLoader.loadChats(); 
                } catch (err) { 
                    Utils.showError('Failed to archive chat: ' + err.message); 
                }
            } else if (action === 'unarchive-chat') {
                const convId = element.dataset.conv;
                const { API } = await import('./api.js');
                try { 
                    await API.unarchiveChat(convId); 
                    DataLoader.loadChats(); 
                } catch (err) { 
                    Utils.showError('Failed to unarchive chat: ' + err.message); 
                }
            } else if (action === 'mark-important') {
                const convId = element.dataset.conv;
                const { API } = await import('./api.js');
                try { 
                    await API.markImportant(convId, true); 
                    DataLoader.loadChats(); 
                } catch (err) { 
                    Utils.showError('Failed to mark as important: ' + err.message); 
                }
            } else if (action === 'mark-normal') {
                const convId = element.dataset.conv;
                const { API } = await import('./api.js');
                try { 
                    await API.markImportant(convId, false); 
                    DataLoader.loadChats(); 
                } catch (err) { 
                    Utils.showError('Failed to mark as normal: ' + err.message); 
                }
            } else if (action === 'delete-chat') {
                const convId = element.dataset.conv;
                const ok = await UI.confirm({ title: 'Delete Chat', message: 'Delete this chat permanently?' });
                if (!ok) return;
                const { API } = await import('./api.js');
                try { 
                    await API.deleteChat(convId); 
                    DataLoader.loadChats(); 
                } catch (err) { 
                    // Show specific validation error if present
                    if (err && err.validationErrors) {
                        Utils.showError(err.validationErrors, null, err);
                    } else {
                        Utils.showError('Failed to delete chat: ' + err.message);
                    }
                }
            }
        });
    }

    // ==================== Ticket Table Event Listeners ====================
    
    const ticketsTable = document.getElementById('ticketsTable');
    if (ticketsTable) {
        ticketsTable.addEventListener('click', async (e) => {
            const { API } = await import('./api.js');
            
            // Handle status badge clicks
            const statusBadge = e.target.closest('.clickable-status');
            if (statusBadge) {
                const ticketId = statusBadge.dataset.ticket;
                const currentStatus = statusBadge.dataset.currentStatus;
                
                // Prevent status changes for closed tickets
                if (currentStatus === 'closed') {
                    return;
                }
                
                const getNextStatus = (status) => {
                    const TICKET_STATUS_LIFECYCLE = {
                        'new': 'in_progress',
                        'in_progress': 'closed'
                    };
                    return TICKET_STATUS_LIFECYCLE[status] || 'new';
                };
                
                const nextStatus = getNextStatus(currentStatus);
                
                // Show confirmation modal
                const statusNames = {
                    'new': 'New',
                    'in_progress': 'In Progress',
                    'closed': 'Closed'
                };
                
                const confirmed = await UI.confirm({
                    title: 'Change Ticket Status',
                    message: `Change status from <strong>${statusNames[currentStatus]}</strong> to <strong>${statusNames[nextStatus]}</strong>?`,
                    confirmText: 'Change Status',
                    cancelText: 'Cancel'
                });
                
                if (confirmed) {
                    try {
                        await window.updateTicketStatus(ticketId, nextStatus);
                        // Reload tickets to show updated status
                        await DataLoader.loadTickets();
                    } catch (error) {
                        console.error('Error updating ticket status:', error);
                        UI.alert({ title: 'Error', message: 'Failed to update ticket status' });
                    }
                }
                return;
            }

            // Handle priority badge clicks
            const priorityBadge = e.target.closest('.clickable-priority');
            if (priorityBadge) {
                const ticketId = priorityBadge.dataset.ticket;
                const currentPriority = priorityBadge.dataset.currentPriority;
                
                // Show priority selection modal
                const priorityOptions = ['low', 'medium', 'high'];
                const priorityNames = {
                    'low': 'Low',
                    'medium': 'Medium', 
                    'high': 'High'
                };
                
                const priorityHtml = priorityOptions.map(priority => 
                    `<button class="priority-option ${priority === currentPriority ? 'current' : ''}" 
                             data-priority="${priority}">
                        ${priorityNames[priority]}
                    </button>`
                ).join('');
                
                const modal = document.createElement('div');
                modal.className = 'modal show';
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Change Ticket Priority</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <p>Select new priority for ticket ${ticketId}:</p>
                            <div class="priority-options">
                                ${priorityHtml}
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn-secondary" id="cancelPriorityChange">Cancel</button>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Handle priority selection
                const closeModal = () => {
                    if (modal.parentNode === document.body) {
                        document.body.removeChild(modal);
                    }
                };
                
                modal.querySelectorAll('.priority-option').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const newPriority = btn.dataset.priority;
                        if (newPriority !== currentPriority) {
                            try {
                                await window.updateTicketPriority(ticketId, newPriority);
                                // Close modal first, then reload tickets
                                closeModal();
                                // Reload tickets to show updated priority
                                await DataLoader.loadTickets();
                            } catch (error) {
                                console.error('Error updating ticket priority:', error);
                                UI.alert({ title: 'Error', message: 'Failed to update ticket priority' });
                            }
                        } else {
                            closeModal();
                        }
                    });
                });
                
                // Handle cancel and close
                modal.querySelector('.modal-close').onclick = closeModal;
                modal.querySelector('#cancelPriorityChange').onclick = closeModal;
                modal.onclick = (e) => {
                    if (e.target === modal) closeModal();
                };
                
                return;
            }
            
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const ticketId = btn.dataset.ticket;
            
            if (action === 'view-ticket') {
                window.viewTicket(ticketId);
            } else if (action === 'archive-ticket') {
                try { 
                    await API.archiveTicket(ticketId); 
                    DataLoader.loadTickets(); 
                } catch (err) { 
                    Utils.showError('Failed to archive ticket: ' + err.message); 
                }
            } else if (action === 'unarchive-ticket') {
                try { 
                    await API.unarchiveTicket(ticketId); 
                    DataLoader.loadTickets(); 
                } catch (err) { 
                    alert('Failed to unarchive ticket: ' + err.message); 
                }
            } else if (action === 'mark-important-ticket') {
                try { 
                    await API.markTicketImportant(ticketId, true); 
                    DataLoader.loadTickets(); 
                } catch (err) { 
                    alert('Failed to mark as important: ' + err.message); 
                }
            } else if (action === 'mark-normal-ticket') {
                try { 
                    await API.markTicketImportant(ticketId, false); 
                    DataLoader.loadTickets(); 
                } catch (err) { 
                    alert('Failed to mark as normal: ' + err.message); 
                }
            } else if (action === 'delete-ticket') {
                const ok = await UI.confirm({ title: 'Delete Ticket', message: 'Delete this ticket permanently?' });
                if (!ok) return;
                try { 
                    await API.deleteTicket(ticketId); 
                    DataLoader.loadTickets(); 
                } catch (err) { 
                    alert('Failed to delete ticket: ' + err.message); 
                }
            }
        });
    }

    // ==================== Ticket Filter Event Listeners ====================
    
    const ticketStatusFilter = document.getElementById('ticketStatusFilter');
    const ticketPriorityFilter = document.getElementById('ticketPriorityFilter');
    const ticketSearchInput = document.getElementById('ticketSearchInput');

    if (ticketStatusFilter) {
        ticketStatusFilter.addEventListener('change', () => {
            DataLoader.loadTickets();
        });
    }

    if (ticketPriorityFilter) {
        ticketPriorityFilter.addEventListener('change', () => {
            DataLoader.loadTickets();
        });
    }

    if (ticketSearchInput) {
        ticketSearchInput.addEventListener('input', Utils.debounce(() => {
            DataLoader.loadTickets();
        }, 300));
    }

    // ==================== FAQ Table Event Listeners ====================
    
    const faqsTable = document.getElementById('faqsTable');
    if (faqsTable) {
        faqsTable.addEventListener('click', async (e) => {
            const { API } = await import('./api.js');
            
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const faqId = btn.dataset.faq;
            
            if (action === 'edit-faq') {
                window.editFAQ(faqId);
            } else if (action === 'toggle-faq') {
                const ok = await UI.confirm({ 
                    title: 'Toggle FAQ Status', 
                    message: 'Are you sure you want to change the status of this FAQ?' 
                });
                if (!ok) return;
                try { 
                    await API.toggleFAQStatus(faqId); 
                    DataLoader.loadFAQs(); 
                } catch (err) { 
                    alert('Failed to toggle FAQ status: ' + err.message); 
                }
            } else if (action === 'delete-faq') {
                const ok = await UI.confirm({ 
                    title: 'Delete FAQ', 
                    message: 'Permanently delete this FAQ?' 
                });
                if (!ok) return;
                try { 
                    await API.hardDeleteFAQ(faqId); 
                    DataLoader.loadFAQs(); 
                } catch (err) { 
                    alert('Failed to delete FAQ: ' + err.message); 
                }
            }
        });
    }

    // ==================== FAQ Form Event Listeners ====================
    
    const saveFAQBtn = document.getElementById('saveFAQ');
    if (saveFAQBtn) {
        saveFAQBtn.addEventListener('click', async () => {
            const { API } = await import('./api.js');
            
            const form = document.getElementById('faqForm');
            const qEl = document.getElementById('faqQuestion');
            const aEl = document.getElementById('faqAnswer');
            const pEl = document.getElementById('faqPatterns');
            const cEl = document.getElementById('faqCategory');
            const prEl = document.getElementById('faqPriority');
            const question = (qEl?.value || '').trim();
            const answer = (aEl?.value || '').trim();
            const patternsText = (pEl?.value || '').trim();
            const category = (cEl?.value || 'general');
            const priority = parseInt(prEl?.value || '5');
            const editingId = form.dataset.faqId || '';

            // Client-side validation
            if (question.length < 5 || question.length > 500) {
                alert('Question must be between 5-500 characters');
                return;
            }
            
            if (answer.length < 10 || answer.length > 2000) {
                alert('Answer must be between 10-2000 characters');
                return;
            }
            
            if (!patternsText) {
                alert('At least one search pattern is required');
                return;
            }
            
            const patterns = patternsText.split(',').map(p => p.trim()).filter(p => p);
            if (patterns.length === 0) {
                alert('At least one valid search pattern is required');
                return;
            }
            
            for (const pattern of patterns) {
                if (pattern.length < 2 || pattern.length > 200) {
                    alert('Each pattern must be between 2-200 characters');
                    return;
                }
            }
            
            try {
                const faqData = {
                    question,
                    answer,
                    patterns,
                    category,
                    priority
                };
                if (editingId) {
                    await API.updateFAQ(editingId, faqData);
                } else {
                    await API.createFAQ(faqData);
                }
                UI.hideModal('faqModal');
                form.reset();
                delete form.dataset.faqId;
                DataLoader.loadFAQs();
            } catch (error) {
                alert('Failed to save FAQ: ' + error.message);
            }
        });
    }

    // Add FAQ button
    const addFAQBtn = document.getElementById('addFAQBtn');
    if (addFAQBtn) {
        addFAQBtn.addEventListener('click', () => {
            document.getElementById('faqModalTitle').textContent = 'Add FAQ';
            document.getElementById('faqForm').reset();
            UI.showModal('faqModal');
        });
    }

    // Cancel FAQ button
    const cancelFAQBtn = document.getElementById('cancelFAQ');
    if (cancelFAQBtn) {
        cancelFAQBtn.addEventListener('click', () => {
            UI.hideModal('faqModal');
        });
    }

    // ==================== Bulk Import Event Listeners ====================
    
    const bulkBtn = document.getElementById('bulkImportBtn');
    if (bulkBtn) {
        bulkBtn.addEventListener('click', () => {
            // const { BulkUpload } = await import('./bulk-upload.js');
            BulkUpload.reset();
            UI.showModal('bulkUploadModal');
        });
    }

    // ==================== Filter Event Listeners ====================
    
    ['chatStatusFilter', 'chatTicketFilter', 'chatImportantFilter', 'ticketStatusFilter', 'ticketPriorityFilter', 'faqCategoryFilter', 'faqStatusFilter'].forEach(filterId => {
        const filter = document.getElementById(filterId);
        if (filter) {
            filter.addEventListener('change', () => {
                const currentSection = document.querySelector('.nav-item.active')?.getAttribute('data-section') || 'dashboard';
                DataLoader.loadSectionData(currentSection);
            });
        }
    });

    // ==================== Archive Toggle Event Listeners ====================
    
    const viewArchivesBtn = document.getElementById('viewArchivesBtn');
    if (viewArchivesBtn) {
        viewArchivesBtn.addEventListener('click', () => {
            window.showingArchives = true;
            document.getElementById('viewArchivesBtn').style.display = 'none';
            document.getElementById('viewActiveBtn').style.display = 'inline-flex';
            document.getElementById('pageTitle').textContent = 'Archived Chats';
            document.getElementById('pageSubtitle').textContent = 'View archived chat conversations';
            DataLoader.loadChats();
        });
    }

    const viewActiveBtn = document.getElementById('viewActiveBtn');
    if (viewActiveBtn) {
        viewActiveBtn.addEventListener('click', () => {
            window.showingArchives = false;
            document.getElementById('viewArchivesBtn').style.display = 'inline-flex';
            document.getElementById('viewActiveBtn').style.display = 'none';
            document.getElementById('pageTitle').textContent = 'Chat History';
            document.getElementById('pageSubtitle').textContent = 'View and analyze chat conversations';
            DataLoader.loadChats();
        });
    }

    // Ticket archive view toggle buttons
    const viewTicketArchivesBtn = document.getElementById('viewTicketArchivesBtn');
    if (viewTicketArchivesBtn) {
        viewTicketArchivesBtn.addEventListener('click', () => {
            window.showingTicketArchives = true;
            document.getElementById('viewTicketArchivesBtn').style.display = 'none';
            document.getElementById('viewActiveTicketsBtn').style.display = 'inline-flex';
            document.getElementById('pageTitle').textContent = 'Archived Tickets';
            document.getElementById('pageSubtitle').textContent = 'View archived support tickets';
            DataLoader.loadTickets();
        });
    }

    const viewActiveTicketsBtn = document.getElementById('viewActiveTicketsBtn');
    if (viewActiveTicketsBtn) {
        viewActiveTicketsBtn.addEventListener('click', () => {
            window.showingTicketArchives = false;
            document.getElementById('viewTicketArchivesBtn').style.display = 'inline-flex';
            document.getElementById('viewActiveTicketsBtn').style.display = 'none';
            document.getElementById('pageTitle').textContent = 'Support Tickets';
            document.getElementById('pageSubtitle').textContent = 'Manage and track support tickets';
            DataLoader.loadTickets();
        });
    }

    // ==================== Admin Management Event Listeners ====================
    
    const addAdminBtn = document.getElementById('addAdminBtn');
    if (addAdminBtn) {
        addAdminBtn.addEventListener('click', window.addAdmin);
    }

    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', window.changePassword);
    }

    // Initialize admin form listeners
    initializeAdminFormListeners();

    // ==================== Admin Management Buttons (Event Delegation) ====================
    
    document.addEventListener('click', (e) => {
        if (e.target.closest('.edit-admin-btn')) {
            const btn = e.target.closest('.edit-admin-btn');
            const adminId = btn.dataset.adminId;
            window.editAdmin(adminId);
        }
        
        if (e.target.closest('.permissions-admin-btn')) {
            const btn = e.target.closest('.permissions-admin-btn');
            const adminId = btn.dataset.adminId;
            window.managePermissions(adminId);
        }
        
        if (e.target.closest('.toggle-admin-btn')) {
            const btn = e.target.closest('.toggle-admin-btn');
            const adminId = btn.dataset.adminId;
            const currentStatus = btn.dataset.status === 'true' ? 'active' : 'inactive';
            window.toggleAdmin(adminId, currentStatus);
        }
        
        if (e.target.closest('.delete-admin-btn')) {
            const btn = e.target.closest('.delete-admin-btn');
            const adminId = btn.dataset.adminId;
            window.deleteAdmin(adminId);
        }
    });

    // ==================== Activity View Buttons (Event Delegation) ====================
    
    document.addEventListener('click', (e) => {
        if (e.target.closest('.view-activity-btn')) {
            const btn = e.target.closest('.view-activity-btn');
            const type = btn.dataset.type;
            const id = btn.dataset.id;
            window.viewActivity(type, id);
        }
    });

    // ==================== Search Inputs ====================
    
    ['chatSearchInput', 'ticketSearchInput', 'faqSearchInput'].forEach(searchId => {
        const search = document.getElementById(searchId);
        if (search) {
            search.addEventListener('input', Utils.debounce(() => {
                const currentSection = document.querySelector('.nav-item.active')?.getAttribute('data-section') || 'dashboard';
                DataLoader.loadSectionData(currentSection);
            }, 500));
        }
    });

    // ==================== Form Submission & Cancel Handlers ====================
    
    // Global Form Submission Handler for Reply Form
    document.addEventListener('submit', async (e) => {
        if (e.target.id === 'ticketReplyForm') {
            e.preventDefault();
            
            // Get ticketId from the form or data attribute
            const ticketId = e.target.getAttribute('data-ticket-id');
            
            // Call the handler
            if (window.handleTicketReply) {
                try {
                    await window.handleTicketReply(e, ticketId);
                } catch (error) {
                    console.error('Handler error:', error);
                }
            }
            
            return false;
        }
    }, true);

    // Handle Cancel Button Clicks
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('cancel-reply-btn')) {
            const modal = document.getElementById('ticketModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }
    }, true);

    BulkUpload.init();
    console.log('✅ All event handlers initialized');
}
