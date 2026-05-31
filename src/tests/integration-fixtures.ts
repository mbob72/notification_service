import fixtures from '../../fixtures/test-fixtures.json';

export const integrationFixtures = fixtures as {
  userId: string;
  promoTypeCode: string;
  transactionalTypeCode: string;
  channelCodes: {
    email: string;
    push: string;
    sms: string;
  };
};
