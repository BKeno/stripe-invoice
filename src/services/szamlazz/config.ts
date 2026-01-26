export interface SzamlazzConfig {
  apiKey: string;
  apiUrl: string;
  eInvoice: boolean;
  issuerName: string;
  bank: string;
  bankAccountNumber: string;
}

// Static XML settings (don't change per invoice)
export const XML_SETTINGS = {
  namespace: "http://www.szamlazz.hu/xmlszamla",
  schemaLocation:
    "https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd",
  downloadInvoice: false,
  responseVersion: 1,
} as const;

const SZAMLAZZ_API_URL = "https://www.szamlazz.hu/szamla/"; // fallback URL

export const getSzamlazzConfig = (): SzamlazzConfig => {
  const apiKey = process.env.SZAMLAZZ_API_KEY;
  const apiUrl = process.env.SZAMLAZZ_API_URL ?? SZAMLAZZ_API_URL;
  const eInvoice = process.env.SZAMLAZZ_E_INVOICE === "true";
  const issuerName = process.env.SZAMLAZZ_ISSUER_NAME ?? "";
  const bank = process.env.SZAMLAZZ_BANK ?? "";
  const bankAccountNumber = process.env.SZAMLAZZ_BANK_ACCOUNT ?? "";

  if (!apiKey) {
    throw new Error("SZAMLAZZ_API_KEY not configured");
  }

  return { apiKey, apiUrl, eInvoice, issuerName, bank, bankAccountNumber };
};
