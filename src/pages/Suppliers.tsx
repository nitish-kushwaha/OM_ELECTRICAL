import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Supplier, Purchase } from '../types';
import { useApp } from '../context/AppContext';
import {
  Truck,
  Search,
  Plus,
  Phone,
  Briefcase,
  FileText,
  DollarSign,
  X,
  CreditCard,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Suppliers: React.FC = () => {
  const { logAction } = useApp();

  // --- LIVE DATA ---
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];
  const purchases = useLiveQuery(() => db.purchases.toArray()) || [];

  // --- UI STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Bank Transfer');
  const [payRemarks, setPayRemarks] = useState('');

  // --- RECORD PAYMENT TO SUPPLIER ---
  const handleRecordPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || payAmount <= 0) return;

    if (payAmount > selectedSupplier.pendingAmount) {
      toast.error('Payment exceeds pending amount!');
      return;
    }

    try {
      const newPending = selectedSupplier.pendingAmount - payAmount;
      
      // 1. Update supplier balance
      await db.suppliers.update(selectedSupplier.id, {
        pendingAmount: newPending,
      });

      // 2. Adjust purchases outstanding
      let amountLeft = payAmount;
      const unpaidPurchases = purchases
        .filter(p => p.supplierId === selectedSupplier.id && p.outstandingAmount > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const pur of unpaidPurchases) {
        if (amountLeft <= 0) break;

        const deduct = Math.min(pur.outstandingAmount, amountLeft);
        const nextPurOutstanding = pur.outstandingAmount - deduct;
        const nextPurPaid = pur.paidAmount + deduct;
        const nextStatus = nextPurOutstanding === 0 ? 'Paid' : 'Partially Paid';

        await db.purchases.update(pur.id, {
          outstandingAmount: nextPurOutstanding,
          paidAmount: nextPurPaid,
          status: nextStatus,
        });

        amountLeft -= deduct;
      }

      await logAction(
        'SUPPLIER_PAYMENT',
        `Logged vendor payout of ₹${payAmount} to ${selectedSupplier.name} via ${payMethod}. Remarks: ${payRemarks || 'N/A'}`
      );

      toast.success(`Payout of ₹${payAmount} logged successfully!`);
      
      // Update local states
      setSelectedSupplier(prev => (prev ? { ...prev, pendingAmount: newPending } : null));
      setIsPayModalOpen(false);
      setPayAmount(0);
      setPayRemarks('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to log payout');
    }
  };

  // --- LEDGER HISTORY FOR SELECTED SUPPLIER ---
  const supplierLedger = useMemo(() => {
    if (!selectedSupplier) return [];

    const supplierPurchases = purchases.filter(p => p.supplierId === selectedSupplier.id);
    const entries: { date: Date; type: 'Purchase' | 'Payout'; reference: string; amount: number; balanceChange: 'increase' | 'decrease' }[] = [];

    supplierPurchases.forEach(p => {
      // Purchase increases debt
      entries.push({
        date: new Date(p.date),
        type: 'Purchase',
        reference: p.purchaseNumber,
        amount: p.grandTotal,
        balanceChange: 'increase',
      });

      // Payout at purchase decreases debt
      if (p.paidAmount > 0) {
        entries.push({
          date: new Date(p.date),
          type: 'Payout',
          reference: `Advance/At Bill: ${p.purchaseNumber}`,
          amount: p.paidAmount,
          balanceChange: 'decrease',
        });
      }
    });

    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedSupplier, purchases]);

  // --- FILTERS ---
  const filteredSuppliers = suppliers.filter(
    s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery)
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* LEFT: SUPPLIERS LIST */}
      <div className="xl:col-span-2 space-y-6">
        <div>
          <h2 className="text-2xl font-bold font-heading">Supplier Accounts</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Monitor wholesaler contact registries, bank account details, and active pending dues.
          </p>
        </div>

        {/* Filter input */}
        <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search suppliers by vendor name or contact phone..."
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
                  <th className="pb-3">Supplier Name</th>
                  <th className="pb-3">Mobile No.</th>
                  <th className="pb-3">GSTIN Code</th>
                  <th className="pb-3">Bank details</th>
                  <th className="pb-3">Pending Dues (₹)</th>
                  <th className="pb-3 text-center">ledger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-zinc-500">
                      No suppliers logged.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map(s => (
                    <tr key={s.id} className="hover:bg-zinc-500/5 transition-colors">
                      <td className="py-3.5 font-bold">{s.name}</td>
                      <td className="py-3.5 text-zinc-500">{s.phone}</td>
                      <td className="py-3.5 font-mono">{s.gstNumber || 'N/A'}</td>
                      <td className="py-3.5">
                        {s.bankDetails ? (
                          <div className="text-[10px]">
                            <p className="font-semibold text-zinc-700 dark:text-zinc-300">{s.bankDetails.bankName}</p>
                            <span className="text-zinc-400 font-mono">A/C: {s.bankDetails.accountNumber}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400">N/A</span>
                        )}
                      </td>
                      <td className={`py-3.5 font-bold ${s.pendingAmount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        ₹{s.pendingAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 text-center">
                        <button
                          onClick={() => setSelectedSupplier(s)}
                          className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-zinc-950 font-bold rounded-lg text-[10px] uppercase transition-colors"
                        >
                          Check Ledger
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

      {/* RIGHT: SELECTED SUPPLIER LEDGER */}
      <div className="space-y-6">
        {selectedSupplier ? (
          <div className="p-5 rounded-2xl glass border border-amber-500/20 bg-amber-500/5 space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-bold text-base font-heading">{selectedSupplier.name}</h3>
                <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {selectedSupplier.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedSupplier(null)}
                className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Metrics */}
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs flex justify-between items-center">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Outstanding Payable</span>
                <span className="text-base font-black text-amber-500 block mt-1">₹{selectedSupplier.pendingAmount.toLocaleString('en-IN')}</span>
              </div>
              <Briefcase className="h-8 w-8 text-amber-500/20" />
            </div>

            {/* Bank details preview */}
            {selectedSupplier.bankDetails && (
              <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11px] space-y-1">
                <p className="font-bold text-zinc-400 uppercase text-[9px] tracking-wider">Wholesaler Bank Registry</p>
                <p><b>Bank:</b> {selectedSupplier.bankDetails.bankName}</p>
                <p><b>A/C No:</b> <span className="font-mono">{selectedSupplier.bankDetails.accountNumber}</span></p>
                <p><b>IFSC:</b> <span className="font-mono">{selectedSupplier.bankDetails.ifscCode}</span></p>
                <p><b>Branch:</b> {selectedSupplier.bankDetails.branchName}</p>
              </div>
            )}

            {/* Action payout */}
            {selectedSupplier.pendingAmount > 0 && (
              <button
                onClick={() => setIsPayModalOpen(true)}
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 shadow-md hover:bg-amber-400"
              >
                <DollarSign className="h-4 w-4" /> Log Supplier Payout
              </button>
            )}

            {/* Ledger logs */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-amber-500" />
                Ledger Logs ({supplierLedger.length})
              </h4>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {supplierLedger.length === 0 ? (
                  <p className="text-xs text-center py-10 text-zinc-500 italic">No historical purchase files.</p>
                ) : (
                  supplierLedger.map((log, idx) => (
                    <div key={idx} className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[11px] flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${log.balanceChange === 'increase' ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {log.type}
                          </span>
                          <span className="text-[9px] px-1 bg-zinc-100 dark:bg-zinc-850 text-zinc-400 font-mono">{log.reference}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">
                          {log.date.toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <span className={`font-bold ${log.balanceChange === 'increase' ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {log.balanceChange === 'increase' ? '+' : '-'} ₹{log.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl text-center text-xs text-zinc-500">
            <Truck className="h-10 w-10 text-zinc-400/40 mx-auto mb-3" />
            Select a supplier from the directory list to inspect bank details, ledger trails, and register manual settlements.
          </div>
        )}
      </div>

      {/* PAY SUPPLIER DEBT MODAL */}
      {isPayModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsPayModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 relative z-10 space-y-4">
            <button onClick={() => setIsPayModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Record Debt Settlement</h3>
            <p className="text-xs text-zinc-500">
              Supplier: <b>{selectedSupplier.name}</b><br />
              Total Pending Debt: <b className="text-amber-500">₹{selectedSupplier.pendingAmount.toLocaleString('en-IN')}</b>
            </p>

            <form onSubmit={handleRecordPayout} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Amount Paid (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedSupplier.pendingAmount}
                  value={payAmount || ''}
                  onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Payout Channel</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as any)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold"
                >
                  <option value="Bank Transfer">Bank Transfer (IMPS/RTGS)</option>
                  <option value="UPI">UPI Mobile</option>
                  <option value="Cash">Cash Ledger</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Reference / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Bank Ref No, UTR Number"
                  value={payRemarks}
                  onChange={e => setPayRemarks(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase text-xs"
              >
                Log Debt Settlement
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
