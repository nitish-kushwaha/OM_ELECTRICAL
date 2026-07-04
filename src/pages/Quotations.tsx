import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Product, Customer, InvoiceItem, Quotation, QuotationStatus } from '../types';
import { useApp } from '../context/AppContext';
import {
  FileText,
  Search,
  Plus,
  ArrowRight,
  Calendar,
  X,
  Printer,
  Trash2,
  Check,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';

export const Quotations: React.FC = () => {
  const { activeUser, activeBranch, companyInfo, logAction } = useApp();

  // --- LIVE DATA ---
  const quotations = useLiveQuery(() => db.quotations.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];

  // --- UI STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [expiryDays, setExpiryDays] = useState(15);
  const [notes, setNotes] = useState('');

  // Form search states
  const [custQuery, setCustQuery] = useState('');
  const [prodQuery, setProdQuery] = useState('');

  // --- AUTO NUMBERING ---
  const generatedQuotationNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const count = quotations.length + 1;
    return `EST/${year}/${String(count).padStart(5, '0')}`;
  }, [quotations]);

  // --- ADD TO CART (ESTIMATION) ---
  const addToCart = (product: Product) => {
    const existingIndex = cart.findIndex(item => item.productId === product.id);
    if (existingIndex > -1) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += 1;
      recalculateItem(updatedCart[existingIndex], product);
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
      recalculateItem(newItem, product);
      setCart([...cart, newItem]);
    }
  };

  const recalculateItem = (item: InvoiceItem, product: Product) => {
    const base = item.quantity * item.price;
    const disc = (base * item.discountPercent) / 100;
    const taxable = base - disc;
    const tax = (taxable * item.gstPercent) / 100;
    item.discountAmount = disc;
    item.cgst = tax / 2;
    item.sgst = tax / 2;
    item.igst = 0;
    item.total = taxable + tax;
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    cart.forEach(i => {
      subtotal += i.quantity * i.price;
      discountTotal += i.discountAmount;
      taxTotal += (i.cgst + i.sgst);
    });
    const tempTotal = subtotal - discountTotal + taxTotal;
    const grandTotal = Math.round(tempTotal);
    const roundOff = Number((grandTotal - tempTotal).toFixed(2));
    return { subtotal, discountTotal, taxTotal, roundOff, grandTotal };
  }, [cart]);

  // --- SUBMIT QUOTATION ---
  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const newQuotation: Quotation = {
      id: `est-${Date.now()}`,
      quotationNumber: generatedQuotationNumber,
      date: new Date(),
      expiryDate,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerGst: selectedCustomer.gstNumber,
      items: cart,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      cgstTotal: totals.taxTotal / 2,
      sgstTotal: totals.taxTotal / 2,
      igstTotal: 0,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      status: 'Pending',
      branchId: activeBranch?.id || 'br-main',
      createdBy: activeUser?.id || 'u-1',
      createdByName: activeUser?.name || 'Nitish Kushwaha',
      notes,
    };

    try {
      await db.quotations.add(newQuotation);
      await logAction('CREATE_QUOTATION', `Created Quotation ${newQuotation.quotationNumber} for ${selectedCustomer.name}`);
      toast.success(`Quotation ${newQuotation.quotationNumber} created!`);
      setIsAddModalOpen(false);
      setCart([]);
      setSelectedCustomer(null);
      setNotes('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create estimation');
    }
  };

  // --- CONVERT ESTIMATION TO INVOICE ---
  const handleConvertToInvoice = async (quot: Quotation) => {
    try {
      const year = new Date().getFullYear();
      const count = (await db.invoices.count()) + 1;
      const prefix = companyInfo?.invoicePrefix || 'OME/';
      const invoiceNumber = `${prefix}${year}/${String(count).padStart(5, '0')}`;

      const newInvoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber,
        date: new Date(),
        customerId: quot.customerId,
        customerName: quot.customerName,
        customerPhone: quot.customerPhone,
        customerGst: quot.customerGst,
        items: quot.items,
        subtotal: quot.subtotal,
        discountTotal: quot.discountTotal,
        taxTotal: quot.taxTotal,
        cgstTotal: quot.cgstTotal,
        sgstTotal: quot.sgstTotal,
        igstTotal: quot.igstTotal,
        roundOff: quot.roundOff,
        grandTotal: quot.grandTotal,
        paidAmount: quot.grandTotal, // Default paid fully
        outstandingAmount: 0,
        paymentMethod: 'Cash' as const,
        status: 'Paid' as const,
        branchId: quot.branchId,
        createdBy: activeUser?.id || 'u-1',
        createdByName: activeUser?.name || 'Nitish',
        notes: `Converted from estimate ${quot.quotationNumber}. ${quot.notes || ''}`,
      };

      // Check stock before conversion
      for (const item of quot.items) {
        const p = await db.products.get(item.productId);
        if (p && p.currentStock < item.quantity) {
          toast.error(`Cannot convert. Product ${p.name} has insufficient stock!`);
          return;
        }
      }

      // 1. Add invoice
      await db.invoices.add(newInvoice);

      // 2. Decrement stock
      for (const item of quot.items) {
        const p = await db.products.get(item.productId);
        if (p) {
          await db.products.update(p.id, { currentStock: p.currentStock - item.quantity });
        }
      }

      // 3. Mark estimate converted
      await db.quotations.update(quot.id, {
        status: 'Converted',
        convertedInvoiceId: newInvoice.id,
      });

      await logAction('CONVERT_QUOTATION', `Converted Quotation ${quot.quotationNumber} to Invoice ${newInvoice.invoiceNumber}`);
      toast.success(`Converted successfully! Invoice generated: ${newInvoice.invoiceNumber}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to convert quotation');
    }
  };

  // --- PRINT PDF ---
  const handlePrintPDF = (est: Quotation) => {
    const doc = new jsPDF();
    const company = companyInfo || {};

    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text(company.name || 'OM ELECTRICAL', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`GSTIN: ${company.gstNumber || ''}`, 14, 26);
    doc.text(`Phone: ${company.phone || ''}`, 14, 31);

    doc.setFontSize(14);
    doc.setTextColor(50);
    doc.text('ESTIMATE / QUOTATION', 130, 20);

    doc.setFontSize(10);
    doc.text(`Quotation No: ${est.quotationNumber}`, 130, 26);
    doc.text(`Date: ${new Date(est.date).toLocaleDateString('en-IN')}`, 130, 31);
    doc.text(`Valid Till: ${new Date(est.expiryDate).toLocaleDateString('en-IN')}`, 130, 36);

    doc.line(14, 42, 196, 42);

    doc.text('ESTIMATE TO:', 14, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(est.customerName, 14, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: ${est.customerPhone}`, 14, 60);

    let y = 70;
    doc.setFillColor(245, 158, 11);
    doc.rect(14, y, 182, 8, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text('S.No', 16, y + 5);
    doc.text('Item Description', 28, y + 5);
    doc.text('Rate', 110, y + 5);
    doc.text('Qty', 135, y + 5);
    doc.text('GST %', 155, y + 5);
    doc.text('Total (Rs.)', 175, y + 5);

    doc.setTextColor(50);
    doc.setFont('helvetica', 'normal');

    est.items.forEach((item, idx) => {
      y += 8;
      doc.text(String(idx + 1), 16, y + 5);
      doc.text(item.productName.substring(0, 38), 28, y + 5);
      doc.text(item.price.toFixed(2), 110, y + 5);
      doc.text(`${item.quantity} ${item.unit}`, 135, y + 5);
      doc.text(`${item.gstPercent}%`, 155, y + 5);
      doc.text(item.total.toFixed(2), 175, y + 5);
    });

    y += 15;
    doc.line(14, y, 196, y);
    y += 5;
    doc.text(`Subtotal: Rs. ${est.subtotal.toFixed(2)}`, 130, y);
    y += 5;
    doc.text(`Tax Total: Rs. ${est.taxTotal.toFixed(2)}`, 130, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: Rs. ${est.grandTotal.toLocaleString('en-IN')}`, 130, y);

    doc.save(`Quotation_${est.quotationNumber.replace('/', '_')}.pdf`);
    toast.success('Quotation PDF generated!');
  };

  // --- FILTERS ---
  const filteredQuotations = quotations.filter(
    q =>
      q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCusts = customers.filter(
    c => c.name.toLowerCase().includes(custQuery.toLowerCase()) || c.phone.includes(custQuery)
  );

  const filteredProds = products.filter(
    p => p.name.toLowerCase().includes(prodQuery.toLowerCase()) || p.sku.toLowerCase().includes(prodQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Estimations & Quotations</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Create drafts, verify estimation lists, and convert approved quotes into bills.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="p-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5 text-xs hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" /> Create Quotation
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search estimates by number or customer name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
          />
        </div>
      </div>

      {/* LIST TABLE */}
      <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                <th className="pb-3">Quote Number</th>
                <th className="pb-3">Customer Name</th>
                <th className="pb-3">Created Date</th>
                <th className="pb-3">Expiry Date</th>
                <th className="pb-3">Quote Total (₹)</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-500">
                    No quotations generated yet.
                  </td>
                </tr>
              ) : (
                filteredQuotations.map(q => (
                  <tr key={q.id} className="hover:bg-zinc-500/5 transition-colors">
                    <td className="py-3.5 font-bold text-amber-500">{q.quotationNumber}</td>
                    <td className="py-3.5">
                      <div>
                        <p className="font-semibold text-zinc-800 dark:text-zinc-200">{q.customerName}</p>
                        <p className="text-[10px] text-zinc-400">{q.customerPhone}</p>
                      </div>
                    </td>
                    <td className="py-3.5 text-zinc-500">{new Date(q.date).toLocaleDateString('en-IN')}</td>
                    <td className="py-3.5 text-zinc-500">{new Date(q.expiryDate).toLocaleDateString('en-IN')}</td>
                    <td className="py-3.5 font-bold">₹{q.grandTotal.toLocaleString('en-IN')}</td>
                    <td className="py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        q.status === 'Converted'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : q.status === 'Approved'
                          ? 'bg-blue-500/10 text-blue-500'
                          : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {q.status === 'Pending' && (
                          <button
                            onClick={() => handleConvertToInvoice(q)}
                            title="Convert to active invoice"
                            className="p-1.5 hover:bg-emerald-500/10 rounded text-emerald-500 flex items-center gap-1 text-[10px] font-bold"
                          >
                            <Check className="h-3.5 w-3.5" /> Convert
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintPDF(q)}
                          title="Print / PDF Export"
                          className="p-1.5 hover:bg-zinc-500/10 rounded text-zinc-400"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm('Delete this estimation?')) {
                              await db.quotations.delete(q.id);
                              toast.success('Quotation deleted');
                            }
                          }}
                          title="Delete estimation"
                          className="p-1.5 hover:bg-rose-500/10 rounded text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE QUOTATION MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsAddModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full p-6 relative z-10 space-y-4 max-h-[90vh] overflow-y-auto flex flex-col">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Create Estimation Receipt</h3>

            <form onSubmit={handleCreateQuotation} className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs overflow-y-auto flex-1 pb-4">
              {/* Left Column: Customer & Details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-semibold text-zinc-400 uppercase tracking-wide">1. Customer Selection</label>
                  <input
                    type="text"
                    placeholder="Search customer name or phone..."
                    value={custQuery}
                    onChange={e => setCustQuery(e.target.value)}
                    className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                  {custQuery && (
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-900/15 max-h-32 overflow-y-auto p-1">
                      {filteredCusts.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustQuery('');
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-amber-500/10 text-[11px] font-semibold"
                        >
                          {c.name} ({c.phone})
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedCustomer ? (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                      <p className="font-bold">{selectedCustomer.name}</p>
                      <p className="text-zinc-500 mt-0.5">{selectedCustomer.phone}</p>
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-center py-2 italic">Select a customer to continue</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Expiry Duration (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={expiryDays}
                    onChange={e => setExpiryDays(parseInt(e.target.value) || 15)}
                    className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Notes / Scope details</label>
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Estimate remarks..."
                    className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                </div>
              </div>

              {/* Right Column (Span 2): Product Search & Cart */}
              <div className="lg:col-span-2 space-y-4">
                <div className="space-y-2">
                  <label className="font-semibold text-zinc-400 uppercase tracking-wide">2. Add estimation items</label>
                  <input
                    type="text"
                    placeholder="Search product items..."
                    value={prodQuery}
                    onChange={e => setProdQuery(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                  {prodQuery && (
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-900/15 max-h-40 overflow-y-auto p-1">
                      {filteredProds.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            addToCart(p);
                            setProdQuery('');
                          }}
                          className="w-full text-left px-3 py-2 flex justify-between hover:bg-amber-500/10 text-[11px] font-semibold"
                        >
                          <span>{p.name}</span>
                          <span className="text-amber-500">₹{p.retailPrice}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 min-h-[200px] space-y-3">
                  <p className="font-bold text-zinc-500 border-b border-zinc-100 dark:border-zinc-900 pb-1">Estimate List ({cart.length})</p>
                  {cart.length === 0 ? (
                    <p className="text-center text-zinc-400 italic py-10">Add items to view estimate calculations</p>
                  ) : (
                    <div className="space-y-2.5">
                      {cart.map((item, index) => (
                        <div key={item.productId} className="flex justify-between items-center gap-3 border-b border-zinc-100 dark:border-zinc-900 pb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{item.productName}</p>
                            <p className="text-[10px] text-zinc-500">Rate: ₹{item.price} | Tax: {item.gstPercent}%</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => {
                                const q = parseInt(e.target.value) || 1;
                                const updated = [...cart];
                                updated[index].quantity = q;
                                const prod = products.find(p => p.id === item.productId);
                                if (prod) recalculateItem(updated[index], prod);
                                setCart(updated);
                              }}
                              className="w-12 p-0.5 text-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => setCart(cart.filter((_, i) => i !== index))}
                              className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <span className="w-20 text-right font-bold text-zinc-800 dark:text-zinc-200">
                            ₹{item.total.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4">
                  <div className="text-sm font-bold">
                    Total Estimated: <span className="text-amber-500">₹{totals.grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase"
                  >
                    Save Quotation
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
