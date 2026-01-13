export interface StripeCustomField {
  key: string;
  label: {
    custom: string;
    type: string;
  };
  optional: boolean;
  type: 'numeric' | 'text';
  numeric?: {
    default_value: string | null;
    maximum_length: number | null;
    minimum_length: number | null;
    value: string;
  };
  text?: {
    default_value: string | null;
    maximum_length: number | null;
    minimum_length: number | null;
    value: string;
  };
}

export interface BillingAddress {
  name: string;
  email: string;
  postalCode: string;
  city: string;
  address: string;
  country: string;
}

export interface InvoiceLineItem {
  productName: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatRate: number;
  vatType: string;
}

export interface InvoiceData {
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  currency: string;
  lineItems: InvoiceLineItem[];
  billingAddress: BillingAddress;
  stripePaymentId: string;
}

export interface SheetsRow {
  date: string;
  customerName: string;
  email: string;
  amount: string;
  productName: string;
  quantity: number;
  vatRate: string;
  address: string;
  invoiceNumber: string;
  invoiceStatus: 'Függőben' | 'Kiállítva' | 'Sztornózva' | 'Hiba';
  stripePaymentId: string;
}

export interface VATConfig {
  rate: number;
  type: string; // Számlázz.hu ÁFA típus kódja: AAM, TAM, etc.
}
