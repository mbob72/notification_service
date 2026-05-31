import pino from 'pino';

export const logger = pino({
  name: 'notification-service',
});
