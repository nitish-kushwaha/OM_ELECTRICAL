import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Product, Supplier, Purchase, PurchaseItem } from '../types';
import { useApp } from '../context/AppContext';
import {
  ShoppingCart,
  Search,
  Plus,
  Calendar,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Purchases: React.FC = () => {
  const { activeBranch, activeUser, logAction } = useApp();

  // --- LIVE DATA ---
  const purchases = useLiveQuery(() => db.purchases.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];

  // --- UI STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [billNumber, setBillNumber] = useState('');
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Credit'>('Cash');
  const [notes, setNotes] = useState('');

  // Autocomplete searches
  const [supQuery, setSupQuery] = useState('');
  const [prodQuery, setProdQuery] = useState('');

  const generatedPurchaseNumber = useMemo(() => {
    const count = purchases.length + 1;
    return `PUR-${String(count).padStart(5, '0')}`;
  }, [purchases]);

  // --- CART ADD ---
  const addToCart = (product: Product) => {
    const existingIndex = cart.findIndex(item => item.productId === product.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      recalculateItem(updated[existingIndex]);
      setCart(updated);
    } else {
      const newItem: PurchaseItem = {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unit: product.unit,
        purchasePrice: product.purchasePrice,
        mrp: product.mrp,
        gstPercent: product.gstPercent,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
      };
      recalculateItem(newItem);
      setCart([...cart, newItem]);
    }
  };

  const recalculateItem = (item: PurchaseItem) => {
    const taxable = item.quantity * item.purchasePrice;
    const tax = (taxable * item.gstPercent) / 100;
    item.cgst = tax / 2;
    item.sgst = tax / 2;
    item.igst = 0;
    item.total = taxable + tax;
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    cart.forEach(i => {
      subtotal += i.quantity * i.purchasePrice;
      taxTotal += (i.cgst + i.sgst);
    });
    const grandTotal = Math.round(subtotal + taxTotal);
    return { subtotal, taxTotal, grandTotal };
  }, [cart]);

  // Sync paidAmount with grandTotal when checkout changes
  useMemo(() => {
    if (paymentMethod !== 'Credit') {
      setPaidAmount(totals.grandTotal);
    } else {
      setPaidAmount(0);
    }
  }, [totals.grandTotal, paymentMethod]);

  // --- SUBMIT ENTRY ---
  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) {
      toast.error('Select a supplier');
      return;
    }
    if (cart.length === 0) {
      toast.error('No items in checkout');
      return;
    }

    const outstandingAmount = totals.grandTotal - paidAmount;
    const status = outstandingAmount === 0 ? 'Paid' : paidAmount === 0 ? 'Unpaid' : 'Partially Paid';

    const newPurchase: Purchase = {
      id: `purch-${Date.now()}`,
      purchaseNumber: generatedPurchaseNumber,
      billNumber: billNumber || undefined,
      date: new Date(),
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplierGst: selectedSupplier.gstNumber,
      items: cart,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      paidAmount,
      outstandingAmount,
      paymentMethod,
      status,
      branchId: activeBranch?.id || 'br-main',
      notes,
    };

    try {
      // 1. Write Purchase Entry
      await db.purchases.add(newPurchase);

      // 2. Increment Stock
      for (const item of cart) {
        const p = products.find(prod => prod.id === item.productId);
        if (p) {
          await db.products.update(p.id, {
            currentStock: p.currentStock + item.quantity,
            // Automatically update cost price to latest purchase rate! (Highly premium ERP feature)
            purchasePrice: item.purchasePrice,
          });
        }
      }

      // 3. Update Supplier Balance if credit/partial
      if (outstandingAmount > 0) {
        await db.suppliers.update(selectedSupplier.id, {
          pendingAmount: selectedSupplier.pendingAmount + outstandingAmount,
        });
      }

      await logAction(
        'CREATE_PURCHASE',
        `Logged purchase entry ${newPurchase.purchaseNumber} from ${selectedSupplier.name} (Total: ₹${totals.grandTotal})`
      );

      toast.success('Purchase book entries logged!');
      setIsAddModalOpen(false);
      setCart([]);
      setSelectedSupplier(null);
      setBillNumber('');
      setNotes('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to log purchase');
    }
  };

  // --- FILTERS ---
  const filteredPurchases = purchases.filter(
    p =>
      p.purchaseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSups = suppliers.filter(
    s => s.name.toLowerCase().includes(supQuery.toLowerCase()) || s.phone.includes(supQuery)
  );

  const filteredProds = products.filter(
    p => p.name.toLowerCase().includes(prodQuery.toLowerCase()) || p.sku.toLowerCase().includes(prodQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Supplier Purchases Book</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Log incoming items, adjust vendor bills, and update product cost values.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="p-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5 text-xs hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" /> Log Purchase Entry
        </button>
      </div>

      {/* FILTER CONTROLS */}
      <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search purchases by number, supplier..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
          />
        </div>
      </div>

      {/* PURCHASES LIST TABLE */}
      <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                <th className="pb-3">Purchase ID</th>
                <th className="pb-3">Supplier Name</th>
                <th className="pb-3">Vendor Bill Number</th>
                <th className="pb-3">Date Entered</th>
                <th className="pb-3">Grand Total (₹)</th>
                <th className="pb-3">Outstanding (₹)</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-zinc-500">
                    No supplier purchases logged yet.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-500/5 transition-colors">
                    <td className="py-3.5 font-bold text-amber-500">{p.purchaseNumber}</td>
                    <td className="py-3.5 font-semibold">{p.supplierName}</td>
                    <td className="py-3.5 text-zinc-400">{p.billNumber || 'N/A'}</td>
                    <td className="py-3.5 text-zinc-500">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                    <td className="py-3.5 font-bold">₹{p.grandTotal.toLocaleString('en-IN')}</td>
                    <td className={`py-3.5 font-bold ${p.outstandingAmount > 0 ? 'text-rose-500' : 'text-zinc-500'}`}>
                      ₹{p.outstandingAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        p.status === 'Paid'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-center">
                      <button
                        onClick={async () => {
                          if (confirm('Delete this purchase record? Note: This will not revert inventory levels.')) {
                            await db.purchases.delete(p.id);
                            toast.success('Purchase entry deleted');
                          }
                        }}
                        className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE PURCHASE ENTRY MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsAddModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full p-6 relative z-10 space-y-4 max-h-[90vh] overflow-y-auto flex flex-col">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Record Purchase Stock Intake</h3>

            <form onSubmit={handleCreatePurchase} className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs overflow-y-auto flex-1 pb-4">
              {/* Col 1: Vendor details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-semibold text-zinc-400 uppercase tracking-wide">1. Select Vendor</label>
                  <input
                    type="text"
                    placeholder="Search supplier contact name..."
                    value={supQuery}
                    onChange={e => setSupQuery(e.target.value)}
                    className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                  {supQuery && (
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-900/15 max-h-32 overflow-y-auto p-1">
                      {filteredSups.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedSupplier(s);
                            setSupQuery('');
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-amber-500/10 text-[11px] font-semibold"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedSupplier ? (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                      <p className="font-bold">{selectedSupplier.name}</p>
                      <p className="text-zinc-500 mt-0.5">Contact: {selectedSupplier.phone}</p>
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-center py-2 italic">Select vendor supplier</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Supplier Bill/Invoice No.</label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={e => setBillNumber(e.target.value)}
                    placeholder="e.g. POL/IN/9982"
                    className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Payment Option</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold"
                  >
                    <option value="Cash">Cash payment</option>
                    <option value="UPI">UPI payment</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card Swipe</option>
                    <option value="Credit">Credit Sale (Dues Record)</option>
                  </select>
                </div>

                {paymentMethod !== 'Credit' && (
                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-400">Paid Amount (₹)</label>
                    <input
                      type="number"
                      max={totals.grandTotal}
                      value={paidAmount}
                      onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                    />
                  </div>
                )}
              </div>

              {/* Col 2-3: Item List & Form */}
              <div className="lg:col-span-2 space-y-4">
                <div className="space-y-2">
                  <label className="font-semibold text-zinc-400 uppercase tracking-wide">2. Add stock items</label>
                  <input
                    type="text"
                    placeholder="Search stock code or product name..."
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
                          <span className="text-zinc-500">Cost: ₹{p.purchasePrice}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 min-h-[220px] space-y-3">
                  <p className="font-bold text-zinc-500 border-b border-zinc-100 dark:border-zinc-900 pb-1">Intake Cart list ({cart.length})</p>
                  {cart.length === 0 ? (
                    <p className="text-center text-zinc-400 italic py-10">Add items to log stock increments</p>
                  ) : (
                    <div className="space-y-2.5">
                      {cart.map((item, index) => (
                        <div key={item.productId} className="flex justify-between items-center gap-3 border-b border-zinc-100 dark:border-zinc-900 pb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{item.productName}</p>
                            <div className="flex gap-2 mt-1">
                              <label className="text-[9px] text-zinc-400">Cost: </label>
                              <input
                                type="number"
                                value={item.purchasePrice}
                                onChange={e => {
                                  const cost = parseFloat(e.target.value) || 0;
                                  const updated = [...cart];
                                  updated[index].purchasePrice = cost;
                                  recalculateItem(updated[index]);
                                  setCart(updated);
                                }}
                                className="w-14 p-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-[9px]"
                              />
                              <label className="text-[9px] text-zinc-400 ml-2">Qty: </label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => {
                                  const q = parseInt(e.target.value) || 1;
                                  const updated = [...cart];
                                  updated[index].quantity = q;
                                  recalculateItem(updated[index]);
                                  setCart(updated);
                                }}
                                className="w-10 p-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded text-[9px] text-center"
                              />
                            </div>
                          </div>
                          <div>
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
                    Bill Grand Total: <span className="text-amber-500">₹{totals.grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase"
                  >
                    Commit Intake Entry
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
