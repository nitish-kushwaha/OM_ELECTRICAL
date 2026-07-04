import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Customer, Invoice } from '../types';
import { useApp } from '../context/AppContext';
import {
  Users,
  Search,
  Plus,
  CreditCard,
  Phone,
  FileText,
  UserCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Customers: React.FC = () => {
  const { logAction } = useApp();

  // --- LIVE DATA ---
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const invoices = useLiveQuery(() => db.invoices.toArray()) || [];

  // --- UI STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer'>('Cash');
  const [payRemarks, setPayRemarks] = useState('');

  // --- RECEIVE PAYMENT ACTION ---
  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || payAmount <= 0) return;

    if (payAmount > selectedCustomer.outstandingAmount) {
      toast.error('Payment exceeds outstanding dues!');
      return;
    }

    try {
      const newOutstanding = selectedCustomer.outstandingAmount - payAmount;
      
      // 1. Update customer balance
      await db.customers.update(selectedCustomer.id, {
        outstandingAmount: newOutstanding,
      });

      // 2. Create custom payment record (simulated by updating outstanding on invoices)
      let amountLeft = payAmount;
      const unpaidInvoices = invoices
        .filter(inv => inv.customerId === selectedCustomer.id && inv.outstandingAmount > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const inv of unpaidInvoices) {
        if (amountLeft <= 0) break;

        const deduct = Math.min(inv.outstandingAmount, amountLeft);
        const nextInvoiceOutstanding = inv.outstandingAmount - deduct;
        const nextInvoicePaid = inv.paidAmount + deduct;
        const nextStatus = nextInvoiceOutstanding === 0 ? 'Paid' : 'Partially Paid';

        await db.invoices.update(inv.id, {
          outstandingAmount: nextInvoiceOutstanding,
          paidAmount: nextInvoicePaid,
          status: nextStatus,
        });

        amountLeft -= deduct;
      }

      await logAction(
        'RECEIVE_PAYMENT',
        `Received payment of ₹${payAmount} from customer ${selectedCustomer.name} via ${payMethod}. Remarks: ${payRemarks || 'N/A'}`
      );

      toast.success(`Payment of ₹${payAmount} logged successfully!`);
      
      // Update local state
      setSelectedCustomer(prev => (prev ? { ...prev, outstandingAmount: newOutstanding } : null));
      setIsPayModalOpen(false);
      setPayAmount(0);
      setPayRemarks('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to log payment transaction');
    }
  };

  // --- LEDGER HISTORY FOR SELECTED CUSTOMER ---
  const customerLedger = useMemo(() => {
    if (!selectedCustomer) return [];

    // Filter invoices for customer
    const customerInvoices = invoices.filter(inv => inv.customerId === selectedCustomer.id);
    
    const entries: { date: Date; type: 'Invoice' | 'Payment'; reference: string; amount: number; balanceChange: 'debit' | 'credit' }[] = [];

    customerInvoices.forEach(inv => {
      // Invoices add to debit
      entries.push({
        date: new Date(inv.date),
        type: 'Invoice',
        reference: inv.invoiceNumber,
        amount: inv.grandTotal,
        balanceChange: 'debit',
      });

      // If they paid anything at purchase, record payment credit
      if (inv.paidAmount > 0) {
        entries.push({
          date: new Date(inv.date),
          type: 'Payment',
          reference: `Receipt: ${inv.invoiceNumber}`,
          amount: inv.paidAmount,
          balanceChange: 'credit',
        });
      }
    });

    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedCustomer, invoices]);

  // --- FILTER ---
  const filteredCustomers = customers.filter(
    c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* LEFT: CUSTOMERS DIRECTORY */}
      <div className="xl:col-span-2 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold font-heading">Customer Ledger Book</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage client details, check credit limits, and record manual payments.
            </p>
          </div>
        </div>

        {/* Filter input */}
        <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search customer catalog by name, mobile phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
            />
          </div>
        </div>

        {/* List table */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                  <th className="pb-3">Customer Name</th>
                  <th className="pb-3">Mobile No.</th>
                  <th className="pb-3">GSTIN Number</th>
                  <th className="pb-3">Credit Limit (₹)</th>
                  <th className="pb-3">Pending Outstanding (₹)</th>
                  <th className="pb-3 text-center">Ledger File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-zinc-500">
                      No customer files found.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map(c => (
                    <tr key={c.id} className="hover:bg-zinc-500/5 transition-colors">
                      <td className="py-3.5 font-bold">{c.name}</td>
                      <td className="py-3.5 font-medium text-zinc-500">{c.phone}</td>
                      <td className="py-3.5 font-mono">{c.gstNumber || 'N/A'}</td>
                      <td className="py-3.5 font-semibold text-zinc-600 dark:text-zinc-400">₹{c.creditLimit.toLocaleString('en-IN')}</td>
                      <td className={`py-3.5 font-bold ${c.outstandingAmount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        ₹{c.outstandingAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 text-center">
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-zinc-950 font-bold rounded-lg text-[10px] uppercase transition-colors"
                        >
                          Open Profiles
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT: SELECTED CUSTOMER LEDGER CARD */}
      <div className="space-y-6">
        {selectedCustomer ? (
          <div className="p-5 rounded-2xl glass border border-amber-500/20 bg-amber-500/5 space-y-5">
            {/* Header info */}
            <div className="flex justify-between items-start border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-base font-heading">{selectedCustomer.name}</h3>
                <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {selectedCustomer.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Outstanding Dues</span>
                <span className="text-base font-black text-rose-500 block mt-1">₹{selectedCustomer.outstandingAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Credit Shield limit</span>
                <span className="text-base font-black block mt-1 text-zinc-700 dark:text-zinc-300">₹{selectedCustomer.creditLimit.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Actions panel */}
            {selectedCustomer.outstandingAmount > 0 && (
              <button
                onClick={() => setIsPayModalOpen(true)}
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 shadow-md"
              >
                <UserCheck className="h-4 w-4" /> Record Cash Receipt
              </button>
            )}

            {/* Ledger List */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-amber-500" />
                Ledger Logs ({customerLedger.length})
              </h4>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {customerLedger.length === 0 ? (
                  <p className="text-xs text-center py-10 text-zinc-500 italic">No ledger activity.</p>
                ) : (
                  customerLedger.map((log, idx) => (
                    <div key={idx} className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11px] flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${log.balanceChange === 'debit' ? 'text-zinc-800 dark:text-zinc-200' : 'text-emerald-500'}`}>
                            {log.type}
                          </span>
                          <span className="text-[9px] px-1 bg-zinc-100 dark:bg-zinc-850 text-zinc-400 font-mono">{log.reference}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">
                          {log.date.toLocaleDateString('en-IN')} {log.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className={`font-bold ${log.balanceChange === 'debit' ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {log.balanceChange === 'debit' ? '+' : '-'} ₹{log.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl text-center text-xs text-zinc-500">
            <Users className="h-10 w-10 text-zinc-400/40 mx-auto mb-3" />
            Select a customer from the left directory to display ledgers and record collections.
          </div>
        )}
      </div>

      {/* RECORD CASH PAYMENT MODAL */}
      {isPayModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsPayModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 relative z-10 space-y-4">
            <button onClick={() => setIsPayModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Record Dues Collection</h3>
            <p className="text-xs text-zinc-500">
              Customer: <b>{selectedCustomer.name}</b><br />
              Total Outstanding: <b className="text-rose-500">₹{selectedCustomer.outstandingAmount.toLocaleString('en-IN')}</b>
            </p>

            <form onSubmit={handleReceivePayment} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Amount Collected (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedCustomer.outstandingAmount}
                  value={payAmount || ''}
                  onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Payment Channel</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI Transfer</option>
                  <option value="Bank Transfer">Bank NEFT/RTGS</option>
                  <option value="Card">Card POS</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Remarks / Transaction ID</label>
                <input
                  type="text"
                  placeholder="e.g. Receipt No, Cheque No"
                  value={payRemarks}
                  onChange={e => setPayRemarks(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase text-xs"
              >
                Log Cash Collection
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
