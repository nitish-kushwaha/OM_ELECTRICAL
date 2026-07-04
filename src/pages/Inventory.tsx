import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Product, Supplier } from '../types';
import { useApp } from '../context/AppContext';
import {
  Package,
  Search,
  Plus,
  ArrowRightLeft,
  Settings,
  AlertTriangle,
  Upload,
  Download,
  X,
  Edit2,
  Trash2,
  Camera,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { QrScannerModal } from '../components/QrScannerModal';

export const Inventory: React.FC = () => {
  const { logAction } = useApp();

  // --- LIVE DATA ---
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];

  // --- FILTERS & SEARCH ---
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');

  // --- MODAL STATES ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isQrScanOpen, setIsQrScanOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // --- ADD PRODUCT FORM STATE ---
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [gstPercent, setGstPercent] = useState(18);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [mrp, setMrp] = useState(0);
  const [retailPrice, setRetailPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [dealerPrice, setDealerPrice] = useState(0);
  const [unit, setUnit] = useState('Pcs');
  const [location, setLocation] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [minQuantity, setMinQuantity] = useState(10);
  const [openingStock, setOpeningStock] = useState(0);

  // --- ADJUST STOCK FORM STATE ---
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'Add' | 'Subtract' | 'Damage'>('Add');
  const [adjustReason, setAdjustReason] = useState('');

  // Categories list
  const categories = useMemo(() => {
    const list = new Set(products.map(p => p.category));
    return ['All', ...Array.from(list)];
  }, [products]);

  // --- ADD PRODUCT ACTION ---
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sku || !barcode) {
      toast.error('Name, SKU and Barcode are required');
      return;
    }

    // Check duplicate SKU/Barcode
    const existsSku = products.some(p => p.sku.toLowerCase() === sku.toLowerCase());
    const existsBarcode = products.some(p => p.barcode === barcode);
    if (existsSku) {
      toast.error('Product with this SKU already exists');
      return;
    }
    if (existsBarcode) {
      toast.error('Product with this Barcode already exists');
      return;
    }

    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      name,
      sku,
      barcode,
      brand,
      category,
      hsnCode,
      gstPercent,
      purchasePrice,
      sellingPrice: retailPrice,
      mrp,
      retailPrice,
      wholesalePrice,
      dealerPrice,
      unit,
      location,
      supplierId: supplierId || undefined,
      minQuantity,
      openingStock,
      currentStock: openingStock,
    };

    try {
      await db.products.add(newProduct);
      await logAction('ADD_PRODUCT', `Registered product ${name} (SKU: ${sku})`);
      toast.success('Product added successfully!');
      setIsAddModalOpen(false);
      resetAddForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to add product');
    }
  };

  const resetAddForm = () => {
    setName('');
    setSku('');
    setBarcode('');
    setBrand('');
    setCategory('');
    setHsnCode('');
    setPurchasePrice(0);
    setMrp(0);
    setRetailPrice(0);
    setWholesalePrice(0);
    setDealerPrice(0);
    setLocation('');
    setSupplierId('');
    setOpeningStock(0);
  };

  // --- ADJUST STOCK ACTION ---
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || adjustQty <= 0) return;

    let newStock = selectedProduct.currentStock;
    if (adjustType === 'Add') {
      newStock += adjustQty;
    } else {
      newStock -= adjustQty;
    }

    if (newStock < 0) {
      toast.error('Stock count cannot fall below 0!');
      return;
    }

    try {
      await db.products.update(selectedProduct.id, { currentStock: newStock });
      await logAction(
        'STOCK_ADJUST',
        `Adjusted stock of ${selectedProduct.name} by ${adjustType === 'Add' ? '+' : '-'}${adjustQty}. Reason: ${adjustReason || 'Correction'}`
      );
      toast.success('Stock adjusted successfully!');
      setIsAdjustModalOpen(false);
      setAdjustQty(0);
      setAdjustReason('');
    } catch (e) {
      console.error(e);
      toast.error('Failed to adjust stock');
    }
  };

  // --- EXCEL ACTIONS ---
  const handleExportExcel = () => {
    const dataToExport = products.map(p => ({
      ID: p.id,
      Name: p.name,
      SKU: p.sku,
      Barcode: p.barcode,
      Category: p.category,
      Brand: p.brand,
      PurchasePrice: p.purchasePrice,
      MRP: p.mrp,
      RetailPrice: p.retailPrice,
      WholesalePrice: p.wholesalePrice,
      DealerPrice: p.dealerPrice,
      CurrentStock: p.currentStock,
      MinQuantity: p.minQuantity,
      Location: p.location || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
    XLSX.writeFile(workbook, 'OM_Electrical_Inventory.xlsx');
    toast.success('Inventory list exported as Excel!');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(worksheet) as any[];

        let addedCount = 0;
        for (const row of data) {
          const skuExists = products.some(p => p.sku === String(row.SKU));
          if (!skuExists && row.Name && row.SKU) {
            await db.products.add({
              id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              name: String(row.Name),
              sku: String(row.SKU),
              barcode: String(row.Barcode || row.SKU),
              brand: String(row.Brand || 'Generic'),
              category: String(row.Category || 'Miscellaneous'),
              hsnCode: String(row.HSN || '85'),
              gstPercent: parseFloat(row.GSTPercent) || 18,
              purchasePrice: parseFloat(row.PurchasePrice) || 0,
              sellingPrice: parseFloat(row.RetailPrice) || 0,
              mrp: parseFloat(row.MRP) || 0,
              retailPrice: parseFloat(row.RetailPrice) || 0,
              wholesalePrice: parseFloat(row.WholesalePrice) || 0,
              dealerPrice: parseFloat(row.DealerPrice) || 0,
              unit: String(row.Unit || 'Pcs'),
              location: String(row.Location || ''),
              minQuantity: parseFloat(row.MinQuantity) || 10,
              openingStock: parseFloat(row.CurrentStock) || 0,
              currentStock: parseFloat(row.CurrentStock) || 0,
            });
            addedCount++;
          }
        }
        await logAction('IMPORT_PRODUCTS', `Imported ${addedCount} products from Excel file`);
        toast.success(`Successfully imported ${addedCount} new products!`);
      } catch (err) {
        console.error(err);
        toast.error('Invalid Excel format or import error');
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- FILTER LOGIC ---
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery);

    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;

    let matchesStock = true;
    if (stockFilter === 'Low') {
      matchesStock = p.currentStock <= p.minQuantity;
    } else if (stockFilter === 'Out') {
      matchesStock = p.currentStock === 0;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Inventory & Stock</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Real-time stock auditing, barcode registrations, and damage controls.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <label className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer flex items-center gap-1.5 text-xs font-semibold">
            <Upload className="h-4 w-4 text-amber-500" /> Import
            <input type="file" onChange={handleImportExcel} accept=".xlsx,.xls" className="hidden" />
          </label>
          <button
            onClick={handleExportExcel}
            className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-1.5 text-xs font-semibold"
          >
            <Download className="h-4 w-4 text-amber-500" /> Export
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="p-2 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5 text-xs shrink-0"
          >
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2 w-full flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search SKU, item name, barcode..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
            />
          </div>
          <button
            onClick={() => setIsQrScanOpen(true)}
            type="button"
            className="p-2 bg-amber-500 text-zinc-950 font-bold rounded-xl flex items-center justify-center hover:bg-amber-400 transition-colors shrink-0 px-2.5"
            title="Scan Product QR / Barcode"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none flex-1 md:flex-none"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'All' ? 'All Categories' : cat}
              </option>
            ))}
          </select>

          {/* Stock Filter */}
          <select
            value={stockFilter}
            onChange={e => setStockFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none flex-1 md:flex-none"
          >
            <option value="All">All Stock Levels</option>
            <option value="Low">Low Stock Warnings</option>
            <option value="Out">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* PRODUCT GRID TABLE */}
      <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                <th className="pb-3">SKU</th>
                <th className="pb-3">Item Description</th>
                <th className="pb-3">Category</th>
                <th className="pb-3">Purchase Price (₹)</th>
                <th className="pb-3">Retail / wholesale / Dealer (₹)</th>
                <th className="pb-3">Stock Level</th>
                <th className="pb-3">Location</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-zinc-500">
                    No products found in catalog matching selected filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isLow = p.currentStock <= p.minQuantity;
                  return (
                    <tr key={p.id} className="hover:bg-zinc-500/5 transition-colors">
                      <td className="py-3.5 font-bold text-zinc-700 dark:text-zinc-300">{p.sku}</td>
                      <td className="py-3.5">
                        <div>
                          <p className="font-semibold text-zinc-800 dark:text-zinc-200">{p.name}</p>
                          <span className="text-[10px] text-zinc-400">Barcode: {p.barcode} | HSN: {p.hsnCode} | GST: {p.gstPercent}%</span>
                        </div>
                      </td>
                      <td className="py-3.5"><span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-950 font-bold text-[10px]">{p.category}</span></td>
                      <td className="py-3.5 font-bold">₹{p.purchasePrice}</td>
                      <td className="py-3.5">
                        <span className="font-semibold text-amber-500">₹{p.retailPrice}</span> /{' '}
                        <span className="font-semibold text-blue-500">₹{p.wholesalePrice}</span> /{' '}
                        <span className="font-semibold text-purple-500">₹{p.dealerPrice}</span>
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${p.currentStock === 0 ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <span className={`font-bold ${isLow ? 'text-amber-500' : ''}`}>
                            {p.currentStock} {p.unit}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 text-zinc-400">{p.location || 'N/A'}</td>
                      <td className="py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedProduct(p);
                              setIsAdjustModalOpen(true);
                            }}
                            title="Adjust stock count"
                            className="p-1.5 hover:bg-amber-500/10 rounded text-amber-500"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Are you sure you want to delete ${p.name}?`)) {
                                await db.products.delete(p.id);
                                await logAction('DELETE_PRODUCT', `Removed ${p.name} from records`);
                                toast.success('Product deleted');
                              }
                            }}
                            title="Delete product"
                            className="p-1.5 hover:bg-rose-500/10 rounded text-rose-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD PRODUCT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsAddModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full p-6 relative z-10 space-y-4 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Register New Product</h3>

            <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Product Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Polycab Red Wire 1.5 sq mm"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">SKU Code *</label>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={e => setSku(e.target.value.toUpperCase())}
                  placeholder="e.g. POL-1.5-RED"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Barcode *</label>
                <input
                  type="text"
                  required
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  placeholder="Scan or enter code"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Category *</label>
                <input
                  type="text"
                  required
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="e.g. Wires, Modular Switches, Fans"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Brand Name</label>
                <input
                  type="text"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="e.g. Polycab, Havells, Philips"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">HSN Code</label>
                <input
                  type="text"
                  value={hsnCode}
                  onChange={e => setHsnCode(e.target.value)}
                  placeholder="e.g. 8544"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">GST % Rate</label>
                <select
                  value={gstPercent}
                  onChange={e => setGstPercent(parseInt(e.target.value))}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                >
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                  <option value="0">0% (Exempt)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Measuring Unit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="e.g. Pcs, Roll, Meter, Box"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Supplier Cost Price (₹)</label>
                <input
                  type="number"
                  value={purchasePrice || ''}
                  onChange={e => setPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">MRP Maximum Retail Price (₹)</label>
                <input
                  type="number"
                  value={mrp || ''}
                  onChange={e => setMrp(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Selling Price - Retail (₹)</label>
                <input
                  type="number"
                  value={retailPrice || ''}
                  onChange={e => setRetailPrice(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Selling Price - Wholesale (₹)</label>
                <input
                  type="number"
                  value={wholesalePrice || ''}
                  onChange={e => setWholesalePrice(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Selling Price - Dealer (₹)</label>
                <input
                  type="number"
                  value={dealerPrice || ''}
                  onChange={e => setDealerPrice(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Opening Stock Level</label>
                <input
                  type="number"
                  value={openingStock || ''}
                  onChange={e => setOpeningStock(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Minimum Stock Threshold (Alerts)</label>
                <input
                  type="number"
                  value={minQuantity || ''}
                  onChange={e => setMinQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Warehouse Location / Shelf</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Row A, Box 1"
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="font-semibold text-zinc-500">Preferred Supplier</label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="md:col-span-2 py-3 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase mt-4 text-xs"
              >
                Add Product to Catalogue
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST STOCK QUANTITY MODAL */}
      {isAdjustModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsAdjustModalOpen(false)} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 relative z-10 space-y-4">
            <button onClick={() => setIsAdjustModalOpen(false)} className="absolute right-4 top-4 text-zinc-400">
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold font-heading">Adjust Stock Count</h3>
            <p className="text-xs text-zinc-500">
              Product: <b>{selectedProduct.name}</b><br />
              Current Inventory: <b>{selectedProduct.currentStock} {selectedProduct.unit}</b>
            </p>

            <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Adjustment Type</label>
                <div className="flex gap-2">
                  {(['Add', 'Subtract'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAdjustType(type)}
                      className={`flex-1 py-1.5 rounded-lg border font-semibold ${
                        adjustType === type
                          ? 'bg-amber-500 border-amber-500 text-zinc-950'
                          : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {type === 'Add' ? 'Add Stock' : 'Subtract Stock'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Quantity Count *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={adjustQty || ''}
                  onChange={e => setAdjustQty(parseInt(e.target.value) || 0)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Reason / Details</label>
                <input
                  type="text"
                  placeholder="e.g. Audit reconciliation, damage, theft"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-colors uppercase text-xs"
              >
                Apply Correction
              </button>
            </form>
          </div>
        </div>
      )}
      <QrScannerModal
        isOpen={isQrScanOpen}
        onClose={() => setIsQrScanOpen(false)}
        onScan={(scannedCode) => {
          setSearchQuery(scannedCode);
          toast.success(`Found code: ${scannedCode}`);
        }}
        title="Scan Inventory QR / Barcode"
      />
    </div>
  );
};
