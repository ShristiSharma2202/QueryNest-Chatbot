// Configuration
const API_BASE_URL = window.location.origin;
let CURRENT_SESSION_ID = null;
let CURRENT_CONVERSATION_ID = null;
let QueryNest_FAQS = [];

// Main QueryNestBot Object
const QueryNestBot = {
    config: {
        similarityThreshold: 0.3,
        followUpDelay: 45000,
        typingDelay: [1000, 2000],
        maxInputHeight: 80
    },

    // State management
    state: {
        isOpen: false,
        hasGreeted: false,
        hasInteracted: false,
        followUpTimeout: null,
        lastUserInput: Date.now(),
        isProcessing: false,
        helpAttempts: 0,
        currentFAQId: null
    },

    // API Functions
    api: {
        // Initialize session
        startSession: async (metadata = {}) => {
            try {
                const sessionId = QueryNestBot.utils.generateSessionId();
                const response = await fetch(`${API_BASE_URL}/api/chat/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        metadata: {
                            ...metadata,
                            userAgent: navigator.userAgent,
                            referrer: document.referrer,
                            page: window.location.href
                        }
                    })
                });

                if (!response.ok) throw new Error('Failed to start session');

                const data = await response.json();
                CURRENT_SESSION_ID = data.data.sessionId;
                CURRENT_CONVERSATION_ID = data.data.conversationId;

                return data.data;
            } catch (error) {
                console.error('Start session error:', error);
                return null;
            }
        },

        // Send message to backend (conversationId optional)
        sendMessage: async (message) => {
            try {
                if (!CURRENT_SESSION_ID) {
                    throw new Error('No active session');
                }

                const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: CURRENT_SESSION_ID,
                        conversationId: CURRENT_CONVERSATION_ID || undefined,
                        message: message
                    })
                });

                if (!response.ok) throw new Error('Failed to send message');

                const data = await response.json();
                return data.data;
            } catch (error) {
                console.error('Send message error:', error);
                return null;
            }
        },

        // Create support ticket
        createTicket: async (ticketData) => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/tickets/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: CURRENT_SESSION_ID,
                        conversationId: CURRENT_CONVERSATION_ID,
                        ...ticketData
                    })
                });

                if (!response.ok) throw new Error('Failed to create ticket');

                const data = await response.json();
                return data.data;
            } catch (error) {
                console.error('Create ticket error:', error);
                throw error;
            }
        },

        // Load FAQs from API
        loadFAQs: async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/faqs`);
                if (!response.ok) throw new Error('Failed to load FAQs');

                QueryNest_FAQS = await response.json();
                return QueryNest_FAQS;
            } catch (error) {
                console.error('Load FAQs error:', error);
                // Use fallback local FAQs if API fails
                try {
                    const fallbackResponse = await fetch('./faqs.json');
                    if (fallbackResponse.ok) {
                        QueryNest_FAQS = await fallbackResponse.json();
                        return QueryNest_FAQS;
                    }
                } catch (fallbackError) {
                    console.error('Fallback FAQs error:', fallbackError);
                }
                return [];
            }
        },

        // Get popular questions
        getPopularQuestions: async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/chat/popular-questions?limit=6`);
                if (!response.ok) throw new Error('Failed to get popular questions');

                const data = await response.json();
                if (!data.data.questions || data.data.questions.length === 0) {
                    console.warn('No questions found in the database, using fallback questions.');
                    return QueryNestBot.faq.getPopularQuestions();
                }

                return data.data.questions;
            } catch (error) {
                console.error('Get popular questions error:', error);
                return QueryNestBot.faq.getPopularQuestions(); // Fallback
            }
        },

        // End chat session
        // End chat session, can pass {satisfaction, reason, rating, feedback, timestamp}
        endSession: async (params = {}) => {
            try {
                if (!CURRENT_SESSION_ID) return;

                const requestBody = {
                    sessionId: CURRENT_SESSION_ID,
                    conversationId: CURRENT_CONVERSATION_ID // Can be null
                };
                // Merge any extra params (satisfaction, reason, etc)
                Object.assign(requestBody, params);

                const response = await fetch(`${API_BASE_URL}/api/chat/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                    CURRENT_SESSION_ID = null;
                    CURRENT_CONVERSATION_ID = null;
                }
            } catch (error) {
                console.error('End session error:', error);
            }
        },

        // Rate FAQ response
        rateFAQ: async (faqId, rating) => {
            try {
                if (!CURRENT_SESSION_ID) return;

                const response = await fetch(`${API_BASE_URL}/api/chat/rate-faq`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: CURRENT_SESSION_ID,
                        faqId: faqId,
                        rating: rating
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to rate FAQ');
                }

                const data = await response.json();
                // FAQ rating submitted successfully
            } catch (error) {
                console.error('Rate FAQ error:', error);
                throw error;
            }
        }
    },

    // Utility Functions
    utils: {
        // Generate session ID
        generateSessionId: () => {
            return 'SX' + Date.now() + Math.random().toString(36).substr(2, 8);
        },

        // Generate unique ID
        generateId: () => 'SD' + Date.now() + Math.random().toString(36).substr(2, 5),

        // Format timestamp
        formatTime: (timestamp) => {
            return new Date(timestamp).toLocaleString();
        },

        // Random delay for natural feel
        randomDelay: (min = 1000, max = 2000) => {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        // Normalize text for better matching (fallback)
        normalize: (text) => {
            return text.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        // Calculate similarity score (fallback)
        similarity: (query, pattern) => {
            const queryWords = new Set(QueryNestBot.utils.normalize(query).split(' '));
            const patternWords = new Set(QueryNestBot.utils.normalize(pattern).split(' '));

            if (!queryWords.size || !patternWords.size) return 0;

            let matches = 0;
            patternWords.forEach(word => {
                if (queryWords.has(word)) matches++;
            });

            return matches / Math.max(queryWords.size, patternWords.size);
        }
    },

    // DOM helpers
    dom: {
        $: (selector) => document.querySelector(selector),
        $$: (selector) => document.querySelectorAll(selector),

        create: (tag, className = '', content = '') => {
            const el = document.createElement(tag);
            if (className) el.className = className;
            if (content) el.textContent = content;
            return el;
        }
    },

    // Audio (notification sounds)
    audio: {
        context: null,
        ensureContext: () => {
            try {
                if (!QueryNestBot.audio.context) {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (AudioCtx) {
                        QueryNestBot.audio.context = new AudioCtx();
                    }
                }
                if (QueryNestBot.audio.context && QueryNestBot.audio.context.state === 'suspended') {
                    QueryNestBot.audio.context.resume();
                }
            } catch (e) {
                // Ignore audio errors
            }
        },
        unlock: () => {
            QueryNestBot.audio.ensureContext();
        },
        playBotMessageSound: () => {
            QueryNestBot.audio.ensureContext();
            const ctx = QueryNestBot.audio.context;
            if (!ctx) return;

            const now = ctx.currentTime;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = 'sine';
            // Two quick tones for a pleasant notification
            oscillator.frequency.setValueAtTime(660, now);
            oscillator.frequency.setValueAtTime(880, now + 0.08);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.start(now);
            oscillator.stop(now + 0.27);
        }
    },

    // FAQ Functions (fallback)
    faq: {
        findAnswer: (query) => {
            let bestMatch = { score: 0, faq: null };

            for (const faq of QueryNest_FAQS) {
                for (const pattern of faq.patterns) {
                    const score = QueryNestBot.utils.similarity(query, pattern);
                    if (score > bestMatch.score) {
                        bestMatch = { score, faq };
                    }
                    if (QueryNestBot.utils.normalize(query) === QueryNestBot.utils.normalize(pattern)) {
                        return { faq, score: 1 };
                    }
                }
            }

            return bestMatch.score >= QueryNestBot.config.similarityThreshold ? bestMatch : { score: 0, faq: null };
        },

        getPopularQuestions: () => [
            "How do I create my digital card?",
            "Is QueryNest free?",
            "How do I share my card?",
            "Can I update my card later?",
            "What information can I include?",
            "Is my data secure?"
        ]
    },

    // Chat Functions
    chat: {
                // Utility to re-enable last feedback quick actions
                enableLastFeedbackActions: () => {
                    // Find the last quick actions group
                    const quickActions = Array.from(document.querySelectorAll('.QueryNest-quick-actions'));
                    if (quickActions.length === 0) return;
                    const lastGroup = quickActions[quickActions.length - 1];
                    // Only re-enable if all buttons are disabled (feedback group)
                    const btns = lastGroup.querySelectorAll('.QueryNest-quick-btn');
                    if ([...btns].every(btn => btn.disabled)) {
                        btns.forEach(btn => {
                            btn.disabled = false;
                            btn.style.opacity = '';
                            btn.style.pointerEvents = '';
                            btn.style.cursor = '';
                        });
                    }
                },
        formatMessageContent: (content) => {
            // Split into paragraphs on double line breaks
            const paragraphs = content.split(/\n\s*\n/);
            
            return paragraphs.map(paragraph => {
                // Handle bullet points and lists
                if (paragraph.trim().startsWith('- ')) {
                    const listItems = paragraph.split('\n- ').filter(item => item.trim());
                    return `<ul>${listItems.map(item => `<li>${item.trim()}</li>`).join('')}</ul>`;
                }
                
                // Handle numbered lists
                if (paragraph.match(/^\d+\./)) {
                    const listItems = paragraph.split(/\n\d+\./).filter(item => item.trim());
                    return `<ol>${listItems.map(item => `<li>${item.trim()}</li>`).join('')}</ol>`;
                }
                
                // Add line breaks for single newlines within paragraphs
                const lines = paragraph
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                
                // Handle special formatting
                return lines.map(line => {
                    // Bold text between ** or __
                    line = line.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
                    // Italic text between * or _
                    line = line.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
                    // Question marks with emphasis
                    line = line.replace(/\?\?/g, '?');
                    return line;
                }).join('<br>');
            }).join('</p><p>');
        },

        addMessage: (content, type = 'bot', html = false) => {
            const messages = QueryNestBot.dom.$('#QueryNestMessages');
            if (!messages) return null;

            const messageEl = QueryNestBot.dom.create('div', `QueryNest-message ${type}`);

            // Add ARIA attributes for accessibility
            messageEl.setAttribute('role', 'listitem');
            messageEl.setAttribute('aria-label', `${type === 'user' ? 'You' : 'Assistant'} said:`);

            if (html) {
                messageEl.innerHTML = content;
            } else {
                // Format the content and wrap in paragraphs
                const formattedContent = QueryNestBot.chat.formatMessageContent(content);
                messageEl.innerHTML = `<p>${formattedContent}</p>`;
            }

            messages.appendChild(messageEl);
            QueryNestBot.chat.scrollToBottom();
            // Re-run after layout settles (images/fonts/render)
            setTimeout(() => QueryNestBot.chat.scrollToBottom(), 50);
            requestAnimationFrame(() => QueryNestBot.chat.scrollToBottom());
            if (type === 'bot') {
                QueryNestBot.audio.playBotMessageSound();
            }
            return messageEl;
        },

        // Disable all but the last quick actions
        disablePreviousQuickActions: () => {
            const quickActions = Array.from(document.querySelectorAll('.QueryNest-quick-actions'));
            if (quickActions.length <= 1) return;
            // All except the last
            quickActions.slice(0, -1).forEach(group => {
                const btns = group.querySelectorAll('.QueryNest-quick-btn');
                btns.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.pointerEvents = 'none';
                    btn.style.cursor = 'not-allowed';
                });
            });
        },

        showTyping: () => {
            const messages = QueryNestBot.dom.$('#QueryNestMessages');
            if (!messages) return null;

            const typing = QueryNestBot.dom.create('div', 'QueryNest-typing');
            typing.innerHTML = `
                <div class="QueryNest-typing-dot"></div>
                <div class="QueryNest-typing-dot"></div>
                <div class="QueryNest-typing-dot"></div>
            `;

            messages.appendChild(typing);
            QueryNestBot.chat.scrollToBottom();
            return typing;
        },

        addQuickActions: (actions, disableOnClick = false) => {
            // (Removed disabling of previous quick actions)

            const lastMessage = QueryNestBot.dom.$('#QueryNestMessages .QueryNest-message:last-child');
            if (!lastMessage) return;

            const actionsEl = QueryNestBot.dom.create('div', 'QueryNest-quick-actions');

            const btns = [];
            actions.forEach(({ label, action }) => {
                const btn = QueryNestBot.dom.create('button', 'QueryNest-quick-btn', label);
                btn.onclick = (e) => {
                    e.preventDefault();
                    if (disableOnClick) {
                        btns.forEach(b => b.disabled = true);
                        btn.disabled = true;
                    }
                    action();
                };
                btns.push(btn);
                actionsEl.appendChild(btn);
            });

            lastMessage.appendChild(actionsEl);
            // Ensure the latest quick actions are in view
            QueryNestBot.chat.scrollToBottom();
            setTimeout(() => QueryNestBot.chat.scrollToBottom(), 20);
        },

        addRatingDialog: () => {
            QueryNestBot.chat.addMessage("Please rate your chat experience:", 'bot');
            
            // Create interactive star rating UI
            QueryNestBot.chat.addStarRating();
        },

        addRatingDialogForTicketClose: () => {
            // Create interactive star rating UI for post-ticket rating
            QueryNestBot.chat.addStarRating(true);
        },

        addStarRating: (isPostTicket = false) => {
            const lastMessage = QueryNestBot.dom.$('#QueryNestMessages .QueryNest-message:last-child');
            if (!lastMessage) return;

            const starContainer = QueryNestBot.dom.create('div', 'QueryNest-star-rating');
            if (isPostTicket) {
                starContainer.dataset.postTicket = 'true';
            }
            
            // Create 5 empty stars
            for (let i = 1; i <= 5; i++) {
                const star = QueryNestBot.dom.create('span', 'star-btn');
                star.innerHTML = '☆'; // Empty star
                star.dataset.rating = i;
                
                // Add hover effect
                star.onmouseover = () => {
                    QueryNestBot.chat.highlightStars(i);
                };
                
                // Handle click
                star.onclick = () => {
                    QueryNestBot.chat.selectRating(i, isPostTicket);
                };
                
                starContainer.appendChild(star);
            }
            
            // Reset on mouse leave
            starContainer.onmouseleave = () => {
                const currentRating = starContainer.dataset.selectedRating || 0;
                // Only highlight stars in this specific container
                const stars = starContainer.querySelectorAll('.star-btn');
                stars.forEach((star, index) => {
                    if (index < currentRating) {
                        star.innerHTML = '★';
                        star.classList.add('filled');
                    } else {
                        star.innerHTML = '☆';
                        star.classList.remove('filled');
                    }
                });
            };
            
            lastMessage.appendChild(starContainer);
            QueryNestBot.chat.scrollToBottom();
        },


        highlightStars: (rating) => {
            // Find the most recent star rating container
            const starContainers = QueryNestBot.dom.$$('.QueryNest-star-rating');
            const currentContainer = starContainers[starContainers.length - 1]; // Get the last one
            
            if (!currentContainer) return;
            
            const stars = currentContainer.querySelectorAll('.star-btn');
            stars.forEach((star, index) => {
                if (index < rating) {
                    star.innerHTML = '★'; // Filled star
                    star.classList.add('filled');
                } else {
                    star.innerHTML = '☆'; // Empty star
                    star.classList.remove('filled');
                }
            });
        },

        selectRating: (rating, isPostTicket = false) => {
            // Mark as selected but keep stars clickable for changes
            const starContainers = QueryNestBot.dom.$$('.QueryNest-star-rating');
            const currentContainer = starContainers[starContainers.length - 1]; // Get the last one
            
            if (currentContainer) {
                currentContainer.dataset.selectedRating = rating;
            }
            
            // Highlight selected rating
            QueryNestBot.chat.highlightStars(rating);
            
            // Show/update rating message
            QueryNestBot.chat.showRatingMessage(rating, isPostTicket);
        },

        showRatingMessage: (rating, isPostTicket = false) => {
            // Custom messages based on rating
            let message, followUpActions;
            
            if (isPostTicket) {
                // Post-ticket rating - only offer close chat
                if (rating === 1) {
                    message = "Thank you for the rating. We're sorry the experience wasn't perfect. Your support ticket will help us serve you better! 😔";
                } else if (rating === 2) {
                    message = "Thank you for your feedback! 😐 We'll use your support ticket to improve our service.";
                } else if (rating === 3) {
                    message = "Thanks for rating your experience! 😊 We appreciate your feedback and your support ticket.";
                } else if (rating === 4) {
                    message = "Great! We're glad we could help you overall! 😄 Thanks for creating the support ticket too.";
                } else if (rating === 5) {
                    message = "Excellent! We're thrilled with your feedback! 🌟 Thank you for your support ticket as well.";
                }
                
                followUpActions = [
                    {
                        label: '🔚 Close Chat',
                        action: () => QueryNestBot.chat.handleRatingClose(rating)
                    }
                ];
            } else {
                // Normal rating - show ticket option only for ratings 3 or below
                if (rating === 1) {
                    message = "We're sorry to hear that! 😔 We'll work hard to serve you better.";
                } else if (rating === 2) {
                    message = "Thank you for your feedback! 😐 We'll work to improve your experience.";
                } else if (rating === 3) {
                    message = "Thanks for your rating! 😊 We appreciate your feedback.";
                } else if (rating === 4) {
                    message = "Great! We're glad we could help you! 😄 Thanks for the positive feedback!";
                } else if (rating === 5) {
                    message = "Excellent! We're thrilled we exceeded your expectations! 🌟 Thank you for the amazing feedback!";
                }
                
                followUpActions = [];
                
                // Only show Create Support Ticket for ratings 3 or below
                if (rating <= 3) {
                    followUpActions.push({
                        label: '🎫 Create Support Ticket',
                        action: () => QueryNestBot.ticket.open()
                    });
                }
                
                // Always show Close Chat option
                followUpActions.push({
                    label: '🔚 Close Chat',
                    action: () => QueryNestBot.chat.handleRatingClose(rating)
                });
            }
            
            // Check if rating message already exists - get the last one
            const ratingMessages = QueryNestBot.dom.$$('.rating-response-message');
            let ratingMessageEl = ratingMessages.length > 0 ? ratingMessages[ratingMessages.length - 1] : null;
            
            if (ratingMessageEl) {
                // Update existing message text directly
                ratingMessageEl.textContent = message;
                
                // Remove existing actions from the rating message and its siblings
                const existingActions = ratingMessageEl.querySelectorAll('.QueryNest-quick-actions');
                existingActions.forEach(actions => actions.remove());
                
                // Also check next sibling for actions
                let nextEl = ratingMessageEl.nextElementSibling;
                while (nextEl && nextEl.classList.contains('QueryNest-quick-actions')) {
                    const toRemove = nextEl;
                    nextEl = nextEl.nextElementSibling;
                    toRemove.remove();
                }
            } else {
                // Add new message with special class
                const messageEl = QueryNestBot.chat.addMessage(message, 'bot');
                if (messageEl) {
                    messageEl.classList.add('rating-response-message');
                }
            }
            
            // Show follow-up actions
            setTimeout(() => {
                QueryNestBot.chat.addQuickActions(followUpActions);
            }, 300);
        },

        handleRatingClose: async (rating) => {
            try {
                await QueryNestBot.api.endSession({ 
                    rating: rating,
                    feedback: `${rating} star rating`,
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                console.error('Error ending session with rating:', e);
            }
            
            // Disable all previous interactions
            QueryNestBot.chat.disableAllInteractions();
            
            // Show final message and disable chat
            QueryNestBot.chat.addMessage('Chat session ended. Thank you for your feedback!', 'bot');
            
            setTimeout(() => {
                QueryNestBot.chat.addQuickActions([
                    {
                        label: '🔄 Start New Chat',
                        action: () => {
                            QueryNestBot.chat.clear();
                            QueryNestBot.chat.enableInput();
                            QueryNestBot.state.hasGreeted = false;
                            QueryNestBot.state.hasInteracted = false;
                            QueryNestBot.handlers.welcome();
                        }
                    }
                ]);
                
                // Disable input
                QueryNestBot.chat.disableInput();
            }, 800);
        },


        disableAllInteractions: () => {
            // Disable all quick action buttons except "Start New Chat"
            const allButtons = QueryNestBot.dom.$$('.QueryNest-quick-btn');
            allButtons.forEach(btn => {
                // Only keep "Start New Chat" button enabled
                if (!btn.textContent.includes('Start New Chat')) {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.pointerEvents = 'none';
                    btn.style.cursor = 'not-allowed';
                }
            });
            
            // Disable star ratings
            const allStars = QueryNestBot.dom.$$('.star-btn');
            allStars.forEach(star => {
                star.style.pointerEvents = 'none';
                star.style.opacity = '0.7';
                star.style.cursor = 'not-allowed';
                star.onmouseover = null;
                star.onclick = null;
            });
        },

        disableInput: () => {
            const input = QueryNestBot.dom.$('#QueryNestInput');
            const sendBtn = QueryNestBot.dom.$('#QueryNestSend');
            if (input) {
                input.disabled = true;
                input.placeholder = 'Chat ended - Click "Start New Chat" to continue';
                input.style.backgroundColor = '#f5f5f5';
            }
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.style.opacity = '0.5';
            }
        },

        enableInput: () => {
            const input = QueryNestBot.dom.$('#QueryNestInput');
            const sendBtn = QueryNestBot.dom.$('#QueryNestSend');
            if (input) {
                input.disabled = false;
                input.placeholder = 'Type your message...';
                input.style.backgroundColor = '';
            }
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.style.opacity = '';
            }
        },

        addResolutionFlow: () => {
            QueryNestBot.chat.addMessage("Was that helpful?", 'bot');

            const actions = [];
            actions.push({
                label: '✅ Helpful',
                action: async () => {
                    QueryNestBot.chat.addMessage('Great! Happy to help! 😊', 'bot');
                    QueryNestBot.state.helpAttempts = 0;

                    // Submit FAQ rating if this was an FAQ response
                    if (QueryNestBot.state.currentFAQId) {
                        try {
                            await QueryNestBot.api.rateFAQ(QueryNestBot.state.currentFAQId, 5);
                        } catch (error) {
                            console.error('Failed to rate FAQ:', error);
                        }
                        QueryNestBot.state.currentFAQId = null; // Clear after rating
                    }

                    // Show rating dialog immediately after
                    setTimeout(() => {
                        QueryNestBot.chat.addRatingDialog();
                    }, 800);
                }
            });

            if (QueryNestBot.state.helpAttempts === 0) {
                actions.push({
                    label: '🙋 Need more help',
                    action: async () => {
                        QueryNestBot.state.helpAttempts = 1;
                        
                        // Submit FAQ rating if this was an FAQ response
                        if (QueryNestBot.state.currentFAQId) {
                            try {
                                await QueryNestBot.api.rateFAQ(QueryNestBot.state.currentFAQId, 1);
                            } catch (error) {
                                console.error('Failed to rate FAQ:', error);
                            }
                            QueryNestBot.state.currentFAQId = null; // Clear after rating
                        }
                        
                        await QueryNestBot.handlers.suggestQuestions(4);
                    }
                });
            } else {
                actions.push({
                    label: '🎫 Create Ticket',
                    action: () => {
                        QueryNestBot.state.helpAttempts = 0;
                        QueryNestBot.ticket.open();
                    }
                });
            }

            QueryNestBot.chat.addQuickActions(actions, true); // Only feedback buttons get disabled after click
        },

        scrollToBottom: () => {
            const messages = QueryNestBot.dom.$('#QueryNestMessages');
            if (messages) {
                messages.scrollTop = messages.scrollHeight;
            }
        },

        clear: () => {
            const messages = QueryNestBot.dom.$('#QueryNestMessages');
            if (messages) {
                messages.innerHTML = '';
            }
        }
    },

    // Message Handlers
    handlers: {
        handleInput: async (text) => {
            if (QueryNestBot.ticket.currentField) {
                QueryNestBot.ticket.handleFormInput(text);
                return;
            }

            if (!text.trim() || QueryNestBot.state.isProcessing) return;

            QueryNestBot.state.isProcessing = true;
            QueryNestBot.state.lastUserInput = Date.now();

            // Add user message
            QueryNestBot.chat.addMessage(text, 'user');

            // Clear input
            const input = QueryNestBot.dom.$('#QueryNestInput');
            if (input) {
                input.value = '';
                QueryNestBot.ui.autoResize(input);
            }

            // Show typing
            const typing = QueryNestBot.chat.showTyping();

            // Clear any pending follow-up
            QueryNestBot.handlers.clearFollowUp();

            try {
                // Send to backend API
                const response = await QueryNestBot.api.sendMessage(text);

                if (typing) typing.remove();

                if (response) {
                    // Set conversation on first response
                    if (!CURRENT_CONVERSATION_ID && response.conversationId) {
                        CURRENT_CONVERSATION_ID = response.conversationId;
                    }
                    // Add bot response
                    QueryNestBot.chat.addMessage(response.response, 'bot');

                    // Show resolution flow for all responses (FAQ and non-FAQ)
                    // Store FAQ ID in state for rating purposes
                    if (response.metadata && response.metadata.faqMatched && response.metadata.faqId) {
                        QueryNestBot.state.currentFAQId = response.metadata.faqId;
                    } else {
                        QueryNestBot.state.currentFAQId = null;
                    }
                    
                    setTimeout(() => {
                        QueryNestBot.chat.addResolutionFlow();
                    }, 1500);

                    // Check if we have suggested FAQs to show as buttons
                    if (response.metadata && response.metadata.suggestedFaqs && response.metadata.suggestedFaqs.length > 0) {
                        setTimeout(() => {
                            QueryNestBot.chat.addQuickActions(
                                response.metadata.suggestedFaqs.map(faq => ({
                                    label: faq.question,
                                    action: () => QueryNestBot.handlers.handleInput(faq.question)
                                }))
                            );
                        }, 200);
                    }

                    // Show appropriate action buttons
                    setTimeout(() => {
                        if (response.metadata && response.metadata.showCreateTicket) {
                            // Show create ticket button instead of resolution flow
                            QueryNestBot.chat.addMessage("Need further assistance?", 'bot');
                            QueryNestBot.chat.addQuickActions([
                                {
                                    label: '🎫 Create Support Ticket',
                                    action: () => QueryNestBot.ticket.open()
                                }
                            ]);
                        }
                    }, response.metadata && response.metadata.suggestedFaqs && response.metadata.suggestedFaqs.length > 0 ? 800 : 600);
                } else {
                    // Fallback to local processing
                    QueryNestBot.handlers.handleInputFallback(text);
                }
            } catch (error) {
                console.error('Message handling error:', error);
                if (typing) typing.remove();

                // Fallback to local processing
                QueryNestBot.handlers.handleInputFallback(text);
            }

            QueryNestBot.state.isProcessing = false;
        },

        handleInputFallback: (text) => {
            // Fallback when backend API is unavailable
            QueryNestBot.chat.addMessage(
                "I'm having trouble connecting to our support system right now. Please try again in a moment.",
                'bot'
            );

            QueryNestBot.chat.addQuickActions([
                {
                    label: '🔄 Try Again',
                    action: () => QueryNestBot.handlers.handleInput(text)
                },
                {
                    label: '💡 More Help',
                    action: QueryNestBot.handlers.suggestQuestions
                }
            ]);
        },

        scheduleFollowUp: () => {
            QueryNestBot.state.followUpTimeout = setTimeout(() => {
                const input = QueryNestBot.dom.$('#QueryNestInput');
                if (!input || !input.value.trim()) {
                    const typing = QueryNestBot.chat.showTyping();
                    setTimeout(() => {
                        if (typing) typing.remove();

                        QueryNestBot.chat.addMessage(
                            "Was that helpful?",
                            'bot'
                        );

                        QueryNestBot.chat.addQuickActions([
                            {
                                label: '✅ Yes, helpful!',
                                action: () => QueryNestBot.chat.addMessage("Great! Happy to help! 😊", 'bot')
                            },
                            {
                                label: '🙋 More help',
                                action: () => {
                                    QueryNestBot.chat.addMessage("No worries. I can suggest more topics or connect you with our support team.", 'bot');
                                    QueryNestBot.chat.addQuickActions([
                                        { label: '💡 Suggest Questions', action: QueryNestBot.handlers.suggestQuestions },
                                        { label: '🎫 Create Ticket', action: QueryNestBot.ticket.open }
                                    ]);
                                }
                            }
                        ]);
                    }, 500);
                }
            }, QueryNestBot.config.followUpDelay);
        },

        clearFollowUp: () => {
            if (QueryNestBot.state.followUpTimeout) {
                clearTimeout(QueryNestBot.state.followUpTimeout);
                QueryNestBot.state.followUpTimeout = null;
            }
        },

        suggestQuestions: async (count = 4) => {
            QueryNestBot.chat.addMessage(
                "Here are some popular questions I can help with:",
                'bot'
            );

            try {
                const questions = await QueryNestBot.api.getPopularQuestions();
                QueryNestBot.chat.addQuickActions(
                    questions.slice(0, count).map(q => ({
                        label: typeof q === 'string' ? q : q.question,
                        action: () => QueryNestBot.handlers.handleInput(typeof q === 'string' ? q : q.question)
                    }))
                );
            } catch (error) {
                // Fallback to local questions
                const popularQuestions = QueryNestBot.faq.getPopularQuestions();
                QueryNestBot.chat.addQuickActions(
                    popularQuestions.slice(0, count).map(q => ({
                        label: q,
                        action: () => QueryNestBot.handlers.handleInput(q)
                    }))
                );
            }
        },

        welcome: async () => {
            // Initialize session
            const sessionData = await QueryNestBot.api.startSession();

            setTimeout(() => {
                QueryNestBot.chat.addMessage(
                    sessionData?.welcomeMessage || "Hi there! 👋 I'm your QueryNest assistant. I can help you with questions about our digital business cards, pricing, sharing, and more!",
                    'bot'
                );
            }, 300);

            setTimeout(() => {
                const typing = QueryNestBot.chat.showTyping();

                setTimeout(() => {
                    typing.remove();

                    // Show initial FAQs (5-6)
                    QueryNestBot.handlers.suggestQuestions(6);
                }, 500);
            }, 1200);
        }
    },

    // Ticket System
    ticket: {
        open: () => {
            // If a form is already present, focus it
            const existing = QueryNestBot.dom.$('.QueryNest-ticket-form');
            if (existing) {
                existing.querySelector('#ticketName')?.focus();
                return;
            }

            // Clear any previous validation states
            const errorElements = QueryNestBot.dom.$$('.QueryNest-form-error');
            errorElements.forEach(el => {
                el.textContent = '';
            });

            // Render inline ticket form inside chat as a bot message
            const formHtml = `
                <form class="QueryNest-ticket-form" aria-label="Create Support Ticket" novalidate>
                    <div class="QueryNest-ticket-header">
                        <div class="QueryNest-ticket-icon">📧</div>
                        <div>
                            <div class="QueryNest-ticket-title">Contact Support Team</div>
                            <div class="QueryNest-ticket-subtitle">We usually respond within 24 hours</div>
                        </div>
                    </div>

                    <div class="QueryNest-form-group">
                        <label class="QueryNest-form-label" for="ticketName">Full Name *</label>
                        <input class="QueryNest-form-input" id="ticketName" type="text" placeholder="Your full name" required aria-required="true">
                        <div class="QueryNest-form-error" id="ticketNameError"></div>
                    </div>
                    <div class="QueryNest-form-group">
                        <label class="QueryNest-form-label" for="ticketEmail">Email Address *</label>
                        <input class="QueryNest-form-input" id="ticketEmail" type="email" placeholder="your@email.com" required aria-required="true">
                        <div class="QueryNest-form-error" id="ticketEmailError"></div>
                    </div>
                    <div class="QueryNest-form-group">
                        <label class="QueryNest-form-label" for="ticketMobile">Mobile Number *</label>
                        <input class="QueryNest-form-input" id="ticketMobile" type="tel" placeholder="Your mobile number" required aria-required="true">
                        <div class="QueryNest-form-error" id="ticketMobileError"></div>
                    </div>
                    <div class="QueryNest-form-group">
                        <label class="QueryNest-form-label" for="ticketMessage">Message *</label>
                        <textarea class="QueryNest-form-textarea" id="ticketMessage" placeholder="Describe your question or issue in detail..." required aria-required="true"></textarea>
                        <div class="QueryNest-form-error" id="ticketMessageError"></div>
                    </div>

                    <div class="QueryNest-ticket-actions">
                        <button type="button" class="QueryNest-btn QueryNest-btn-secondary QueryNest-ticket-cancel">Cancel</button>
                        <button type="submit" class="QueryNest-btn QueryNest-btn-primary QueryNest-ticket-submit">Send Message</button>
                    </div>
                </form>
            `;

            const formMessage = QueryNestBot.chat.addMessage(formHtml, 'bot', true);

            // Wire up events
            const form = formMessage?.querySelector('.QueryNest-ticket-form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    QueryNestBot.ticket.submit();
                });
                form.querySelector('.QueryNest-ticket-cancel')?.addEventListener('click', () => {
                    QueryNestBot.ticket.close();
                    // Re-enable last feedback quick actions
                    QueryNestBot.chat.enableLastFeedbackActions();
                });
                // Setup form validation
                QueryNestBot.ticket.setupFormValidation();
                setTimeout(() => form.querySelector('#ticketName')?.focus(), 50);
            }
            // ...existing code...
        // --- Inactivity auto-end chat ---
        QueryNestBot.inactivityTimeout = null;
        QueryNestBot.inactivityDuration = 5 * 60 * 1000; // 5 minutes
        QueryNestBot.resetInactivityTimer = function() {
            if (QueryNestBot.inactivityTimeout) clearTimeout(QueryNestBot.inactivityTimeout);
            QueryNestBot.inactivityTimeout = setTimeout(async () => {
                // End chat on backend if session is active
                if (typeof QueryNestBot.api.endSession === 'function' && window.CURRENT_SESSION_ID) {
                    try {
                        await QueryNestBot.api.endSession({ reason: 'inactivity' });
                    } catch (e) {
                        // Ignore errors
                    }
                }
                QueryNestBot.chat.addMessage('⏰ Chat ended due to inactivity. Please start a new chat if you need more help.', 'bot');
                // Show Start New Chat quick action
                if (typeof QueryNestBot.chat.addQuickActions === 'function') {
                    QueryNestBot.chat.addQuickActions([
                        {
                            label: '🔄 Start New Chat',
                            action: () => {
                                QueryNestBot.chat.clear();
                                QueryNestBot.chat.enableInput();
                                QueryNestBot.state.hasGreeted = false;
                                QueryNestBot.state.hasInteracted = false;
                                QueryNestBot.handlers.welcome();
                            }
                        }
                    ]);
                }
                if (typeof QueryNestBot.chat.disableInput === 'function') {
                    QueryNestBot.chat.disableInput();
                }
                QueryNestBot.state = {
                    isOpen: false,
                    hasGreeted: false,
                    hasInteracted: false,
                    followUpTimeout: null,
                    lastUserInput: Date.now(),
                    isProcessing: false,
                    helpAttempts: 0,
                    currentFAQId: null
                };
            }, QueryNestBot.inactivityDuration);
        };
        ['click', 'keydown', 'input'].forEach(evt => {
            document.addEventListener(evt, () => {
                QueryNestBot.resetInactivityTimer();
            }, true);
        });
        QueryNestBot.resetInactivityTimer();
        },

        close: () => {
            // Remove inline form if present
            const existing = QueryNestBot.dom.$('.QueryNest-ticket-form');
            if (existing && existing.closest('.QueryNest-message')) {
                existing.closest('.QueryNest-message').remove();
            }
            QueryNestBot.ticket.clearForm();

            // Return focus to chat input for accessibility
            const input = QueryNestBot.dom.$('#QueryNestInput');
            if (input) input.focus();
        },

        handleEscKey: (e) => {
            if (e.key === 'Escape') {
                QueryNestBot.ticket.close();
            }
        },

        clearForm: () => {
            const fields = ['#ticketName', '#ticketEmail', '#ticketMobile', '#ticketMessage'];
            fields.forEach(selector => {
                const field = QueryNestBot.dom.$(selector);
                if (field) field.value = '';
            });
        },

        validateField: (field, value, type) => {
            const nameEl = QueryNestBot.dom.$('#ticketName');
            const emailEl = QueryNestBot.dom.$('#ticketEmail');
            const mobileEl = QueryNestBot.dom.$('#ticketMobile');
            const messageEl = QueryNestBot.dom.$('#ticketMessage');
            
            const errorEl = QueryNestBot.dom.$(`#${field}Error`);
            if (!errorEl) return false;
            
            let isValid = true;
            let errorMessage = '';

            switch (type) {
                case 'name':
                    if (!value.trim()) {
                        isValid = false;
                        errorMessage = 'Name is required';
                    } else if (value.trim().length < 2) {
                        isValid = false;
                        errorMessage = 'Name must be at least 2 characters';
                    }
                    break;
                    
                case 'email':
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!value.trim()) {
                        isValid = false;
                        errorMessage = 'Email is required';
                    } else if (!emailRegex.test(value)) {
                        isValid = false;
                        errorMessage = 'Please enter a valid email address';
                    }
                    break;
                    
                case 'mobile':
                    if (!value.trim()) {
                        isValid = false;
                        errorMessage = 'Mobile number is required';
                    } else if (!/^\d{10,15}$/.test(value.replace(/[-\s]/g, ''))) {
                        isValid = false;
                        errorMessage = 'Please enter a valid mobile number with country code';
                    }
                    break;
                    
                case 'message':
                    if (!value.trim()) {
                        isValid = false;
                        errorMessage = 'Message is required';
                    } else if (value.trim().length < 10) {
                        isValid = false;
                        errorMessage = 'Message must be at least 10 characters long';
                    }
                    break;
            }

            // Update error message and field styling
            errorEl.textContent = errorMessage;
            const inputEl = QueryNestBot.dom.$(`#${field}`);
            if (inputEl) {
                inputEl.classList.remove('error', 'valid');
                inputEl.classList.add(isValid ? 'valid' : 'error');
            }

            return isValid;
        },

        setupFormValidation: () => {
            const form = QueryNestBot.dom.$('.QueryNest-ticket-form');
            if (!form) return;

            // Setup validation for each field
            const fields = {
                ticketName: 'name',
                ticketEmail: 'email',
                ticketMobile: 'mobile',
                ticketMessage: 'message'
            };

            Object.entries(fields).forEach(([fieldId, type]) => {
                const field = QueryNestBot.dom.$(`#${fieldId}`);
                if (field) {
                    field.addEventListener('input', () => {
                        QueryNestBot.ticket.validateField(fieldId, field.value, type);
                    });
                    field.addEventListener('blur', () => {
                        QueryNestBot.ticket.validateField(fieldId, field.value, type);
                    });
                }
            });
        },

        submit: async () => {
            const name = QueryNestBot.dom.$('#ticketName')?.value.trim() || '';
            const email = QueryNestBot.dom.$('#ticketEmail')?.value.trim() || '';
            const mobile = QueryNestBot.dom.$('#ticketMobile')?.value.trim() || '';
            const message = QueryNestBot.dom.$('#ticketMessage')?.value.trim() || '';

            // Validate all fields
            const isNameValid = QueryNestBot.ticket.validateField('ticketName', name, 'name');
            const isEmailValid = QueryNestBot.ticket.validateField('ticketEmail', email, 'email');
            const isMobileValid = QueryNestBot.ticket.validateField('ticketMobile', mobile, 'mobile');
            const isMessageValid = QueryNestBot.ticket.validateField('ticketMessage', message, 'message');

            if (!isNameValid || !isEmailValid || !isMobileValid || !isMessageValid) {
                return;
            }

            // Show spinner on send button
            const form = QueryNestBot.dom.$('.QueryNest-ticket-form');
            const sendBtn = form?.querySelector('.QueryNest-ticket-submit');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = `<span class="QueryNest-spinner" style="display:inline-block;width:18px;height:18px;border:2px solid #ccc;border-top:2px solid #2563eb;border-radius:50%;animation:QueryNest-spin 1s linear infinite;vertical-align:middle;margin-right:6px;"></span> Sending...`;
            }

            try {
                const ticket = await QueryNestBot.api.createTicket({
                    name,
                    email,
                    mobile,
                    message
                    // Priority will be auto-detected based on message content
                });

                QueryNestBot.ticket.close();

                QueryNestBot.chat.addMessage(
                    `✅ Support ticket created successfully! Your ticket ID is: ${ticket.ticketId}\n\nOur team will get back to you within 24 hours via email.\n\nPlease note the ticket ID for future reference.`,
                    'bot'
                );

                QueryNestBot.chat.addQuickActions([
                    {
                        label: '❓ Ask Another Question',
                        action: () => {
                            const input = QueryNestBot.dom.$('#QueryNestInput');
                            if (input) input.focus();
                        }
                    },
                    {
                        label: '🔚 Close chat',
                        action: () => {
                            // After ticket creation, ask for rating with only close option
                            QueryNestBot.chat.addMessage("Before you go, please rate your overall experience:", 'bot');
                            setTimeout(() => {
                                QueryNestBot.chat.addRatingDialogForTicketClose();
                            }, 600);
                        }
                    }
                ]);
            } catch (error) {
                console.error('Ticket creation error:', error);
                alert('Failed to create support ticket. Please try again or contact us directly.');
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = 'Send Message';
                }
            }
        }
    },


    // UI Functions
    ui: {
        toggle: () => {
            QueryNestBot.state.isOpen = !QueryNestBot.state.isOpen;

            const chat = QueryNestBot.dom.$('#QueryNestChat');
            const launcher = QueryNestBot.dom.$('#QueryNestLauncher');

            if (chat) {
                chat.classList.toggle('open', QueryNestBot.state.isOpen);
                chat.setAttribute('aria-expanded', QueryNestBot.state.isOpen.toString());
            }
            if (launcher) launcher.classList.toggle('active', QueryNestBot.state.isOpen);

            if (QueryNestBot.state.isOpen) {
                const input = QueryNestBot.dom.$('#QueryNestInput');
                if (input) input.focus();

                if (!QueryNestBot.state.hasGreeted) {
                    QueryNestBot.handlers.welcome();
                    QueryNestBot.state.hasGreeted = true;
                }

                // Add escape key handler for accessibility
                document.addEventListener('keydown', QueryNestBot.ui.handleEscKey);
            } else {
                QueryNestBot.handlers.clearFollowUp();
                document.removeEventListener('keydown', QueryNestBot.ui.handleEscKey);
                // Optionally end session when chat is closed
                // QueryNestBot.api.endSession();
            }
        },

        handleEscKey: (e) => {
            if (e.key === 'Escape' && QueryNestBot.state.isOpen) {
                QueryNestBot.ui.toggle();
                const launcher = QueryNestBot.dom.$('#QueryNestLauncher');
                if (launcher) launcher.focus();
            }
        },

        autoResize: (textarea) => {
            if (!textarea) return;

            textarea.style.height = 'auto';
            const newHeight = Math.min(textarea.scrollHeight, QueryNestBot.config.maxInputHeight);
            textarea.style.height = newHeight + 'px';
        },

        sendMessage: () => {
            const input = QueryNestBot.dom.$('#QueryNestInput');
            const sendBtn = QueryNestBot.dom.$('#QueryNestSendBtn');

            if (!input || QueryNestBot.state.isProcessing) return;

            const text = input.value.trim();
            if (text) {
                QueryNestBot.handlers.handleInput(text);

                if (sendBtn) {
                    sendBtn.disabled = true;
                    setTimeout(() => {
                        sendBtn.disabled = false;
                    }, 1000);
                }
            }
        }
    },

    // Event Handlers
    events: {
        init: () => {
            // Launcher toggle
            const launcher = QueryNestBot.dom.$('#QueryNestLauncher');
            if (launcher) {
                launcher.addEventListener('click', QueryNestBot.ui.toggle);
            }

            // Send button
            const sendBtn = QueryNestBot.dom.$('#QueryNestSendBtn');
            if (sendBtn) {
                sendBtn.addEventListener('click', QueryNestBot.ui.sendMessage);
            }

            // Input field events
            const input = QueryNestBot.dom.$('#QueryNestInput');
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        QueryNestBot.ui.sendMessage();
                    }
                });

                input.addEventListener('input', () => {
                    QueryNestBot.ui.autoResize(input);
                });
            }

            // No modal bindings needed anymore (inline ticket form)
        }
    },

    // External API
    publicApi: {
        open: () => {
            if (!QueryNestBot.state.isOpen) {
                QueryNestBot.ui.toggle();
            }
        },

        close: () => {
            if (QueryNestBot.state.isOpen) {
                QueryNestBot.ui.toggle();
            }
        },

        sendMessage: (text) => {
            if (text && typeof text === 'string') {
                QueryNestBot.handlers.handleInput(text.trim());
            }
        },

        getState: () => ({ ...QueryNestBot.state }),

        clearChat: () => {
            QueryNestBot.chat.clear();
            QueryNestBot.state.hasGreeted = false;
            QueryNestBot.state.hasInteracted = false;
        }
    },

    // Main initialization
    init: async () => {
        try {
            // Load FAQs
            await QueryNestBot.api.loadFAQs();
            // FAQs loaded successfully

            // Initialize events
            QueryNestBot.events.init();

            // Log initialization

            // Return API for external use
            return QueryNestBot.widgetApi;
        } catch (error) {
            console.error('❌ Failed to initialize chatbot:', error);

            // Initialize anyway with fallback
            QueryNestBot.events.init();
            return QueryNestBot.widgetApi;
        }
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', QueryNestBot.init);
} else {
    QueryNestBot.init().then(api => {
        // Export for external use
        if (typeof window !== 'undefined') {
            window.QueryNestBot = api;
        }
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QueryNestBot;
}