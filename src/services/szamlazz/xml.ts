import type { InvoiceData } from '../../types/index.js';
import { XML_SETTINGS, type SzamlazzConfig } from './config.js';

/**
 * Builds a standard invoice XML for Számlázz.hu API
 */
export const buildInvoiceXML = (
  data: InvoiceData,
  config: SzamlazzConfig
): string => {
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
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="${XML_SETTINGS.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${XML_SETTINGS.namespace} ${XML_SETTINGS.schemaLocation}">
  <beallitasok>
    <szamlaagentkulcs>${config.apiKey}</szamlaagentkulcs>
    <eszamla>${config.eInvoice}</eszamla>
    <szamlaLetoltes>${XML_SETTINGS.downloadInvoice}</szamlaLetoltes>
    <valaszVerzio>${XML_SETTINGS.responseVersion}</valaszVerzio>
  </beallitasok>
  <fejlec>
    <keltDatum>${new Date().toISOString().split('T')[0]}</keltDatum>
    <teljesitesDatum>${new Date().toISOString().split('T')[0]}</teljesitesDatum>
    <fizetesiHataridoDatum>${new Date().toISOString().split('T')[0]}</fizetesiHataridoDatum>
    <fizmod>Paylink</fizmod>
    <penznem>${data.currency.toUpperCase()}</penznem>
    <szamlaNyelve>hu</szamlaNyelve>
    <fizetve>true</fizetve>
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
    <sendEmail>true</sendEmail>
    <adoalany>0</adoalany>
  </vevo>
  <tetelek>
${lineItemsXML}
  </tetelek>
</xmlszamla>`;
};

/**
 * Builds a storno (refund) invoice XML for Számlázz.hu API
 */
export const buildStornoXML = (
  data: InvoiceData,
  config: SzamlazzConfig,
  originalInvoiceNumber: string
): string => {
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
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="${XML_SETTINGS.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${XML_SETTINGS.namespace} ${XML_SETTINGS.schemaLocation}">
  <beallitasok>
    <szamlaagentkulcs>${config.apiKey}</szamlaagentkulcs>
    <eszamla>${config.eInvoice}</eszamla>
    <szamlaLetoltes>${XML_SETTINGS.downloadInvoice}</szamlaLetoltes>
    <valaszVerzio>${XML_SETTINGS.responseVersion}</valaszVerzio>
  </beallitasok>
  <fejlec>
    <keltDatum>${new Date().toISOString().split('T')[0]}</keltDatum>
    <teljesitesDatum>${new Date().toISOString().split('T')[0]}</teljesitesDatum>
    <fizetesiHataridoDatum>${new Date().toISOString().split('T')[0]}</fizetesiHataridoDatum>
    <fizmod>Paylink</fizmod>
    <penznem>${data.currency.toUpperCase()}</penznem>
    <szamlaNyelve>hu</szamlaNyelve>
    <sztornozas>true</sztornozas>
    <sztornozott>${originalInvoiceNumber}</sztornozott>
    <fizetve>true</fizetve>
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
    <sendEmail>true</sendEmail>
    <adoalany>0</adoalany>
  </vevo>
  <tetelek>
${lineItemsXML}
  </tetelek>
</xmlszamla>`;
};
