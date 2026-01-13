import type { StripeCustomField, BillingAddress } from '../types/index.js';

export const mapStripeAddress = (
  customFields: StripeCustomField[],
  customerName: string,
  customerEmail: string
): BillingAddress => {
  const getFieldValue = (key: string): string => {
    const field = customFields.find(f => f.key === key);
    if (!field) return '';

    // Return value based on field type
    if (field.type === 'numeric') {
      return field.numeric?.value ?? '';
    }

    return field.text?.value ?? '';
  };

  return {
    name: customerName,
    email: customerEmail,
    postalCode: getFieldValue('irnytszm'),
    city: getFieldValue('vros'),
    address: getFieldValue('cm'),
    country: 'HU'
  };
};
