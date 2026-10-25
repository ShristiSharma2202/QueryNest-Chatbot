/**
 * Data Loaders Module
 * Loads data for all sections: dashboard, chats, tickets, FAQs, admins
 */

import { API } from './api.js';
import { Utils } from './utils.js';
import { UI } from './ui-manager.js';

export const DataLoader = {
    /**
     * Load dashboard data and update statistics
     */
    loadDashboard: async () => {
        try {
            const data = await API.getDashboard();

            // Update stats
            const totalUsersEl = document.getElementById('totalUsers');
            const activeUsersEl = document.getElementById('activeUsers');
            const totalChatsEl = document.getElementById('totalChats');
            const totalTicketsEl = document.getElementById('totalTickets');
            const totalFAQsEl = document.getElementById('totalFAQs');

            if (totalUsersEl) totalUsersEl.textContent = data.data.summary.totalUsers || 0;
            if (activeUsersEl) activeUsersEl.textContent = data.data.summary.activeUsers || 0;
            if (totalChatsEl) totalChatsEl.textContent = data.data.summary.totalChats || 0;
            if (totalTicketsEl) totalTicketsEl.textContent = data.data.summary.totalTickets || 0;
            if (totalFAQsEl) totalFAQsEl.textContent = data.data.summary.totalFAQs || 0;

            // Update satisfaction rating
            const avgSatisfaction = data.data.summary.averageSatisfaction;
            const avgSatisfactionEl = document.getElementById('averageSatisfaction');
            if (avgSatisfactionEl) {
                avgSatisfactionEl.textContent = avgSatisfaction ?
                    avgSatisfaction.toFixed(1) : '-';
            }


            // Load top FAQs (map fields to expected structure)
            DataLoader.loadTopFAQs(
                (data.data.topFAQs || []).map(f => ({
                    question: f.question,
                    category: f.category,
                    usage: { hitCount: (f.usage?.hitCount) || f.hitCount || 0 }
                }))
            );

            // Load recent ratings (fix: use correct path)
            DataLoader.loadRecentRatings((data.data.recentActivity && data.data.recentActivity.ratings) || []);

            // Load user analytics
            DataLoader.loadUserAnalytics(data.data.userAnalytics || {});

        } catch (error) {
            Utils.showError(error.message || 'Failed to load dashboard data', null, error);
        }
    },


    /**
     * Load and display top FAQs
     * @param {Array} faqs - FAQs data
     */
    loadTopFAQs: (faqs) => {
        const container = document.getElementById('topFAQs');

        if (!faqs || !faqs.length) {
            container.innerHTML = '<div class="loading">No FAQ data</div>';
            return;
        }

        container.innerHTML = faqs.map(faq => `
            <div class="faq-item">
                <div class="faq-question">${faq.question}</div>
                <div class="faq-stats">
                    <span>${faq.usage?.hitCount || 0} hits</span>
                    <span>${faq.category}</span>
                </div>
            </div>
        `).join('');
    },

    /**
     * Load and display recent ratings
     * @param {Array} ratings - Ratings data
     */
    loadRecentRatings: (ratings) => {
        const container = document.getElementById('recentRatings');

        if (!ratings || !ratings.length) {
            container.innerHTML = '<div class="loading">No ratings yet</div>';
            return;
        }

        container.innerHTML = ratings.map(rating => {
            const stars = '⭐'.repeat(rating.rating);
            const sessionShort = rating.sessionId ? rating.sessionId.substring(0, 8) + '...' : 'Unknown';

            return `
                <div class="rating-item">
                    <div class="rating-info">
                        <div class="rating-session">Session: ${sessionShort}</div>
                        <div class="rating-time">${Utils.formatDate(rating.timestamp)}</div>
                    </div>
                    <div class="rating-stars">
                        ${stars}
                        <span class="rating-value">${rating.rating}/5</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Load chats data
     * @param {Object} filters - Filter parameters
     */
    loadChats: async (filters = {}) => {
        const tbody = document.querySelector('#chatsTable tbody');
        const chatCountText = document.getElementById('chatCountText');
        const perPageSelect = document.getElementById('chatsPerPageSelect');
        const paginationDiv = document.getElementById('chatsPagination');
        const pageInfoSpan = document.getElementById('chatsPageInfo');
        let page = filters.page || window.chatsPage || 1;
        let limit = filters.limit || window.chatsPerPage || 10;
        if (perPageSelect && perPageSelect.value) limit = parseInt(perPageSelect.value, 10);
        window.chatsPerPage = limit;
        window.chatsPage = page;
        filters.limit = limit;
        filters.page = page;
        Utils.showLoading(tbody, 'Loading chats...');

        try {
            const params = {
                status: document.getElementById('chatStatusFilter').value || '',
                ticketStatus: document.getElementById('chatTicketFilter').value || '',
                showArchives: window.showingArchives ? 'true' : 'false',
                importantStatus: document.getElementById('chatImportantFilter').value || '',
                search: document.getElementById('chatSearchInput').value || '',
                limit,
                page
            };
            const data = await API.getChats(params);
            const total = data.data.pagination?.total || data.data.total || data.data.chats.length;
            const totalPages = data.data.pagination?.pages || Math.ceil(total / limit) || 1;
            if (chatCountText) {
                chatCountText.textContent = `Total Chats: ${total}`;
            }
            if (!data.data.chats.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center">No chats found</td>
                    </tr>
                `;
                if (paginationDiv) paginationDiv.innerHTML = '';
                if (pageInfoSpan) pageInfoSpan.textContent = '';
                return;
            }
            tbody.innerHTML = data.data.chats.map(chat => {
                let statusDisplay = Utils.createStatusBadge(chat.status || 'active');
                if (chat.status === 'ended' && chat.endedReason === 'inactivity') {
                    statusDisplay = Utils.createStatusBadge('ended_inactivity');
                }
                return `
                <tr>
                    <td><strong>${chat.sessionId}</strong></td>
                    <td>${chat.messageCount}</td>
                    <td>${statusDisplay}</td>
                    <td>${Utils.formatDuration(chat.duration || 0)}</td>
                    <td>${chat.rating ? '⭐'.repeat(chat.rating) : '-'}</td>
                    <td>
                        ${chat.hasTicket ?
                    `<a href="#" class="ticket-link" data-action="view-ticket" data-ticket="${chat.ticketId}">Ticket: ${chat.ticketId}</a>` :
                    '<span class="text-muted">-</span>'
                }
                    </td>
                    <td>
                        ${chat.isImportant ?
                    '<span class="status-badge status-important">⭐</span>' :
                    '<span class="text-muted">-</span>'
                }
                    </td>
                    <td>${Utils.formatDateAndTime(chat.createdAt)}</td>
                    <td>
                        <button class="action-btn" data-tooltip="View" data-action="view-chat" data-session="${chat.sessionId}" data-conv="${chat.conversationId}"><i class="fas fa-eye"></i></button>
                        ${chat.status === 'active' ?
                    `<button class="action-btn" data-tooltip="End" data-action="end-chat" data-conv="${chat.conversationId}"><i class="fas fa-stop"></i></button>` :
                    ''
                }
                        ${chat.isArchived ?
                    `<button class="action-btn" data-tooltip="Unarchive" data-action="unarchive-chat" data-conv="${chat.conversationId}"><i class="fas fa-archive"></i></button>` :
                    `<button class="action-btn" data-tooltip="Archive" data-action="archive-chat" data-conv="${chat.conversationId}"><i class="fas fa-archive"></i></button>`
                }
                        ${chat.isImportant ?
                    `<button class="action-btn" data-tooltip="Mark as Normal" data-action="mark-normal" data-conv="${chat.conversationId}"><i class="fas fa-star"></i></button>` :
                    `<button class="action-btn" data-tooltip="Mark as Important" data-action="mark-important" data-conv="${chat.conversationId}"><i class="fas fa-star"></i></button>`
                }
                        <button class="action-btn danger" data-tooltip="Delete" data-action="delete-chat" data-conv="${chat.conversationId}"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
                `;
            }).join('');
            // Pagination controls
            if (paginationDiv) {
                let html = '';
                html += `<button class="btn-secondary" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} title="Previous"><i class="fas fa-chevron-left"></i></button>`;
                html += `<button class="btn-secondary" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} title="Next"><i class="fas fa-chevron-right"></i></button>`;
                paginationDiv.innerHTML = html;
                Array.from(paginationDiv.querySelectorAll('button[data-page]')).forEach(btn => {
                    btn.onclick = (e) => {
                        const newPage = parseInt(btn.getAttribute('data-page'), 10);
                        if (newPage >= 1 && newPage <= totalPages) {
                            DataLoader.loadChats({ ...filters, page: newPage, limit });
                        }
                    };
                });
            }
            // Show x-y of total
            if (pageInfoSpan) {
                const start = (page - 1) * limit + 1;
                const end = Math.min(page * limit, total);
                pageInfoSpan.textContent = `${start}-${end} of ${total}`;
            }
            // Per page select event
            if (perPageSelect) {
                perPageSelect.onchange = () => {
                    DataLoader.loadChats({ ...filters, page: 1, limit: parseInt(perPageSelect.value, 10) });
                };
            }
        } catch (error) {
            Utils.showError(error.message || 'Failed to load chats', null, error);
            if (chatCountText) {
                chatCountText.textContent = 'Error loading chats';
            }
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center">Error loading chats: ${error.message}</td>
                </tr>
            `;
            if (paginationDiv) paginationDiv.innerHTML = '';
        }
    },

    /**
     * Load tickets data
     * @param {Object} filters - Filter parameters
     */
    loadTickets: async (filters = {}) => {
        const tbody = document.querySelector('#ticketsTable tbody');
        Utils.showLoading(tbody, 'Loading tickets...');
        const ticketsPerPageSelect = document.getElementById('ticketsPerPageSelect');
        const pageInfoSpan = document.getElementById('ticketsPageInfo');
        const paginationDiv = document.getElementById('ticketsPagination');

        // FIX: Use consistent pagination state management like chats/faqs
        let currentPage = filters.page || window.ticketsPage || 1;
        let limit = filters.limit || window.ticketsPerPage || 20;

        if (ticketsPerPageSelect && ticketsPerPageSelect.value) {
            limit = parseInt(ticketsPerPageSelect.value, 10);
        }

        // Store state globally for consistency
        window.ticketsPerPage = limit;
        window.ticketsPage = currentPage;
        filters.limit = limit;
        filters.page = currentPage;


        try {
            const params = {
                status: document.getElementById('ticketStatusFilter').value || '',
                priority: document.getElementById('ticketPriorityFilter').value || '',
                search: document.getElementById('ticketSearchInput').value || '',
                showArchives: window.showingTicketArchives ? 'true' : 'false',
                limit,
                page: currentPage
            };

            // Always fetch all tickets for stats (ignore pagination)
            const allParams = { ...params, limit: 10000, page: 1 };
            const allData = await API.getTickets(allParams);
            const allTickets = allData.data.tickets || [];
            const totalTickets = allData.data.pagination.total;
            // Calculate priority stats from all tickets
            const priorityStats = { total: 0, high: 0, medium: 0, low: 0 };
            allTickets.forEach(ticket => {
                if (ticket.priority === 'high') priorityStats.high++;
                if (ticket.priority === 'medium') priorityStats.medium++;
                if (ticket.priority === 'low') priorityStats.low++;
                priorityStats.total++;
            });

            // Now fetch paginated tickets for table
            const data = await API.getTickets(params);
            const totalPages = data.data.pagination.pages;

            if (!data.data.tickets.length) {
                tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">No tickets found</td>
                </tr>
            `;
                if (paginationDiv) paginationDiv.innerHTML = '';
                if (pageInfoSpan) pageInfoSpan.textContent = '';

                // Update stats
                const totalTicketsCountEl = document.getElementById('totalTicketsCount');
                const highPriorityCountEl = document.getElementById('highPriorityCount');
                const mediumPriorityCountEl = document.getElementById('mediumPriorityCount');
                const lowPriorityCountEl = document.getElementById('lowPriorityCount');

                if (totalTicketsCountEl) totalTicketsCountEl.textContent = priorityStats.total;
                if (highPriorityCountEl) highPriorityCountEl.textContent = priorityStats.high;
                if (mediumPriorityCountEl) mediumPriorityCountEl.textContent = priorityStats.medium;
                if (lowPriorityCountEl) lowPriorityCountEl.textContent = priorityStats.low;

                const ticketCountText = document.getElementById('ticketCountText');
                if (ticketCountText) ticketCountText.textContent = 'No tickets found';
                return;
            }

            // Update stats elements
            const totalTicketsCountEl = document.getElementById('totalTicketsCount');
            const highPriorityCountEl = document.getElementById('highPriorityCount');
            const mediumPriorityCountEl = document.getElementById('mediumPriorityCount');
            const lowPriorityCountEl = document.getElementById('lowPriorityCount');

            if (totalTicketsCountEl) totalTicketsCountEl.textContent = priorityStats.total;
            if (highPriorityCountEl) highPriorityCountEl.textContent = priorityStats.high;
            if (mediumPriorityCountEl) mediumPriorityCountEl.textContent = priorityStats.medium;
            if (lowPriorityCountEl) lowPriorityCountEl.textContent = priorityStats.low;

            const ticketCountText = document.getElementById('ticketCountText');
            if (ticketCountText) {
                ticketCountText.textContent = `Total Tickets: ${priorityStats.total}`;
            }

            // Render table
            tbody.innerHTML = data.data.tickets.map(ticket => `
            <tr>
                <td><strong>${ticket.ticketId}</strong></td>
                <td>
                    <span class="status-badge ${ticket.status === 'closed' ? '' : 'clickable-status'}" 
                          data-ticket="${ticket.ticketId}" 
                          data-current-status="${ticket.status}"
                          title="${ticket.status === 'closed' ? 'Ticket is closed' : 'Click to change status'}">
                        ${Utils.createStatusBadge(ticket.status).replace(/<[^>]*>/g, '')}
                    </span>
                </td>
                <td>
                    <span class="priority-badge clickable-priority" 
                          data-ticket="${ticket.ticketId}" 
                          data-current-priority="${ticket.priority}"
                          title="Click to change priority">
                        ${Utils.createPriorityBadge(ticket.priority).replace(/<[^>]*>/g, '')}
                    </span>
                </td>
                <td>
                    <div><strong>${ticket.name}</strong></div>
                    <div class="text-xs">${ticket.email}</div>
                    <div class="text-xs">${ticket.mobile || '-'}</div>
                </td>
                <td>
                    ${ticket.isImportant ?
                    '<span class="status-badge status-important">⭐</span>' :
                    '<span class="text-muted">-</span>'
                }
                </td>
                <td>${Utils.formatDateAndTime(ticket.createdAt)}</td>
                <td>
                    <button class="action-btn" data-tooltip="View" data-action="view-ticket" data-ticket="${ticket.ticketId}"><i class="fas fa-eye"></i></button>
                    ${ticket.isArchived ?
                    `<button class="action-btn" data-tooltip="Unarchive" data-action="unarchive-ticket" data-ticket="${ticket.ticketId}"><i class="fas fa-archive"></i></button>` :
                    `<button class="action-btn" data-tooltip="Archive" data-action="archive-ticket" data-ticket="${ticket.ticketId}"><i class="fas fa-archive"></i></button>`
                }
                    ${ticket.isImportant ?
                    `<button class="action-btn" data-tooltip="Mark as Normal" data-action="mark-normal-ticket" data-ticket="${ticket.ticketId}"><i class="fas fa-star"></i></button>` :
                    `<button class="action-btn" data-tooltip="Mark as Important" data-action="mark-important-ticket" data-ticket="${ticket.ticketId}"><i class="fas fa-star"></i></button>`
                }
                    <button class="action-btn danger" data-tooltip="Delete" data-action="delete-ticket" data-ticket="${ticket.ticketId}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        
            if (paginationDiv) {
                let html = '';
                // Previous button
                html += `<button class="btn-secondary" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''} title="Previous"><i class="fas fa-chevron-left"></i></button>`;
                // Next button
                html += `<button class="btn-secondary" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''} title="Next"><i class="fas fa-chevron-right"></i></button>`;
                paginationDiv.innerHTML = html;

                // Add event listeners
                Array.from(paginationDiv.querySelectorAll('button[data-page]')).forEach(btn => {
                    btn.onclick = (e) => {
                        const newPage = parseInt(btn.getAttribute('data-page'), 10);
                        if (newPage >= 1 && newPage <= totalPages) {
                            DataLoader.loadTickets({ ...filters, page: newPage, limit });
                        }
                    };
                });
            }

            // FIX: Show x-y of total (same as FAQs/Chats)
            if (pageInfoSpan) {
                const start = (currentPage - 1) * limit + 1;
                const end = Math.min(currentPage * limit, totalTickets);
                pageInfoSpan.textContent = `${start}-${end} of ${totalTickets}`;
            }

            // FIX: Per-page change event (remove the _paginationBound flag logic)
            if (ticketsPerPageSelect) {
                ticketsPerPageSelect.onchange = () => {
                    DataLoader.loadTickets({ ...filters, page: 1, limit: parseInt(ticketsPerPageSelect.value, 10) });
                };
            }

        } catch (error) {
            Utils.showError(error.message || 'Failed to load tickets', null, error);
            tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">Error loading tickets: ${error.message}</td>
            </tr>
        `;
            if (paginationDiv) paginationDiv.innerHTML = '';
        }
    },

    /**
     * Load FAQs data
     * @param {Object} filters - Filter parameters
     */
    loadFAQs: async (filters = {}) => {
        // Sorting: get from filters or localStorage
        const { getFaqSortState, updateFaqSortVisuals } = await import('./main.js');
        let sortField = filters.sortField, sortDirection = filters.sortDirection;
        if (!sortField || !sortDirection) {
            const state = getFaqSortState();
            sortField = state.field;
            sortDirection = state.direction;
        }
        filters.sortField = sortField;
        filters.sortDirection = sortDirection;
        // Add search value from input
        filters.search = document.getElementById('faqSearchInput')?.value || '';
        const tbody = document.querySelector('#faqsTable tbody');
        const faqCountText = document.getElementById('faqCountText');
        const perPageSelect = document.getElementById('faqsPerPageSelect');
        const paginationDiv = document.getElementById('faqsPagination');
        const pageInfoSpan = document.getElementById('faqsPageInfo');
        let page = filters.page || window.faqsPage || 1;
        let limit = filters.limit || window.faqsPerPage || 10;
        if (perPageSelect && perPageSelect.value) limit = parseInt(perPageSelect.value, 10);
        window.faqsPerPage = limit;
        window.faqsPage = page;
        filters.limit = limit;
        filters.page = page;
        Utils.showLoading(tbody, 'Loading FAQs...');

        try {
            const data = await API.getFAQs(filters);
            // Use correct total count from API (pagination.count)
            const total = data.data.pagination?.count || data.data.total || data.data.faqs.length;
            const totalPages = data.data.pagination?.total || Math.ceil(total / limit) || 1;
            // Always show total FAQs (not just current page)
            if (faqCountText) {
                faqCountText.textContent = `Total FAQs: ${total}`;
            }

            if (!data.data.faqs.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center">No FAQs found</td>
                    </tr>
                `;
                if (paginationDiv) paginationDiv.innerHTML = '';
                if (pageInfoSpan) pageInfoSpan.textContent = '';
                return;
            }

            // Sort client-side if API does not support it
            let faqs = data.data.faqs;
            if (!data.data.sorted && sortField && sortDirection) {
                faqs = faqs.slice().sort((a, b) => {
                    let valA, valB;
                    switch (sortField) {
                        case 'updated':
                            valA = new Date(a.updatedAt);
                            valB = new Date(b.updatedAt);
                            break;
                        case 'hitCount':
                            valA = a.usage?.hitCount || 0;
                            valB = b.usage?.hitCount || 0;
                            break;
                        case 'rating':
                            valA = a.usage?.averageRating || 0;
                            valB = b.usage?.averageRating || 0;
                            break;
                        case 'question':
                            valA = (a.question || '').toLowerCase();
                            valB = (b.question || '').toLowerCase();
                            break;
                        default:
                            return 0;
                    }
                    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            tbody.innerHTML = faqs.map(faq => `
                <tr>
                    <td><strong>${faq.question}</strong></td>
                    <td><span class="status-badge">${faq.category}</span></td>
                    <td>${faq.usage?.hitCount || 0}</td>
                    <td>${Utils.createStarRating(faq.usage?.averageRating, faq.usage?.ratings?.length || 0)}</td>
                    <td>${Utils.createStatusBadge(faq.isActive ? 'active' : 'inactive')}</td>
                    <td>${Utils.formatDateAndTime(faq.updatedAt)}</td>
                    <td>
                        <button class="action-btn" data-action="edit-faq" data-faq="${faq._id}" data-tooltip="Edit FAQ"><i class="fas fa-edit"></i></button>
                        <button class="action-btn ${faq.isActive ? 'warning' : 'success'}" data-action="toggle-faq" data-faq="${faq._id}" data-tooltip="${faq.isActive ? 'Deactivate' : 'Activate'} FAQ">
                            <i class="fas fa-${faq.isActive ? 'eye-slash' : 'eye'}"></i>
                        </button>
                        <button class="action-btn danger" data-action="delete-faq" data-faq="${faq._id}" data-tooltip="Delete FAQ"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');

            // Update sort visuals (arrows, highlight)
            setTimeout(() => {
                updateFaqSortVisuals();
            }, 0);

            // Render improved pagination controls (bottom right)
            if (paginationDiv) {
                let html = '';
                // Prev button
                html += `<button class="btn-secondary" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} title="Previous"><i class="fas fa-chevron-left"></i></button>`;
                // Next button
                html += `<button class="btn-secondary" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} title="Next"><i class="fas fa-chevron-right"></i></button>`;
                paginationDiv.innerHTML = html;
                // Add event listeners
                Array.from(paginationDiv.querySelectorAll('button[data-page]')).forEach(btn => {
                    btn.onclick = (e) => {
                        const newPage = parseInt(btn.getAttribute('data-page'), 10);
                        if (newPage >= 1 && newPage <= totalPages) {
                            DataLoader.loadFAQs({ ...filters, page: newPage, limit });
                        }
                    };
                });
            }
            // Show x-y of total
            if (pageInfoSpan) {
                const start = (page - 1) * limit + 1;
                const end = Math.min(page * limit, total);
                pageInfoSpan.textContent = `${start}-${end} of ${total}`;
            }
            // Per page select event
            if (perPageSelect) {
                perPageSelect.onchange = () => {
                    DataLoader.loadFAQs({ ...filters, page: 1, limit: parseInt(perPageSelect.value, 10) });
                };
            }
        } catch (error) {
            Utils.showError(error.message || 'Failed to load FAQs', null, error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">Error loading FAQs: ${error.message}</td>
                </tr>
            `;
            if (paginationDiv) paginationDiv.innerHTML = '';
        }
    },

    /**
     * Load user analytics
     * @param {Object} analytics - Analytics data
     */
    loadUserAnalytics: (analytics) => {
        const container = document.getElementById('userAnalytics');
        if (!container) return;

        if (!analytics || Object.keys(analytics).length === 0) {
            container.innerHTML = '<div class="no-data">No user data available</div>';
            return;
        }

        const { totalUsers, activeUsers, engagement } = analytics;

        let html = `
            <div class="user-stats-grid">
                <div class="user-stat-item">
                    <div class="stat-label">Total Users</div>
                    <div class="stat-value">${totalUsers || 0}</div>
                </div>
                <div class="user-stat-item">
                    <div class="stat-label">Active (24h)</div>
                    <div class="stat-value">${activeUsers || 0}</div>
                </div>
                <div class="user-stat-item">
                    <div class="stat-label">Avg Chats/User</div>
                    <div class="stat-value">${engagement?.avgChatsPerUser ? engagement.avgChatsPerUser.toFixed(1) : '0'}</div>
                </div>
                <div class="user-stat-item">
                    <div class="stat-label">Avg Tickets/User</div>
                    <div class="stat-value">${engagement?.avgTicketsPerUser ? engagement.avgTicketsPerUser.toFixed(1) : '0'}</div>
                </div>
            </div>
        `;
        container.innerHTML = html;
    },

    /**
     * Load account information
     */
    loadAccount: async () => {
        try {
            // Update account information
            const currentAdmin = window.currentAdmin;
            let fullAdminData = currentAdmin;

            if (currentAdmin) {
                // Fetch full admin data from API to get createdAt and other fields
                try {
                    const response = await API.request(`/api/admin/${currentAdmin.id}`);
                    if (response.data && response.data.admin) {
                        fullAdminData = response.data.admin;
                    }
                } catch (error) {
                    // Using cached data as fallback
                }

                const accountNameEl = document.getElementById('accountName');
                const accountEmailEl = document.getElementById('accountEmail');
                const adminRoleEl = document.getElementById('adminRole');
                const accountRoleEl = document.querySelector('.account-role');

                if (accountNameEl) accountNameEl.textContent = fullAdminData.name || 'Admin User';
                if (accountEmailEl) accountEmailEl.textContent = fullAdminData.email || fullAdminData.username || 'admin@QueryNest.com';

                // Update role display (always title case)
                const roleDisplay = fullAdminData.role === 'super_admin' ? 'Super Admin' : 'Administrator';
                if (adminRoleEl) adminRoleEl.textContent = roleDisplay;
                if (accountRoleEl) accountRoleEl.textContent = roleDisplay;
            }

            // Set member since date using full admin data
            const memberSinceEl = document.getElementById('memberSince');
            if (memberSinceEl && fullAdminData?.createdAt) {
                memberSinceEl.textContent = Utils.formatShortDate(fullAdminData.createdAt);
            }


            // Set account status using full admin data
            let accountStatus = 'Active';
            if (fullAdminData && fullAdminData.isActive === false) {
                accountStatus = 'Disabled';
            } else if (fullAdminData && fullAdminData.role === 'super_admin') {
                accountStatus = 'Super Admin';
            } else {
                accountStatus = 'Active';
            }
            const lastLoginEl = document.getElementById('lastLogin');
            if (lastLoginEl) lastLoginEl.textContent = accountStatus;

            // Handle admin management section based on permissions
            const adminManagement = document.querySelector('.admin-management');
            const adminList = document.getElementById('adminList');
            const addAdminBtn = document.getElementById('addAdminBtn');

            const { PermissionManager } = await import('./permissions.js');

            if (adminManagement) {
                if (PermissionManager.hasPermission('canManageAdmins')) {
                    // User can manage admins - load the admin list
                    await DataLoader.loadAdminList();
                    adminManagement.style.display = 'block';

                    // Enable the Add Admin button
                    if (addAdminBtn) {
                        addAdminBtn.disabled = false;
                        addAdminBtn.style.opacity = '1';
                        addAdminBtn.title = 'Add a new administrator to the system';
                    }
                } else {
                    // User cannot manage admins - show restricted access message
                    if (adminList) {
                        adminList.innerHTML = `
                            <div class="restricted-access-message">
                                <div class="restricted-icon">
                                    <i class="fas fa-lock"></i>
                                </div>
                                <h4>Access Restricted</h4>
                                <p>You don't have permission to manage admin accounts.</p>
                                <p>Contact your super administrator for access.</p>
                            </div>
                        `;
                    }

                    // Disable the Add Admin button
                    if (addAdminBtn) {
                        addAdminBtn.disabled = true;
                        addAdminBtn.style.opacity = '0.6';
                        addAdminBtn.setAttribute('data-tooltip', 'You don\'t have permission to add admins');
                        addAdminBtn.title = '';
                    }

                    adminManagement.style.display = 'block';
                }
            }
        } catch (error) {
            Utils.showError(error.message || 'Failed to load account information', null, error);
        }
    },

    /**
     * Load list of admins
     */
    loadAdminList: async () => {
        try {
            const response = await API.request('/api/admin/list');
            const admins = response.data.admins || [];
            const currentAdmin = window.currentAdmin;

            const container = document.getElementById('adminList');
            if (!container) return;

            // Filter out current user from the list
            const otherAdmins = admins.filter(admin => {
                // Try multiple ways to identify the current user
                const isCurrentUserById = admin._id === currentAdmin?._id;
                const isCurrentUserByUsername = admin.username === currentAdmin?.username;
                const isCurrentUserByEmail = admin.email === currentAdmin?.email;
                const isCurrentUser = isCurrentUserById || isCurrentUserByUsername || isCurrentUserByEmail;

                return !isCurrentUser;
            });

            if (otherAdmins.length === 0) {
                container.innerHTML = '<div class="no-data">No other admins found</div>';
                return;
            }

            container.innerHTML = otherAdmins.map(admin => `
                <div class="admin-item ${admin.isActive === false ? 'disabled' : ''}">
                    <div class="admin-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="admin-info">
                        <div class="admin-name">${admin.name || 'Admin'}</div>
                        <div class="admin-email">${admin.username || admin.email}</div>
                        <div class="admin-role">
                            <span class="role-badge ${admin.role === 'super_admin' ? 'super-admin' : 'admin'}">${admin.role === 'super_admin' ? 'SUPER ADMIN' : 'Administrator'}</span>
                            ${admin.isActive === false ? '<span class="status-badge disabled">Disabled</span>' : ''}
                        </div>
                    </div>
                    <div class="admin-actions">
                        <button class="btn-icon edit-admin-btn" data-admin-id="${admin._id}" data-tooltip="Edit Admin">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon permissions-admin-btn" data-admin-id="${admin._id}" data-tooltip="Manage Permissions">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="btn-icon ${admin.isActive === false ? 'success' : 'warning'} toggle-admin-btn" 
                                data-admin-id="${admin._id}" 
                                data-status="${admin.isActive !== false}" 
                                data-tooltip="${admin.isActive === false ? 'Enable Admin' : 'Disable Admin'}">
                            <i class="fas fa-${admin.isActive === false ? 'check' : 'ban'}"></i>
                        </button>
                        <button class="btn-icon danger delete-admin-btn" data-admin-id="${admin._id}" data-tooltip="Delete Admin">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            Utils.showError(error.message || 'Failed to load admin list', null, error);
        }
    },

    /**
     * Load section data based on section name
     * @param {string} section - Section name
     */
    loadSectionData: (section) => {
        // Load section data using switch statement
        switch (section) {
            case 'dashboard':
                DataLoader.loadDashboard();
                break;
            case 'chats':
                DataLoader.loadChats();
                break;
            case 'tickets':
                DataLoader.loadTickets();
                break;
            case 'faqs':
                const categoryFilter = document.getElementById('faqCategoryFilter')?.value || '';
                const statusFilter = document.getElementById('faqStatusFilter')?.value || '';
                const searchInput = document.getElementById('faqSearchInput')?.value || '';

                const filters = {};
                if (categoryFilter) filters.category = categoryFilter;
                if (statusFilter) filters.isActive = statusFilter;
                if (searchInput) filters.search = searchInput;

                DataLoader.loadFAQs(filters);
                break;
            case 'account':
                DataLoader.loadAccount();
                break;
        }
    }
};

export default DataLoader;
