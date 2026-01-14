import type { InvoiceData } from '../../types/index.js';
import { InvoiceGenerationError } from '../../utils/errors.js';
import { getSzamlazzConfig } from './config.js';
import { buildInvoiceXML, buildStornoXML } from './xml.js';

const callSzamlazzAPI = async (xmlData: string, apiUrl: string): Promise<string> => {
  const formData = new FormData();
  const blob = new Blob([xmlData], { type: 'text/xml' });
  formData.append('action-xmlagentxmlfile', blob, 'invoice.xml');

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Számlázz.hu API error: ${errorText}`);
  }

  // Get invoice number from response header
  const invoiceNumber = response.headers.get('szlahu_szamlaszam');

  if (invoiceNumber) {
    console.log(`[Számlázz.hu] Invoice created: ${invoiceNumber}`);
    return invoiceNumber;
  }

  // Fallback: try to read from response body
  const responseText = await response.text();
  const textPart = responseText.split('%PDF-')[0];

  if (textPart && textPart.length > 0) {
    const lines = textPart.split('\n');
    const successLine = lines.find((line) =>
      line.includes('szlahu_szamlaszam')
    );

    if (successLine) {
      const invoiceNumber = successLine.split('=')[1]?.trim();
      if (invoiceNumber) {
        console.log(`[Számlázz.hu] Invoice created: ${invoiceNumber}`);
        return invoiceNumber;
      }
    }
  }

  const preview = responseText.substring(0, 500);
  console.error(
    '[Számlázz.hu] Failed to parse invoice number. Response preview:',
    preview
  );
  throw new Error('Invoice number not found in response');
};

export const generateInvoice = async (data: InvoiceData): Promise<string> => {
  try {
    const config = getSzamlazzConfig();
    const xmlData = buildInvoiceXML(data, config);

    const invoiceNumber = await callSzamlazzAPI(xmlData, config.apiUrl);

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
    const xmlData = buildStornoXML(data, config, originalInvoiceNumber);

    const invoiceNumber = await callSzamlazzAPI(xmlData, config.apiUrl);

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

// Export types for consumers
export type { SzamlazzConfig } from './config.js';
