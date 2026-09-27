import shared from '@legendes/shared/messages/fr.json';
import { getRequestConfig } from 'next-intl/server';
import web from '../../messages/fr.json';

// French only for now, without locale routing; ready for fr-BE / nl-BE later.
export const messages = { ...shared, ...web };

export default getRequestConfig(() =>
  Promise.resolve({
    locale: 'fr',
    timeZone: 'Europe/Paris',
    messages,
  }),
);
