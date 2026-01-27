import { google } from 'googleapis';
import type { SheetsRow } from '../types/index.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export const isSheetsEnabled = (): boolean => {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return !!json && json !== '{"type":"service_account","project_id":"..."}';
};

const getAuthClient = () => {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!credentialsJson || credentialsJson === '{"type":"service_account","project_id":"..."}') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON contains invalid JSON');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES
  });

  return auth;
};

const getSheetsClient = async () => {
  const auth = getAuthClient();
  const authClient = await auth.getClient();

  return google.sheets({ version: 'v4', auth: authClient as any });
};

export const appendRowToSheet = async (row: SheetsRow, sheetName = 'Sheet1'): Promise<void> => {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_ID not configured');
  }

  const values = [
    [
      row.date,
      row.customerName,
      row.email,
      row.amount,
      row.productName,
      row.quantity,
      row.vatRate,
      row.address,
      row.invoiceNumber,
      row.invoiceStatus,
      row.stripePaymentId
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:K`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
};

export const updateInvoiceStatus = async (
  stripePaymentId: string,
  invoiceNumber: string,
  status: SheetsRow['invoiceStatus'],
  sheetName = 'Sheet1'
): Promise<void> => {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_ID not configured');
  }

  // Find ALL rows with matching Stripe Payment ID (multiple products)
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:K`
  });

  const rows = response.data.values ?? [];
  const matchingRowIndices = rows
    .map((row, index) => (row[10] === stripePaymentId ? index : -1))
    .filter(index => index !== -1);

  if (matchingRowIndices.length === 0) {
    throw new Error(`Payment ${stripePaymentId} not found in sheet`);
  }

  // Update invoice number (column I) and status (column J) for ALL matching rows
  for (const rowIndex of matchingRowIndices) {
    const rowNumber = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!I${rowNumber}:J${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[invoiceNumber, status]]
      }
    });
  }
};
