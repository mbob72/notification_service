import pino from 'pino';
import { createApp } from './app';
import { env } from './config/env';

const logger = pino({ name: 'notification-service' });
const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started');
});
