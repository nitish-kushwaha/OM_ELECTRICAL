export type UserRole =
  | 'Super Admin'
  | 'Owner'
  | 'Accountant'
  | 'Cashier'
  | 'Store Manager'
  | 'Sales Executive';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  gstNumber: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  category: string;
  hsnCode: string;
  gstPercent: number; // e.g., 18 for 18%
  purchasePrice: number;
  sellingPrice: number; // default retail
  mrp: number;
  wholesalePrice: number;
  retailPrice: number;
  dealerPrice: number;
  unit: string; // Pcs, Mtr, Box, Roll, etc.
  color?: string;
  warranty?: string; // in months/years
  location?: string; // warehouse rack position
  supplierId?: string;
  minQuantity: number; // for low stock alerts
  openingStock: number;
  currentStock: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumber?: string;
  images?: string[];
  description?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstNumber?: string; // Optional GSTIN
  creditLimit: number;
  outstandingAmount: number;
  notes?: string;
  birthday?: string; // YYYY-MM-DD
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  bankDetails?: BankDetails;
  pendingAmount: number;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  price: number; // Rate per unit before tax
  mrp: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number; // Quantity * Rate - Discount + Taxes
}

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Credit Sale' | 'Split Payment';

export interface SplitPaymentDetail {
  method: Exclude<PaymentMethod, 'Split Payment'>;
  amount: number;
}

export type InvoiceStatus = 'Paid' | 'Unpaid' | 'Partially Paid' | 'Cancelled' | 'Returned';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: Date;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerGst?: string;
  items: InvoiceItem[];
  subtotal: number; // sum before discount & tax
  discountTotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentMethod: PaymentMethod;
  splitDetails?: SplitPaymentDetail[];
  status: InvoiceStatus;
  branchId: string;
  createdBy: string; // User ID
  createdByName: string;
  notes?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  isReturn?: boolean;
  originalInvoiceId?: string;
  termsAndConditions?: string;
}

export type QuotationStatus = 'Pending' | 'Approved' | 'Expired' | 'Converted';

export interface Quotation {
  id: string;
  quotationNumber: string;
  date: Date;
  expiryDate: Date;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerGst?: string;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  status: QuotationStatus;
  convertedInvoiceId?: string;
  branchId: string;
  createdBy: string;
  createdByName: string;
  notes?: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  purchasePrice: number;
  mrp: number;
  gstPercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  billNumber?: string; // Supplier's invoice number
  date: Date;
  supplierId: string;
  supplierName: string;
  supplierGst?: string;
  items: PurchaseItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentMethod: Exclude<PaymentMethod, 'Split Payment' | 'Credit Sale'> | 'Credit';
  status: 'Paid' | 'Unpaid' | 'Partially Paid';
  branchId: string;
  notes?: string;
}

export interface Expense {
  id: string;
  date: Date;
  category: 'Salary' | 'Rent' | 'Electricity' | 'Fuel' | 'Transportation' | 'Internet' | 'Office Expense' | 'Miscellaneous';
  amount: number;
  description: string;
  paymentMethod: string;
  referenceNumber?: string;
  branchId: string;
  createdBy: string;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string; // e.g. CREATE_INVOICE, STOCK_ADJUST, CANCEL_INVOICE
  details: string;
  branchId: string;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}
