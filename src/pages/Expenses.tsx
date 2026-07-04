import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Expense } from '../types';
import { useApp } from '../context/AppContext';
import {
  Wallet,
  Search,
  Plus,
  Calendar,
  X,
  Trash2,
  TrendingDown,
  Info,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

type ExpenseCategory = Expense['category'];

export const Expenses: React.FC = () => {
  const { activeBranch, activeUser, logAction } = useApp();

  // --- LIVE DATA ---
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];

  // --- UI STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states
  const [category, setCategory] = useState<ExpenseCategory>('Miscellaneous');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');

  // --- METRICS ---
  const totals = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const thisMonthSum = expenses
      .filter(e => new Date(e.date).getTime() >= startOfMonth.getTime())
      .reduce((sum, e) => sum + e.amount, 0);

    const lifetimeSum = expenses.reduce((sum, e) => sum + e.amount, 0);

    return { thisMonthSum, lifetimeSum };
  }, [expenses]);

  // --- SUBMIT EXPENSE ---
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !description) {
      toast.error('Amount and Description are required!');
      return;
    }

    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      date: new Date(),
      category,
      amount,
      description,
      paymentMethod,
      referenceNumber: referenceNumber || undefined,
      branchId: activeBranch?.id || 'br-main',
      createdBy: activeUser?.id || 'u-1',
    };

    try {
      await db.expenses.add(newExpense);
      await logAction('ADD_EXPENSE', `Logged Expense of ₹${amount} for ${category} (${description})`);
      toast.success('Expense recorded successfully!');
      setIsAddModalOpen(false);
      setAmount(0);
      setDescription('');
      setReferenceNumber('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to log expense');
    }
  };

  // --- FILTERS ---
  const filteredExpenses = expenses.filter(
    e =>
      (categoryFilter === 'All' || e.category === categoryFilter) &&
      (e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const categories: ExpenseCategory[] = [
    'Salary',
    'Rent',
    'Electricity',
    'Fuel',
    'Transportation',
    'Internet',
    'Office Expense',
    'Miscellaneous',
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Expense Book</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Log overhead spends, allocate salaries, bills, and analyze operational costs.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="p-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5 text-xs hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" /> Log Expense Record
        </button>
      </div>

      {/* QUICK METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] uppercase font-bold">Expenses This Month</span>
            <span className="text-lg font-black block mt-0.5">₹{totals.thisMonthSum.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-zinc-500/10 flex items-center justify-center text-zinc-500">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] uppercase font-bold">Lifetime Total Spend</span>
            <span className="text-lg font-black block mt-0.5">₹{totals.lifetimeSum.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by details..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
        >
          <option value="All">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* EXPENSE TABLE */}
      <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                <th className="pb-3">Date Record</th>
                <th className="pb-3">Allocation Category</th>
                <th className="pb-3">Description remarks</th>
                <th className="pb-3">Payment Channel</th>
                <th className="pb-3">Reference No.</th>
                <th className="pb-3">Amount Charged (₹)</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-500">
                    No expense items logged.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(e => (
                  <tr key={e.id} className="hover:bg-zinc-500/5 transition-colors">
                    <td className="py-3.5 text-zinc-500">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td className="py-3.5"><span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 font-bold rounded-lg text-[9px]">{e.category}</span></td>
                    <td className="py-3.5 font-medium">{e.description}</td>
                    <td className="py-3.5 text-zinc-400">{e.paymentMethod}</td>
                    <td className="py-3.5 font-mono text-zinc-400">{e.referenceNumber || 'N/A'}</td>
                    <td className="py-3.5 font-bold text-rose-500">₹{e.amount.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 text-center">
                      <button
                        onClick={async () => {
                          if (confirm('Delete this expense record?')) {
                            await db.expenses.delete(e.id);
                            toast.success('Expense record deleted');
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

      {/* RECORD EXPENSE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsAddModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 relative z-10 space-y-4">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Record Cost Outflow</h3>

            <form onSubmit={handleAddExpense} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Allocation Category *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold focus:outline-none"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Amount Charged (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount || ''}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Description / Details *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. June Shop Rent, Electricity invoice #88"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Payment Channel</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                >
                  <option value="Cash">Cash Drawer</option>
                  <option value="UPI">UPI Mobile</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                  <option value="Card">Card Sweep</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Transaction ID / Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. UTR ref, Cheque no"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase text-xs"
              >
                Log Outflow Record
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
