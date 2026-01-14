export interface SzamlazzConfig {
  apiKey: string;
  eInvoice: boolean;
  issuerName: string;
  bank: string;
  bankAccountNumber: string;
}

// Statikus XML beállítások (nem változnak számlánként)
export const XML_SETTINGS = {
  namespace: 'http://www.szamlazz.hu/xmlszamla',
  schemaLocation: 'https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd',
  downloadInvoice: false,
  responseVersion: 1
} as const;

export const SZAMLAZZ_API_URL = 'https://www.szamlazz.hu/szamla/';

export const getSzamlazzConfig = (): SzamlazzConfig => {
  const apiKey = process.env.SZAMLAZZ_API_KEY;
  const eInvoice = process.env.SZAMLAZZ_E_INVOICE === 'true';
  const issuerName = process.env.SZAMLAZZ_ISSUER_NAME ?? '';
  const bank = process.env.SZAMLAZZ_BANK ?? '';
  const bankAccountNumber = process.env.SZAMLAZZ_BANK_ACCOUNT ?? '';

  if (!apiKey) {
    throw new Error('SZAMLAZZ_API_KEY not configured');
  }

  return { apiKey, eInvoice, issuerName, bank, bankAccountNumber };
};
