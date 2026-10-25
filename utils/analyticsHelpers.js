/**
 * Calculate performance metrics from analytics data
 * @param {Object} data Analytics data from various sources
 * @returns {Object} Calculated performance metrics
 */
function calculatePerformanceMetrics({ chatTrends, ticketTrends, userTrends, satisfactionTrends }) {
    // Initialize metrics object
    const metrics = {
        chats: {
            total: 0,
            avgMessagesPerChat: 0,
            avgDuration: 0,
            escalationRate: 0,
            peakPeriod: null
        },
        tickets: {
            total: 0,
            resolutionRate: 0,
            avgHandlingTime: 0,
            priorityDistribution: {}
        },
        users: {
            total: 0,
            retention: 0,
            engagementScore: 0,
            activeUserGrowth: 0
        },
        satisfaction: {
            average: 0,
            trend: 0,
            responseRate: 0
        }
    };

    // Process chat metrics
    if (chatTrends && chatTrends.length > 0) {
        const totalChats = chatTrends.reduce((sum, day) => sum + day.totalChats, 0);
        const totalMessages = chatTrends.reduce((sum, day) => sum + day.totalMessages, 0);
        const totalDuration = chatTrends.reduce((sum, day) => sum + day.averageDuration * day.totalChats, 0);
        const totalEscalated = chatTrends.reduce((sum, day) => sum + day.escalatedChats, 0);

        metrics.chats = {
            total: totalChats,
            avgMessagesPerChat: totalChats > 0 ? totalMessages / totalChats : 0,
            avgDuration: totalChats > 0 ? totalDuration / totalChats : 0,
            escalationRate: totalChats > 0 ? (totalEscalated / totalChats) * 100 : 0,
            peakPeriod: findPeakPeriod(chatTrends, 'totalChats')
        };
    }

    // Process ticket metrics
    if (ticketTrends && ticketTrends.length > 0) {
        const totalTickets = ticketTrends.reduce((sum, day) => sum + day.totalTickets, 0);
        const resolvedTickets = ticketTrends.reduce((sum, day) => {
            return sum + (day.statusDistribution.closed || 0);
        }, 0);

        // Calculate priority distribution
        const priorityDistribution = ticketTrends.reduce((acc, day) => {
            Object.entries(day.priorityDistribution || {}).forEach(([priority, count]) => {
                acc[priority] = (acc[priority] || 0) + count;
            });
            return acc;
        }, {});

        metrics.tickets = {
            total: totalTickets,
            resolutionRate: totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0,
            avgHandlingTime: calculateAverageHandlingTime(ticketTrends),
            priorityDistribution
        };
    }

    // Process user metrics
    if (userTrends && userTrends.length > 0) {
        const newUsers = userTrends.reduce((sum, day) => sum + day.newUsers, 0);
        const activeUsers = userTrends.reduce((sum, day) => sum + day.activeUsers, 0);
        const totalEngagement = userTrends.reduce((sum, day) => sum + day.totalEngagement, 0);

        // Calculate user retention
        const retention = calculateRetention(userTrends);

        metrics.users = {
            total: newUsers,
            retention,
            engagementScore: newUsers > 0 ? totalEngagement / newUsers : 0,
            activeUserGrowth: calculateActiveUserGrowth(userTrends)
        };
    }

    // Process satisfaction metrics
    if (satisfactionTrends && satisfactionTrends.length > 0) {
        const ratings = satisfactionTrends.filter(day => day.totalRatings > 0);
        const totalRatings = ratings.reduce((sum, day) => sum + day.totalRatings, 0);
        const weightedAverage = ratings.reduce((sum, day) => 
            sum + (day.averageRating * day.totalRatings), 0);

        metrics.satisfaction = {
            average: totalRatings > 0 ? weightedAverage / totalRatings : 0,
            trend: calculateSatisfactionTrend(satisfactionTrends),
            responseRate: calculateResponseRate(satisfactionTrends)
        };
    }

    return metrics;
}

/**
 * Find the peak period in a time series
 * @param {Array} trends Time series data
 * @param {string} metric Metric to analyze
 * @returns {Object} Peak period information
 */
function findPeakPeriod(trends, metric) {
    if (!trends || trends.length === 0) return null;

    const peak = trends.reduce((max, day) => 
        day[metric] > max.value ? { period: day._id, value: day[metric] } : max,
        { period: null, value: -Infinity }
    );

    return peak.period;
}

/**
 * Calculate average handling time for tickets
 * @param {Array} ticketTrends Ticket trend data
 * @returns {number} Average handling time in hours
 */
function calculateAverageHandlingTime(ticketTrends) {
    const resolvedTickets = ticketTrends.filter(day => 
        day.statusDistribution.closed
    );

    if (resolvedTickets.length === 0) return 0;

    const totalHandlingTime = resolvedTickets.reduce((sum, day) => {
        // This would need actual resolution time data from the tickets
        // This is a placeholder calculation
        return sum + (day.avgHandlingTime || 0) * (day.statusDistribution.closed || 0);
    }, 0);

    const totalResolved = resolvedTickets.reduce((sum, day) => 
        sum + (day.statusDistribution.closed || 0), 0);

    return totalResolved > 0 ? totalHandlingTime / totalResolved : 0;
}

/**
 * Calculate user retention rate
 * @param {Array} userTrends User trend data
 * @returns {number} Retention rate as a percentage
 */
function calculateRetention(userTrends) {
    if (userTrends.length < 2) return 0;

    const periods = userTrends.length;
    const initialUsers = userTrends[0].newUsers;
    const remainingUsers = userTrends[periods - 1].activeUsers;

    return initialUsers > 0 ? (remainingUsers / initialUsers) * 100 : 0;
}

/**
 * Calculate active user growth rate
 * @param {Array} userTrends User trend data
 * @returns {number} Growth rate as a percentage
 */
function calculateActiveUserGrowth(userTrends) {
    if (userTrends.length < 2) return 0;

    const firstPeriod = userTrends[0].activeUsers;
    const lastPeriod = userTrends[userTrends.length - 1].activeUsers;

    return firstPeriod > 0 ? ((lastPeriod - firstPeriod) / firstPeriod) * 100 : 0;
}

/**
 * Calculate satisfaction trend
 * @param {Array} satisfactionTrends Satisfaction trend data
 * @returns {number} Trend indicator (-1 to 1)
 */
function calculateSatisfactionTrend(satisfactionTrends) {
    if (satisfactionTrends.length < 2) return 0;

    const ratings = satisfactionTrends.filter(day => day.totalRatings > 0);
    if (ratings.length < 2) return 0;

    const firstAvg = ratings[0].averageRating;
    const lastAvg = ratings[ratings.length - 1].averageRating;

    return (lastAvg - firstAvg) / firstAvg;
}

/**
 * Calculate response rate for satisfaction surveys
 * @param {Array} satisfactionTrends Satisfaction trend data
 * @returns {number} Response rate as a percentage
 */
function calculateResponseRate(satisfactionTrends) {
    const totalRatings = satisfactionTrends.reduce((sum, day) => sum + day.totalRatings, 0);
    // This would need the total number of chats that could have been rated
    // This is a placeholder calculation
    const totalOpportunities = satisfactionTrends.reduce((sum, day) => sum + (day.totalChats || 0), 0);

    return totalOpportunities > 0 ? (totalRatings / totalOpportunities) * 100 : 0;
}

module.exports = {
    calculatePerformanceMetrics
};