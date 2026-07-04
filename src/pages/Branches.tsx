import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Branch, Product } from '../types';
import { useApp } from '../context/AppContext';
import {
  GitMerge,
  Search,
  Plus,
  ArrowRightLeft,
  X,
  MapPin,
  Building,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Branches: React.FC = () => {
  const { logAction } = useApp();

  // --- LIVE DATA ---
  const branches = useLiveQuery(() => db.branches.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];

  // --- UI STATE ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // Form: Add Branch
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  // Form: Stock Transfer
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sourceBranch, setSourceBranch] = useState('br-main');
  const [destBranch, setDestBranch] = useState('br-sub');
  const [transferQty, setTransferQty] = useState(0);

  // Autocomplete searches
  const [prodQuery, setProdQuery] = useState('');

  // --- ADD BRANCH ---
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !address) {
      toast.error('Branch Name and Address are required!');
      return;
    }

    const newBranch: Branch = {
      id: `br-${Date.now()}`,
      name,
      address,
      phone,
      gstNumber,
    };

    try {
      await db.branches.add(newBranch);
      await logAction('ADD_BRANCH', `Created new business branch: ${name}`);
      toast.success('Branch added successfully!');
      setIsAddModalOpen(false);
      setName('');
      setAddress('');
      setPhone('');
      setGstNumber('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add branch');
    }
  };

  // --- STOCK TRANSFER ---
  const handleStockTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || transferQty <= 0) {
      toast.error('Select a product and specify quantity');
      return;
    }

    if (transferQty > selectedProduct.currentStock) {
      toast.error(`Transfer quantity exceeds current stock of ${selectedProduct.currentStock} ${selectedProduct.unit}`);
      return;
    }

    try {
      // In our database structure, product currentStock is shared, but we can decrement currentStock to represent shipping it out
      // (or decrement stock at main warehouse, increment at sub warehouse).
      // We will adjust the product stock and log the transfer log details!
      await db.products.update(selectedProduct.id, {
        currentStock: selectedProduct.currentStock - transferQty,
      });

      const srcName = branches.find(b => b.id === sourceBranch)?.name || 'Source';
      const destName = branches.find(b => b.id === destBranch)?.name || 'Destination';

      await logAction(
        'STOCK_TRANSFER',
        `Transferred ${transferQty} ${selectedProduct.unit} of "${selectedProduct.name}" from "${srcName}" to "${destName}"`
      );

      toast.success(`Transferred ${transferQty} items successfully!`);
      setIsTransferModalOpen(false);
      setTransferQty(0);
      setSelectedProduct(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to commit stock transfer');
    }
  };

  // --- FILTERS ---
  const filteredBranches = branches.filter(
    b =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProds = products.filter(
    p => p.name.toLowerCase().includes(prodQuery.toLowerCase()) || p.sku.toLowerCase().includes(prodQuery)
  );

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Multi-Branch Outlets</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Configure retail outlet addresses, billing points, and transfer inventory stock.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowRightLeft className="h-4 w-4 text-amber-500" /> Transfer Stock
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="p-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5 text-xs hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> Add Branch
          </button>
        </div>
      </div>

      {/* FILTER */}
      <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search branches by outlet name, address details..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
          />
        </div>
      </div>

      {/* BRANCH GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredBranches.map(b => (
          <div
            key={b.id}
            className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4 hover:shadow-lg transition-all duration-300"
          >
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <Building className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-sm font-heading truncate">{b.name}</h3>
                <span className="text-[9px] px-2 py-0.5 bg-zinc-150 dark:bg-zinc-900 text-zinc-400 rounded font-bold uppercase tracking-wider mt-1 inline-block">
                  Branch ID: {b.id}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-zinc-500">
              <p className="flex gap-2">
                <MapPin className="h-4 w-4 text-zinc-400 shrink-0" />
                <span>{b.address}</span>
              </p>
              <p><b>Phone contact:</b> {b.phone || 'N/A'}</p>
              <p><b>GSTIN Code:</b> <span className="font-mono">{b.gstNumber || 'N/A'}</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* ADD BRANCH MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsAddModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 relative z-10 space-y-4">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Register Outlet Branch</h3>

            <form onSubmit={handleAddBranch} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Branch Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. OM Electrical Outlet 2"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Outlet Address *</label>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Shop number, floor, street, city..."
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Contact Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Branch GSTIN Code</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={e => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="State specific GST number"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase text-xs"
              >
                Create Branch Outlet
              </button>
            </form>
          </div>
        </div>
      )}

      {/* STOCK TRANSFER MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsTransferModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 relative z-10 space-y-4 max-h-[85vh] overflow-y-auto">
            <button onClick={() => setIsTransferModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Stock Transfer Wizard</h3>

            <form onSubmit={handleStockTransfer} className="space-y-3.5 text-xs">
              <div className="space-y-2">
                <label className="font-semibold text-zinc-500 uppercase">1. Search Product</label>
                <input
                  type="text"
                  placeholder="Type product name or SKU..."
                  value={prodQuery}
                  onChange={e => setProdQuery(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                />
                {prodQuery && (
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-900/15 max-h-32 overflow-y-auto p-1">
                    {filteredProds.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(p);
                          setProdQuery('');
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-amber-500/10 text-[10px] font-semibold"
                      >
                        {p.name} (Stock: {p.currentStock})
                      </button>
                    ))}
                  </div>
                )}

                {selectedProduct ? (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                    <p className="font-bold">{selectedProduct.name}</p>
                    <p className="text-zinc-500 mt-0.5">SKU: {selectedProduct.sku} | In-Stock: {selectedProduct.currentStock} {selectedProduct.unit}</p>
                  </div>
                ) : (
                  <p className="text-zinc-500 text-center py-2 italic">Select a product to transfer</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">Source Outlet</label>
                  <select
                    value={sourceBranch}
                    onChange={e => setSourceBranch(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name.substring(0, 15)}...
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">Recipient Outlet</label>
                  <select
                    value={destBranch}
                    onChange={e => setDestBranch(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name.substring(0, 15)}...
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Transfer Quantity count *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedProduct ? selectedProduct.currentStock : undefined}
                  value={transferQty || ''}
                  onChange={e => setTransferQty(parseInt(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!selectedProduct || sourceBranch === destBranch}
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase text-xs disabled:opacity-50"
              >
                Authorize Stock Transfer
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
