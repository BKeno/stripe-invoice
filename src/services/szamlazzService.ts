import type { InvoiceData, InvoiceLineItem } from "../types/index.js";
import { InvoiceGenerationError } from "../utils/errors.js";

const SZAMLAZZ_API_URL = "https://www.szamlazz.hu/szamla/";

interface SzamlazzConfig {
  apiKey: string;
  eInvoice: boolean;
  issuerName: string;
  bank: string;
  bankAccountNumber: string;
}

const getSzamlazzConfig = (): SzamlazzConfig => {
  const apiKey = process.env.SZAMLAZZ_API_KEY;
  const eInvoice = process.env.SZAMLAZZ_E_INVOICE === "true";
  const issuerName = process.env.SZAMLAZZ_ISSUER_NAME ?? "";
  const bank = process.env.SZAMLAZZ_BANK ?? "";
  const bankAccountNumber = process.env.SZAMLAZZ_BANK_ACCOUNT ?? "";

  if (!apiKey) {
    throw new Error("SZAMLAZZ_API_KEY not configured");
  }

  return { apiKey, eInvoice, issuerName, bank, bankAccountNumber };
};

const buildInvoiceXML = (
  data: InvoiceData,
  config: SzamlazzConfig,
  stornoInvoiceNumber?: string
): string => {
  const isStorno = !!stornoInvoiceNumber;

  // Build line items XML
  const lineItemsXML = data.lineItems
    .map((item) => {
      const netPrice = item.unitPrice / (1 + item.vatRate / 100);
      const vatAmount = item.unitPrice - netPrice;

      return `    <tetel>
      <megnevezes>${item.productName}</megnevezes>
      <mennyiseg>${item.quantity}</mennyiseg>
      <mennyisegiEgyseg>db</mennyisegiEgyseg>
      <nettoEgysegar>${netPrice.toFixed(2)}</nettoEgysegar>
      <afakulcs>${item.vatRate}</afakulcs>
      <nettoErtek>${(netPrice * item.quantity).toFixed(2)}</nettoErtek>
      <afaErtek>${(vatAmount * item.quantity).toFixed(2)}</afaErtek>
      <bruttoErtek>${item.amount.toFixed(2)}</bruttoErtek>
    </tetel>`;
    })
    .join("\n");

  // Storno-specific XML tags
  const stornoXML = isStorno
    ? `    <sztornozas>true</sztornozas>
    <sztornozott>${stornoInvoiceNumber}</sztornozott>
    <fizetve>true</fizetve>`
    : `    <fizetve>true</fizetve>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${config.apiKey}</szamlaagentkulcs>
    <eszamla>${config.eInvoice}</eszamla>
    <szamlaLetoltes>false</szamlaLetoltes>
  </beallitasok>
  <fejlec>
    <keltDatum>${new Date().toISOString().split("T")[0]}</keltDatum>
    <teljesitesDatum>${new Date().toISOString().split("T")[0]}</teljesitesDatum>
    <fizetesiHataridoDatum>${
      new Date().toISOString().split("T")[0]
    }</fizetesiHataridoDatum>
    <fizmod>Paylink</fizmod>
    <penznem>${data.currency.toUpperCase()}</penznem>
    <szamlaNyelve>hu</szamlaNyelve>
${stornoXML}
  </fejlec>
  <elado>
    <bank>${config.bank}</bank>
    <bankszamlaszam>${config.bankAccountNumber}</bankszamlaszam>
  </elado>
  <vevo>
    <nev>${data.billingAddress.name}</nev>
    <irsz>${data.billingAddress.postalCode}</irsz>
    <telepules>${data.billingAddress.city}</telepules>
    <cim>${data.billingAddress.address}</cim>
    <email>${data.billingAddress.email}</email>
    <adoalany>0</adoalany>
  </vevo>
  <tetelek>
${lineItemsXML}
  </tetelek>
</xmlszamla>`;
};

const callSzamlazzAPI = async (xmlData: string): Promise<string> => {
  const formData = new FormData();
  const blob = new Blob([xmlData], { type: "text/xml" });
  formData.append("action-xmlagentxmlfile", blob, "invoice.xml");

  const response = await fetch(SZAMLAZZ_API_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Számlázz.hu API error: ${errorText}`);
  }

  // Get invoice number from response header
  const invoiceNumber = response.headers.get("szlahu_szamlaszam");

  if (invoiceNumber) {
    console.log(`[Számlázz.hu] Invoice created: ${invoiceNumber}`);
    return invoiceNumber;
  }

  // Fallback: try to read from response body
  const responseText = await response.text();
  const textPart = responseText.split("%PDF-")[0];

  if (textPart && textPart.length > 0) {
    const lines = textPart.split("\n");
    const successLine = lines.find((line) =>
      line.includes("szlahu_szamlaszam")
    );

    if (successLine) {
      const invoiceNumber = successLine.split("=")[1]?.trim();
      if (invoiceNumber) {
        console.log(`[Számlázz.hu] Invoice created: ${invoiceNumber}`);
        return invoiceNumber;
      }
    }
  }

  const preview = responseText.substring(0, 500);
  console.error(
    "[Számlázz.hu] Failed to parse invoice number. Response preview:",
    preview
  );
  throw new Error("Invoice number not found in response");
};

export const generateInvoice = async (data: InvoiceData): Promise<string> => {
  try {
    const config = getSzamlazzConfig();
    const xmlData = buildInvoiceXML(data, config);

    const invoiceNumber = await callSzamlazzAPI(xmlData);

    console.log(`Invoice generated: ${invoiceNumber}`);
    return invoiceNumber;
  } catch (err) {
    const error = err as Error;
    throw new InvoiceGenerationError(
      `Failed to generate invoice: ${error.message}`
    );
  }
};

export const generateRefundInvoice = async (
  originalInvoiceNumber: string,
  data: InvoiceData
): Promise<string> => {
  try {
    const config = getSzamlazzConfig();
    const xmlData = buildInvoiceXML(data, config, originalInvoiceNumber);

    const invoiceNumber = await callSzamlazzAPI(xmlData);

    console.log(
      `Refund invoice generated: ${invoiceNumber} (cancelling ${originalInvoiceNumber})`
    );
    return invoiceNumber;
  } catch (err) {
    const error = err as Error;
    throw new InvoiceGenerationError(
      `Failed to generate refund invoice: ${error.message}`
    );
  }
};
