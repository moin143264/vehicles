const axios = require('axios');
const logger = require('../utils/logger'); // Assuming you have a logger utility

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Notification types for consistent messaging
const NOTIFICATION_TYPES = {
    CONFIRMED: {
        title: 'Booking Confirmed',
        getMessage: (location) => `Your booking at ${location} has been confirmed! We'll notify you before it starts.`
    },
    UPCOMING: {
        title: 'Upcoming Booking',
        getMessage: (location) => `Your booking at ${location} starts in less than 10 minutes!`
    },
    ARRIVED: {
        title: 'Booking Started',
        getMessage: (location) => `Welcome to ${location}! Your parking session has started.`
    },
    COMPLETED: {
        title: 'Booking Completed',
        getMessage: (location) => `Your booking at ${location} has ended. Thank you for using our service!`
    }
};

/**
 * Sends a push notification to a specific device
 * @param {string} pushToken - The device's push token
 * @param {string} title - Notification title
 * @param {string} body - Notification message
 * @param {Object} data - Additional data to send with notification
 * @returns {Promise} Response from Expo push service
 */
const sendNotification = async (pushToken, title, body, data = {}) => {
    try {
        if (!pushToken) {
            throw new Error('Push token is required');
        }

        const message = {
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
            channelId: 'booking-alerts',
        };

        logger.info('Sending push notification:', { title, body, token: pushToken });

        const response = await axios.post(EXPO_PUSH_ENDPOINT, message, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });

        logger.info('Push notification sent successfully:', response.data);
        return response.data;
    } catch (error) {
        logger.error('Error sending push notification:', {
            error: error.message,
            token: pushToken,
            title,
            body
        });
        throw new Error(`Failed to send notification: ${error.message}`);
    }
};

/**
 * Creates a notification message based on booking status
 * @param {string} type - Type of notification (UPCOMING, ARRIVED, COMPLETED)
 * @param {string} location - Name of the parking location
 * @returns {Object} Notification title and message
 */
const createNotificationMessage = (type, location) => {
    const notificationType = NOTIFICATION_TYPES[type];
    if (!notificationType) {
        throw new Error(`Invalid notification type: ${type}`);
    }

    return {
        title: notificationType.title,
        message: notificationType.getMessage(location)
    };
};

module.exports = {
    sendNotification,
    createNotificationMessage,
    NOTIFICATION_TYPES
};
