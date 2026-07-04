import Dexie, { type Table } from 'dexie';
import {
  Product,
  Customer,
  Supplier,
  Invoice,
  Quotation,
  Purchase,
  Expense,
  Branch,
  AuditLog,
  InvoiceItem,
  InvoiceStatus,
  PaymentMethod,
} from '../types';

class OmElectricalDB extends Dexie {
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;
  suppliers!: Table<Supplier, string>;
  invoices!: Table<Invoice, string>;
  quotations!: Table<Quotation, string>;
  purchases!: Table<Purchase, string>;
  expenses!: Table<Expense, string>;
  branches!: Table<Branch, string>;
  auditLogs!: Table<AuditLog, string>;
  settings!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('OmElectricalDB');
    this.version(1).stores({
      products: 'id, name, sku, barcode, brand, category, supplierId, currentStock',
      customers: 'id, name, phone, email, gstNumber',
      suppliers: 'id, name, phone, gstNumber',
      invoices: 'id, invoiceNumber, date, customerId, branchId, status',
      quotations: 'id, quotationNumber, date, customerId, branchId, status',
      purchases: 'id, purchaseNumber, date, supplierId, branchId',
      expenses: 'id, date, category, branchId',
      branches: 'id, name',
      auditLogs: 'id, timestamp, userId, branchId',
      settings: 'key',
    });
  }
}

export const db = new OmElectricalDB();

// Helper to seed initial data if database is empty
export async function seedDatabase() {
  const branchCount = await db.branches.count();
  if (branchCount > 0) return; // DB already seeded

  // 1. Seed Branches
  const defaultBranch: Branch = {
    id: 'br-main',
    name: 'OM Electrical (Main Head Office)',
    address: 'Shop No. 12, Electric Plaza, Central Market, New Delhi - 110001',
    phone: '+91 98765 43210',
    gstNumber: '07AAAAA1111A1Z1',
  };
  const secondaryBranch: Branch = {
    id: 'br-sub',
    name: 'OM Electrical (Warehouse & Outlet)',
    address: 'Plot 45, Sector 5, Industrial Area, Noida - 201301',
    phone: '+91 98765 43222',
    gstNumber: '09AAAAA1111A1Z2',
  };

  await db.branches.bulkPut([defaultBranch, secondaryBranch]);

  // Set default settings
  await db.settings.bulkPut([
    {
      key: 'companyInfo',
      value: {
        name: 'OM Electrical',
        email: 'billing@omelectrical.com',
        phone: '+91 98765 43210',
        website: 'www.omelectrical.com',
        gstNumber: '07AAAAA1111A1Z1',
        bankDetails: {
          bankName: 'State Bank of India',
          accountNumber: '32109876543',
          ifscCode: 'SBIN0001234',
          branchName: 'Central Market Branch, New Delhi',
        },
        terms: '1. Goods once sold will not be taken back.\n2. Interest @18% will be charged if payment is not made within 15 days.\n3. All disputes are subject to Delhi jurisdiction.',
        invoicePrefix: 'OME/',
        invoiceFooter: 'Thank you for your business! Visit again.',
        logo: '',
      },
    },
    {
      key: 'activeUser',
      value: {
        id: 'u-1',
        name: 'Nitish Kushwaha',
        email: 'nitish@omelectrical.com',
        role: 'Super Admin',
        branchId: 'br-main',
      },
    },
    {
      key: 'printerSettings',
      value: {
        type: 'A4', // A4 or Thermal
        thermalWidth: '80mm',
        autoPrint: false,
      },
    },
  ]);

  // Seed Audit Logs
  const auditLogs: AuditLog[] = [
    {
      id: 'log-1',
      timestamp: new Date(),
      userId: 'u-1',
      userName: 'Nitish Kushwaha',
      userRole: 'Super Admin',
      action: 'SYSTEM_INIT',
      details: 'OM Electrical Billing System initialized. Clean Database setup.',
      branchId: 'br-main',
    },
  ];
  await db.auditLogs.bulkPut(auditLogs);
}
