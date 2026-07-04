import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Product, Customer, InvoiceItem, PaymentMethod, SplitPaymentDetail, InvoiceStatus } from '../types';
import { useApp } from '../context/AppContext';
import {
  Search,
  Barcode,
  User,
  Plus,
  Trash2,
  Printer,
  FileDown,
  Mail,
  Send,
  X,
  CreditCard,
  Percent,
  CheckCircle,
  AlertCircle,
  Copy,
  Undo2,
  Trash,
  Camera,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import { QrScannerModal } from '../components/QrScannerModal';

export const Billing: React.FC = () => {
  const { activeUser, activeBranch, companyInfo, printerSettings, logAction } = useApp();

  // --- LIVE DATA ---
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const invoices = useLiveQuery(() => db.invoices.toArray()) || [];

  // --- BILLING STATE ---
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [splitDetails, setSplitDetails] = useState<SplitPaymentDetail[]>([
    { method: 'Cash', amount: 0 },
    { method: 'UPI', amount: 0 },
  ]);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0); // Global discount
  const [notes, setNotes] = useState<string>('');

  // UI States
  const [productQuery, setProductQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [isQrScanOpen, setIsQrScanOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);

  // New Customer Form State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustGst, setNewCustGst] = useState('');
  const [newCustCreditLimit, setNewCustCreditLimit] = useState(50000);

  // --- BARCODE SCANNER INTEGRATION (KEYSTROKE BUFFER) ---
  const barcodeBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      
      // If time delta is small, buffer it (barcode scanners type very fast)
      if (currentTime - lastKeyTime.current < 50) {
        if (e.key === 'Enter') {
          const barcode = barcodeBuffer.current.trim();
          if (barcode) {
            handleBarcodeScanned(barcode);
          }
          barcodeBuffer.current = '';
        } else if (e.key !== 'Shift') {
          barcodeBuffer.current += e.key;
        }
      } else {
        // Reset buffer if delay is too long (human typing)
        if (e.key !== 'Enter' && e.key !== 'Shift') {
          barcodeBuffer.current = e.key;
        }
      }
      lastKeyTime.current = currentTime;
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [products, cart]);

  const handleBarcodeScanned = (barcode: string) => {
    const prod = products.find(p => p.barcode === barcode || p.sku.toLowerCase() === barcode.toLowerCase());
    if (prod) {
      addToCart(prod);
      toast.success(`Scanned: ${prod.name}`);
    } else {
      toast.error(`Barcode / SKU "${barcode}" not found`);
    }
  };

  // --- INVOICE NUMBER GENERATION ---
  const generatedInvoiceNumber = useMemo(() => {
    const prefix = companyInfo?.invoicePrefix || 'OME/';
    const year = new Date().getFullYear();
    const count = invoices.length + 1;
    return `${prefix}${year}/${String(count).padStart(5, '0')}`;
  }, [invoices, companyInfo]);

  // --- CART OPERATIONS ---
  const addToCart = (product: Product) => {
    if (product.currentStock <= 0) {
      toast.error(`${product.name} is out of stock!`);
      return;
    }

    const existingIndex = cart.findIndex(item => item.productId === product.id);
    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const newQty = updatedCart[existingIndex].quantity + 1;
      
      if (newQty > product.currentStock) {
        toast.error(`Cannot exceed current stock of ${product.currentStock} ${product.unit}`);
        return;
      }
      
      updatedCart[existingIndex].quantity = newQty;
      recalculateCartItem(updatedCart[existingIndex], product);
      setCart(updatedCart);
    } else {
      const newItem: InvoiceItem = {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        hsnCode: product.hsnCode,
        quantity: 1,
        unit: product.unit,
        price: product.retailPrice,
        mrp: product.mrp,
        discountPercent: 0,
        discountAmount: 0,
        gstPercent: product.gstPercent,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
      };
      recalculateCartItem(newItem, product);
      setCart([...cart, newItem]);
    }
  };

  const updateCartItemQuantity = (index: number, quantity: number) => {
    const item = cart[index];
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return;

    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }

    if (quantity > prod.currentStock) {
      toast.error(`Cannot exceed current stock of ${prod.currentStock} ${prod.unit}`);
      return;
    }

    const updatedCart = [...cart];
    updatedCart[index].quantity = quantity;
    recalculateCartItem(updatedCart[index], prod);
    setCart(updatedCart);
  };

  const updateCartItemPrice = (index: number, price: number) => {
    const item = cart[index];
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return;

    const updatedCart = [...cart];
    updatedCart[index].price = price;
    recalculateCartItem(updatedCart[index], prod);
    setCart(updatedCart);
  };

  const updateCartItemDiscount = (index: number, discountPercent: number) => {
    const item = cart[index];
    const prod = products.find(p => p.id === item.productId);
    if (!prod) return;

    const updatedCart = [...cart];
    updatedCart[index].discountPercent = discountPercent;
    recalculateCartItem(updatedCart[index], prod);
    setCart(updatedCart);
  };

  const removeFromCart = (index: number) => {
    const updatedCart = cart.filter((_, i) => i !== index);
    setCart(updatedCart);
  };

  const recalculateCartItem = (item: InvoiceItem, product: Product) => {
    const baseTotal = item.quantity * item.price;
    const discountAmount = (baseTotal * item.discountPercent) / 100;
    const taxableValue = baseTotal - discountAmount;
    
    // Taxes
    const isInterState = selectedCustomer?.gstNumber?.substring(0, 2) !== companyInfo?.gstNumber?.substring(0, 2);
    const taxAmount = (taxableValue * item.gstPercent) / 100;

    if (isInterState) {
      item.igst = taxAmount;
      item.cgst = 0;
      item.sgst = 0;
    } else {
      item.igst = 0;
      item.cgst = taxAmount / 2;
      item.sgst = taxAmount / 2;
    }

    item.discountAmount = discountAmount;
    item.total = taxableValue + taxAmount;
  };

  // --- CALCULATION TOTALS ---
  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    cart.forEach(item => {
      subtotal += item.quantity * item.price;
      discountTotal += item.discountAmount;
      taxTotal += (item.cgst + item.sgst + item.igst);
      cgstTotal += item.cgst;
      sgstTotal += item.sgst;
      igstTotal += item.igst;
    });

    // Apply global discount
    const globalDiscountAmount = ((subtotal - discountTotal) * discountPercent) / 100;
    const netDiscountTotal = discountTotal + globalDiscountAmount;

    // Re-adjust tax if global discount changes taxable values
    const scaleFactor = subtotal > 0 ? (subtotal - netDiscountTotal) / subtotal : 1;
    const adjustedTaxTotal = taxTotal * scaleFactor;
    const adjustedCgst = cgstTotal * scaleFactor;
    const adjustedSgst = sgstTotal * scaleFactor;
    const adjustedIgst = igstTotal * scaleFactor;

    const tempTotal = subtotal - netDiscountTotal + adjustedTaxTotal;
    const grandTotal = Math.round(tempTotal);
    const roundOff = Number((grandTotal - tempTotal).toFixed(2));

    return {
      subtotal,
      discountTotal: netDiscountTotal,
      taxTotal: adjustedTaxTotal,
      cgstTotal: adjustedCgst,
      sgstTotal: adjustedSgst,
      igstTotal: adjustedIgst,
      roundOff,
      grandTotal,
    };
  }, [cart, discountPercent, selectedCustomer, companyInfo]);

  // Handle Split and Paid amounts on total update
  useEffect(() => {
    if (paymentMethod !== 'Split Payment') {
      setPaidAmount(paymentMethod === 'Credit Sale' ? 0 : totals.grandTotal);
    }
  }, [totals.grandTotal, paymentMethod]);

  // --- CUSTOMER ACTIONS ---
  const handleAddNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) {
      toast.error('Name and Phone are required!');
      return;
    }
    const newCust = {
      id: `cust-${Date.now()}`,
      name: newCustName,
      phone: newCustPhone,
      gstNumber: newCustGst || undefined,
      creditLimit: newCustCreditLimit,
      outstandingAmount: 0,
    };

    await db.customers.add(newCust);
    setSelectedCustomer(newCust);
    setIsCustomerModalOpen(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustGst('');
    toast.success('Customer added successfully!');
  };

  // --- INVOICE FINALIZE ---
  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty!');
      return;
    }

    if (!selectedCustomer) {
      toast.error('Please select a customer!');
      return;
    }

    if (paymentMethod === 'Credit Sale') {
      const oustandingAfterSale = selectedCustomer.outstandingAmount + totals.grandTotal;
      if (oustandingAfterSale > selectedCustomer.creditLimit) {
        toast.error(`Exceeds Customer Credit Limit of ₹${selectedCustomer.creditLimit.toLocaleString('en-IN')}`);
        return;
      }
    }

    setIsInvoiceModalOpen(true);
  };

  const confirmInvoiceCreation = async () => {
    try {
      if (!selectedCustomer || !activeUser || !activeBranch) return;

      const outstandingAmount = totals.grandTotal - paidAmount;
      const status: InvoiceStatus =
        outstandingAmount === 0
          ? 'Paid'
          : paidAmount === 0
          ? 'Unpaid'
          : 'Partially Paid';

      const newInvoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber: generatedInvoiceNumber,
        date: new Date(),
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        customerGst: selectedCustomer.gstNumber,
        items: cart,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paidAmount,
        outstandingAmount,
        paymentMethod,
        splitDetails: paymentMethod === 'Split Payment' ? splitDetails : undefined,
        status,
        branchId: activeBranch.id,
        createdBy: activeUser.id,
        createdByName: activeUser.name,
        notes,
      };

      // 1. Write invoice to IndexedDB
      await db.invoices.add(newInvoice);

      // 2. Decrement stock of products
      for (const item of cart) {
        const p = products.find(prod => prod.id === item.productId);
        if (p) {
          await db.products.update(p.id, {
            currentStock: p.currentStock - item.quantity,
          });
        }
      }

      // 3. Update customer outstanding balance if credit/partial
      if (outstandingAmount > 0) {
        await db.customers.update(selectedCustomer.id, {
          outstandingAmount: selectedCustomer.outstandingAmount + outstandingAmount,
        });
      }

      // 4. Log Audit Activity
      await logAction(
        'CREATE_INVOICE',
        `Generated Invoice ${newInvoice.invoiceNumber} for ${selectedCustomer.name} (Total: ₹${totals.grandTotal})`
      );

      setCreatedInvoice(newInvoice);
      toast.success(`Invoice ${newInvoice.invoiceNumber} generated!`);
      setIsInvoiceModalOpen(false);

      // Reset Billing form
      setCart([]);
      setSelectedCustomer(null);
      setDiscountPercent(0);
      setNotes('');
      setPaymentMethod('Cash');
    } catch (e) {
      console.error('Invoice checkout error:', e);
      toast.error('Failed to generate invoice.');
    }
  };

  // --- PRINT LAYOUT LOGIC ---
  const handlePrint = (invoiceToPrint: any) => {
    const isThermal = printerSettings?.type === 'Thermal';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const company = companyInfo || {};

    let itemsHtml = '';
    invoiceToPrint.items.forEach((item: any, index: number) => {
      itemsHtml += `
        <tr>
          <td>${index + 1}</td>
          <td>${item.productName}</td>
          <td>${item.hsnCode || ''}</td>
          <td>${item.price.toFixed(2)}</td>
          <td>${item.quantity} ${item.unit}</td>
          <td>${item.discountPercent}%</td>
          <td>${item.gstPercent}%</td>
          <td align="right">${item.total.toFixed(2)}</td>
        </tr>
      `;
    });

    const isInterState = invoiceToPrint.customerGst && invoiceToPrint.customerGst.substring(0, 2) !== company.gstNumber?.substring(0, 2);

    const styleBlock = isThermal
      ? `
      <style>
        body { font-family: monospace; font-size: 11px; width: 72mm; margin: 0 auto; padding: 4px; }
        h3, p { text-align: center; margin: 2px 0; }
        .divider { border-top: 1px dashed #000; margin: 5px 0; }
        table { width: 100%; font-size: 10px; border-collapse: collapse; }
        th { text-align: left; }
        .text-right { text-align: right; }
        .total-box { margin-top: 5px; font-weight: bold; }
        @media print { body { width: 72mm; } }
      </style>
    `
      : `
      <style>
        body { font-family: sans-serif; font-size: 13px; color: #333; padding: 20px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #ddd; padding-bottom: 15px; }
        .company-details { text-align: right; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .totals-table { width: 40%; margin-left: auto; margin-top: 15px; border: none; }
        .totals-table td { border: none; padding: 4px; }
        .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #777; border-top: 1px solid #ddd; padding-top: 10px; }
      </style>
    `;

    const bodyContent = isThermal
      ? `
      <h3>${company.name || 'OM ELECTRICAL'}</h3>
      <p>${company.address || ''}</p>
      <p>GSTIN: ${company.gstNumber || ''}</p>
      <p>Phone: ${company.phone || ''}</p>
      <div class="divider"></div>
      <p>Invoice: <b>${invoiceToPrint.invoiceNumber}</b></p>
      <p>Date: ${new Date(invoiceToPrint.date).toLocaleString('en-IN')}</p>
      <p>Cust: ${invoiceToPrint.customerName} (${invoiceToPrint.customerPhone})</p>
      <div class="divider"></div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th class="text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceToPrint.items.map((i: any) => `
            <tr>
              <td>${i.productName.substring(0, 15)}</td>
              <td>${i.quantity}</td>
              <td class="text-right">₹${i.total.toFixed(0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="divider"></div>
      <div class="total-box">
        <div style="display:flex; justify-content:space-between"><span>Subtotal:</span><span>₹${invoiceToPrint.subtotal.toFixed(2)}</span></div>
        <div style="display:flex; justify-content:space-between"><span>Taxes:</span><span>₹${invoiceToPrint.taxTotal.toFixed(2)}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:13px;"><span>Grand Total:</span><span>₹${invoiceToPrint.grandTotal}</span></div>
      </div>
      <div class="divider"></div>
      <p>${company.invoiceFooter || 'Thank you for shopping!'}</p>
    `
      : `
      <div class="header">
        <div>
          <h2 style="margin: 0; color: #f59e0b;">${company.name || 'OM ELECTRICAL'}</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">Electrical Wholesalers & Retailers</p>
        </div>
        <div class="company-details">
          <p><b>GSTIN:</b> ${company.gstNumber || ''}</p>
          <p><b>Phone:</b> ${company.phone || ''}</p>
          <p><b>Email:</b> ${company.email || ''}</p>
          <p><b>Web:</b> ${company.website || ''}</p>
        </div>
      </div>

      <div class="details-grid">
        <div>
          <h4 style="margin:0 0 8px 0; color:#555;">TAX INVOICE TO</h4>
          <p><b>Name:</b> ${invoiceToPrint.customerName}</p>
          <p><b>Phone:</b> ${invoiceToPrint.customerPhone}</p>
          ${invoiceToPrint.customerGst ? `<p><b>GSTIN:</b> ${invoiceToPrint.customerGst}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <h4 style="margin:0 0 8px 0; color:#555;">INVOICE DETAILS</h4>
          <p><b>Invoice No:</b> <span style="color:#f59e0b; font-weight:bold;">${invoiceToPrint.invoiceNumber}</span></p>
          <p><b>Date:</b> ${new Date(invoiceToPrint.date).toLocaleString('en-IN')}</p>
          <p><b>Payment Status:</b> <span style="text-transform:uppercase; font-weight:bold; color: ${invoiceToPrint.status === 'Paid' ? '#10b981' : '#f59e0b'}">${invoiceToPrint.status}</span></p>
          <p><b>Payment Mode:</b> ${invoiceToPrint.paymentMethod}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th width="5%">S.No</th>
            <th width="40%">Description of Goods</th>
            <th width="10%">HSN</th>
            <th width="10%">Rate</th>
            <th width="10%">Qty</th>
            <th width="8%">Disc</th>
            <th width="8%">GST</th>
            <th width="12%" class="text-right font-semibold">Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td class="text-right">₹${invoiceToPrint.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Discount Total:</td>
          <td class="text-right">₹${invoiceToPrint.discountTotal.toFixed(2)}</td>
        </tr>
        ${isInterState ? `
          <tr>
            <td>IGST:</td>
            <td class="text-right">₹${invoiceToPrint.igstTotal.toFixed(2)}</td>
          </tr>
        ` : `
          <tr>
            <td>CGST:</td>
            <td class="text-right">₹${invoiceToPrint.cgstTotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td>SGST:</td>
            <td class="text-right">₹${invoiceToPrint.sgstTotal.toFixed(2)}</td>
          </tr>
        `}
        <tr>
          <td>Round Off:</td>
          <td class="text-right">₹${invoiceToPrint.roundOff.toFixed(2)}</td>
        </tr>
        <tr style="font-weight: bold; border-top: 1px solid #333; font-size: 14px;">
          <td>Grand Total:</td>
          <td class="text-right">₹${invoiceToPrint.grandTotal.toLocaleString('en-IN')}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; border: 1px solid #ddd; padding: 10px; border-radius: 6px; font-size: 11px;">
        <h5 style="margin: 0 0 5px 0;">Bank Account Details for Payment:</h5>
        <p><b>Bank Name:</b> ${company.bankDetails?.bankName || ''} | <b>Account Number:</b> ${company.bankDetails?.accountNumber || ''}</p>
        <p><b>IFSC Code:</b> ${company.bankDetails?.ifscCode || ''} | <b>Branch:</b> ${company.bankDetails?.branchName || ''}</p>
      </div>

      <div class="footer">
        <p>${company.invoiceFooter || 'Thank you for your business!'}</p>
        <p style="font-size: 9px; color: #bbb; margin-top: 5px;">Powerd by OM Electrical Billing Systems</p>
      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Invoice - ${invoiceToPrint.invoiceNumber}</title>
          ${styleBlock}
        </head>
        <body>
          ${bodyContent}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPDF = (invoiceToDownload: any) => {
    const doc = new jsPDF();
    const company = companyInfo || {};

    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text(company.name || 'OM ELECTRICAL', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`GSTIN: ${company.gstNumber || ''}`, 14, 26);
    doc.text(`Phone: ${company.phone || ''}`, 14, 31);
    doc.text(`Email: ${company.email || ''}`, 14, 36);

    doc.setFontSize(14);
    doc.setTextColor(50);
    doc.text('TAX INVOICE', 140, 20);

    doc.setFontSize(10);
    doc.text(`Invoice No: ${invoiceToDownload.invoiceNumber}`, 140, 26);
    doc.text(`Date: ${new Date(invoiceToDownload.date).toLocaleDateString('en-IN')}`, 140, 31);
    doc.text(`Status: ${invoiceToDownload.status}`, 140, 36);

    doc.line(14, 42, 196, 42);

    // Bill To
    doc.text('BILL TO:', 14, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(invoiceToDownload.customerName, 14, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: ${invoiceToDownload.customerPhone}`, 14, 60);
    if (invoiceToDownload.customerGst) {
      doc.text(`GSTIN: ${invoiceToDownload.customerGst}`, 14, 65);
    }

    // Table Header
    let y = 78;
    doc.setFillColor(245, 158, 11);
    doc.rect(14, y, 182, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('S.No', 16, y + 5);
    doc.text('Item Description', 28, y + 5);
    doc.text('Rate (Rs.)', 105, y + 5);
    doc.text('Qty', 130, y + 5);
    doc.text('GST %', 150, y + 5);
    doc.text('Total (Rs.)', 172, y + 5);

    doc.setTextColor(50);
    doc.setFont('helvetica', 'normal');

    invoiceToDownload.items.forEach((item: any, idx: number) => {
      y += 8;
      doc.text(String(idx + 1), 16, y + 5);
      doc.text(item.productName.substring(0, 38), 28, y + 5);
      doc.text(item.price.toFixed(2), 105, y + 5);
      doc.text(`${item.quantity} ${item.unit}`, 130, y + 5);
      doc.text(`${item.gstPercent}%`, 150, y + 5);
      doc.text(item.total.toFixed(2), 172, y + 5);
    });

    // Summary box
    y += 15;
    doc.line(14, y, 196, y);
    y += 5;
    doc.text(`Subtotal:`, 130, y);
    doc.text(`Rs. ${invoiceToDownload.subtotal.toFixed(2)}`, 172, y);

    y += 5;
    doc.text(`Discount Total:`, 130, y);
    doc.text(`Rs. ${invoiceToDownload.discountTotal.toFixed(2)}`, 172, y);

    y += 5;
    doc.text(`Tax Total:`, 130, y);
    doc.text(`Rs. ${invoiceToDownload.taxTotal.toFixed(2)}`, 172, y);

    y += 5;
    doc.text(`Round Off:`, 130, y);
    doc.text(`Rs. ${invoiceToDownload.roundOff.toFixed(2)}`, 172, y);

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total:`, 130, y);
    doc.text(`Rs. ${invoiceToDownload.grandTotal.toLocaleString('en-IN')}`, 172, y);

    // Save PDF
    doc.save(`Invoice_${invoiceToDownload.invoiceNumber.replace('/', '_')}.pdf`);
    toast.success('PDF downloaded successfully!');
  };

  // --- MOCK DIGITAL UTILS ---
  const handleEmailInvoice = (invNum: string) => {
    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1000)),
      {
        loading: 'Compiling mail templates...',
        success: `Email sent containing Invoice ${invNum} PDF copy!`,
        error: 'Failed to send mail',
      }
    );
  };

  const handleWhatsappInvoice = (invNum: string, phone: string) => {
    const text = `Hello, thank you for purchasing from OM Electrical. Your invoice ${invNum} total is ₹${totals.grandTotal.toLocaleString('en-IN')}. Download your invoice here: http://omelectrical.com/invoice/pdf`;
    const encodedText = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?phone=+91${phone}&text=${encodedText}`, '_blank');
  };

  // --- FILTERS ---
  const filteredProducts = products.filter(
    p =>
      p.name.toLowerCase().includes(productQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(productQuery.toLowerCase()) ||
      p.barcode.includes(productQuery)
  );

  const filteredCustomers = customers.filter(
    c =>
      c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
      c.phone.includes(customerQuery)
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* LEFT: PRODUCTS LIST & CART COMPILER */}
      <div className="xl:col-span-2 space-y-6">
        {/* Product Search & Scanner Display */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="font-bold text-base font-heading flex items-center gap-2">
              <Barcode className="h-5 w-5 text-amber-500" />
              Scan or Search Products
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-amber-500 font-bold bg-amber-500/10 px-2.5 py-1 rounded">
              <span className="h-2 w-2 bg-amber-500 rounded-full animate-ping" />
              <span>Barcode listener active (Press keys directly)</span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search product name, SKU, or scan barcode..."
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-amber-500"
              />
              {productQuery && (
                <button
                  onClick={() => setProductQuery('')}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsQrScanOpen(true)}
              type="button"
              className="p-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center justify-center hover:bg-amber-400 transition-colors shrink-0"
              title="Scan QR / Barcode using Camera"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Autocomplete list */}
          {productQuery && (
            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-900/10 backdrop-blur">
              {filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">No products matching criteria.</div>
              ) : (
                filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      addToCart(p);
                      setProductQuery('');
                    }}
                    disabled={p.currentStock <= 0}
                    className="w-full text-left px-4 py-2.5 text-xs flex justify-between items-center hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                  >
                    <div>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">{p.name}</p>
                      <p className="text-[10px] text-zinc-400">SKU: {p.sku} | Barcode: {p.barcode}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-500">₹{p.retailPrice}</p>
                      <p className={`text-[9px] font-bold ${p.currentStock <= p.minQuantity ? 'text-rose-500' : 'text-zinc-500'}`}>
                        Stock: {p.currentStock} {p.unit}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Cart Itemized Table */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-base font-heading">Invoice Cart Items</h3>
            <span className="text-xs bg-zinc-100 dark:bg-zinc-900 px-3 py-1 rounded-full font-bold">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} Items
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-20 text-center text-zinc-500 text-sm flex flex-col items-center gap-3">
              <Plus className="h-10 w-10 text-amber-500/40" />
              <p>Scan barcode or search products above to start billing</p>
            </div>
          ) : (
            <div className="mt-4">
              {/* Mobile View: Card List */}
              <div className="md:hidden space-y-3">
                {cart.map((item, idx) => (
                  <div key={item.productId} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-500/5 space-y-3 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-zinc-805 dark:text-zinc-200">{item.productName}</p>
                        <span className="text-[10px] text-zinc-400">HSN: {item.hsnCode} | GST: {item.gstPercent}%</span>
                      </div>
                      <button
                        onClick={() => removeFromCart(idx)}
                        className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex justify-between items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">Rate (₹)</span>
                        <input
                          type="number"
                          value={item.price}
                          onChange={e => updateCartItemPrice(idx, parseFloat(e.target.value) || 0)}
                          className="w-16 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1 items-center">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">Quantity</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateCartItemQuantity(idx, item.quantity - 1)}
                            className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center hover:bg-amber-500 hover:text-zinc-950 font-bold"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(idx, item.quantity + 1)}
                            className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center hover:bg-amber-500 hover:text-zinc-950 font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 items-center">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">Disc %</span>
                        <input
                          type="number"
                          value={item.discountPercent}
                          onChange={e => updateCartItemDiscount(idx, parseFloat(e.target.value) || 0)}
                          className="w-10 p-1 text-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">Total</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-100">₹{item.total.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View: Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                      <th className="pb-3 text-center w-[5%]">#</th>
                      <th className="pb-3 w-[40%]">Item Name</th>
                      <th className="pb-3 w-[12%]">Rate (₹)</th>
                      <th className="pb-3 text-center w-[15%]">Qty</th>
                      <th className="pb-3 text-center w-[10%]">Disc %</th>
                      <th className="pb-3 text-right w-[13%]">Total (₹)</th>
                      <th className="pb-3 text-center w-[5%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                    {cart.map((item, idx) => (
                      <tr key={item.productId} className="hover:bg-zinc-500/5 transition-colors">
                        <td className="py-3 text-center text-zinc-400 font-semibold">{idx + 1}</td>
                        <td className="py-3 font-semibold text-zinc-800 dark:text-zinc-200">
                          <div>
                            <p className="truncate max-w-[200px] sm:max-w-xs">{item.productName}</p>
                            <span className="text-[9px] text-zinc-400">HSN: {item.hsnCode} | GST: {item.gstPercent}%</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <input
                            type="number"
                            value={item.price}
                            onChange={e => updateCartItemPrice(idx, parseFloat(e.target.value) || 0)}
                            className="w-16 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateCartItemQuantity(idx, item.quantity - 1)}
                              className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-850 flex items-center justify-center hover:bg-amber-500 hover:text-zinc-950 font-bold"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-bold">{item.quantity}</span>
                            <button
                              onClick={() => updateCartItemQuantity(idx, item.quantity + 1)}
                              className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-855 flex items-center justify-center hover:bg-amber-500 hover:text-zinc-950 font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="number"
                            value={item.discountPercent}
                            onChange={e => updateCartItemDiscount(idx, parseFloat(e.target.value) || 0)}
                            className="w-12 p-1 text-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
                          />
                        </td>
                        <td className="py-3 text-right font-bold text-zinc-800 dark:text-zinc-100">
                          ₹{item.total.toFixed(2)}
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => removeFromCart(idx)}
                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: CUSTOMER PROFILE & BILL TOTALS */}
      <div className="space-y-6">
        {/* Customer Profiles Panel */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base font-heading flex items-center gap-2">
              <User className="h-5 w-5 text-amber-500" />
              Customer Details
            </h3>
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className="text-xs bg-amber-500 text-zinc-950 font-bold px-2 py-1 rounded flex items-center gap-1 hover:bg-amber-400"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search customers (name or phone)..."
              value={customerQuery}
              onChange={e => setCustomerQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
            />
            {customerQuery && (
              <button
                onClick={() => setCustomerQuery('')}
                className="absolute right-3 top-2.5 text-zinc-500"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {customerQuery && (
            <div className="max-h-40 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-900/10 backdrop-blur text-xs">
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-center text-zinc-500">No customers found.</div>
              ) : (
                filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerQuery('');
                    }}
                    className="w-full text-left px-3 py-2 flex justify-between items-center hover:bg-amber-500/10 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">{c.name}</p>
                      <p className="text-[10px] text-zinc-400">{c.phone}</p>
                    </div>
                    <div className="text-right">
                      {c.gstNumber && <p className="text-[8px] bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded font-mono font-bold">{c.gstNumber}</p>}
                      <p className="text-[10px] font-bold text-rose-500 mt-1">₹{c.outstandingAmount} due</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected Customer Card */}
          {selectedCustomer ? (
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 relative">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{selectedCustomer.name}</h4>
              <p className="text-[11px] text-zinc-500 mt-0.5">Phone: {selectedCustomer.phone}</p>
              {selectedCustomer.gstNumber && <p className="text-[10px] text-zinc-500">GSTIN: <span className="font-mono">{selectedCustomer.gstNumber}</span></p>}
              <div className="flex justify-between mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[10px]">
                <div>
                  <span className="text-zinc-400 font-semibold">Outstanding: </span>
                  <span className="font-bold text-rose-500">₹{selectedCustomer.outstandingAmount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-zinc-400 font-semibold">Credit Limit: </span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{selectedCustomer.creditLimit.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl text-center text-xs text-zinc-400">
              No customer selected. Use search or quick add.
            </div>
          )}
        </div>

        {/* Pricing Summary & Payment panel */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
          <h3 className="font-bold text-base font-heading">Invoice Checkout</h3>

          {/* Calculations */}
          <div className="space-y-2 text-xs border-b border-zinc-100 dark:border-zinc-900 pb-4">
            <div className="flex justify-between">
              <span className="text-zinc-500 font-semibold">Subtotal</span>
              <span className="font-bold">₹{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 font-semibold flex items-center gap-1">
                <Percent className="h-3 w-3 text-amber-500" /> Global Discount (%)
              </span>
              <input
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
                className="w-12 p-1 text-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-semibold">Discounted Amount</span>
              <span className="font-semibold text-rose-500">-₹{totals.discountTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-semibold">Estimated GST Taxes</span>
              <span className="font-semibold">₹{totals.taxTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 font-semibold">Round Off</span>
              <span className="font-medium text-zinc-400">₹{totals.roundOff.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span className="font-heading">Grand Total</span>
              <span className="text-amber-500 font-heading">₹{totals.grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2 text-xs">
            <label className="text-zinc-400 font-bold uppercase tracking-wider">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit Sale', 'Split Payment'] as PaymentMethod[]).map(method => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 rounded-xl text-center font-semibold transition-all border ${
                    paymentMethod === method
                      ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-md'
                      : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Split Payment inputs */}
          {paymentMethod === 'Split Payment' && (
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2.5 text-xs bg-zinc-50 dark:bg-zinc-900/50">
              <p className="font-semibold text-zinc-400">Configure Splits:</p>
              <div className="flex gap-2 items-center">
                <span className="w-12 font-bold">Cash:</span>
                <input
                  type="number"
                  placeholder="Cash Amount"
                  value={splitDetails[0].amount || ''}
                  onChange={e => {
                    const cash = parseFloat(e.target.value) || 0;
                    setSplitDetails([
                      { method: 'Cash', amount: cash },
                      { method: 'UPI', amount: totals.grandTotal - cash },
                    ]);
                    setPaidAmount(totals.grandTotal);
                  }}
                  className="flex-1 p-1 px-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
                />
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-12 font-bold">UPI:</span>
                <input
                  type="number"
                  placeholder="UPI Amount"
                  value={splitDetails[1].amount || ''}
                  onChange={e => {
                    const upi = parseFloat(e.target.value) || 0;
                    setSplitDetails([
                      { method: 'Cash', amount: totals.grandTotal - upi },
                      { method: 'UPI', amount: upi },
                    ]);
                    setPaidAmount(totals.grandTotal);
                  }}
                  className="flex-1 p-1 px-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Partial payment selector (Credit Sale and Split Payment excluded) */}
          {paymentMethod !== 'Credit Sale' && paymentMethod !== 'Split Payment' && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-semibold">Amount Paid</span>
              <input
                type="number"
                max={totals.grandTotal}
                value={paidAmount}
                onChange={e => setPaidAmount(Math.min(totals.grandTotal, parseFloat(e.target.value) || 0))}
                className="w-20 p-1 px-2 text-right bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded font-semibold focus:outline-none"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1 text-xs">
            <label className="text-zinc-400 font-bold uppercase">Customer Notes / T&C</label>
            <textarea
              placeholder="Printable remarks on invoice..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs focus:outline-none"
            />
          </div>

          {/* Action Trigger Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 bg-amber-500 text-zinc-950 font-bold font-heading rounded-2xl shadow-xl shadow-amber-500/10 hover:bg-amber-400 transition-all text-sm uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Bill
          </button>
        </div>
      </div>

      {/* NEW CUSTOMER MODAL */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsCustomerModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 relative z-10 space-y-4">
            <button
              onClick={() => setIsCustomerModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-700"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Register New Customer</h3>

            <form onSubmit={handleAddNewCustomer} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Mobile Phone Number *</label>
                <input
                  type="text"
                  required
                  value={newCustPhone}
                  onChange={e => setNewCustPhone(e.target.value)}
                  placeholder="e.g. +91 9988776655"
                  className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">GSTIN Number (Optional)</label>
                <input
                  type="text"
                  value={newCustGst}
                  onChange={e => setNewCustGst(e.target.value.toUpperCase())}
                  placeholder="e.g. 07AAAAA1111A1Z1"
                  className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Credit Limit (₹)</label>
                <input
                  type="number"
                  value={newCustCreditLimit}
                  onChange={e => setNewCustCreditLimit(parseInt(e.target.value) || 0)}
                  className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase mt-4"
              >
                Add Customer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BILLING CONFIRMATION CHECKOUT MODAL */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsInvoiceModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 relative z-10 text-center space-y-4">
            <h3 className="text-lg font-bold font-heading">Confirm Bill Generation?</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Generating Invoice <b className="text-amber-500">{generatedInvoiceNumber}</b> for{' '}
              <b>{selectedCustomer?.name}</b> worth <b>₹{totals.grandTotal.toLocaleString('en-IN')}</b>.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="flex-1 py-2 bg-zinc-200 dark:bg-zinc-900 font-semibold rounded-xl text-xs hover:bg-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmInvoiceCreation}
                className="flex-1 py-2 bg-amber-500 text-zinc-950 font-bold rounded-xl text-xs hover:bg-amber-400"
              >
                Yes, Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BILL SUCCESS DISPLAY BANNER MODAL */}
      {createdInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70" onClick={() => setCreatedInvoice(null)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 relative z-10 space-y-5 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold font-heading">Invoice Generated Successfully!</h3>
              <p className="text-xs text-zinc-500 mt-1">Invoice number: <b className="text-amber-500">{createdInvoice.invoiceNumber}</b></p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 space-y-2 text-xs text-left">
              <div className="flex justify-between"><span className="text-zinc-400">Customer:</span><span className="font-semibold">{createdInvoice.customerName}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Grand Total:</span><span className="font-bold">₹{createdInvoice.grandTotal}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Payment Status:</span><span className="font-bold text-emerald-500 uppercase">{createdInvoice.status}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => handlePrint(createdInvoice)}
                className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center gap-1.5"
              >
                <Printer className="h-4 w-4" /> Print Invoice
              </button>
              <button
                onClick={() => handleDownloadPDF(createdInvoice)}
                className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center gap-1.5"
              >
                <FileDown className="h-4 w-4" /> Download PDF
              </button>
              <button
                onClick={() => handleWhatsappInvoice(createdInvoice.invoiceNumber, createdInvoice.customerPhone)}
                className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center gap-1.5"
              >
                <Send className="h-4 w-4 text-emerald-500" /> Send WhatsApp
              </button>
              <button
                onClick={() => handleEmailInvoice(createdInvoice.invoiceNumber)}
                className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center justify-center gap-1.5"
              >
                <Mail className="h-4 w-4 text-blue-500" /> Email PDF
              </button>
            </div>

            <button
              onClick={() => setCreatedInvoice(null)}
              className="w-full py-2 bg-amber-500 text-zinc-950 font-bold rounded-xl text-xs hover:bg-amber-400"
            >
              Done / Create New Bill
            </button>
          </div>
        </div>
      )}
      <QrScannerModal
        isOpen={isQrScanOpen}
        onClose={() => setIsQrScanOpen(false)}
        onScan={handleBarcodeScanned}
        title="Scan Product QR / Barcode"
      />
    </div>
  );
};
