import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../context/AppContext';
import {
  BarChart3,
  Calendar,
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  FileSpreadsheet,
  Info,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

export const Reports: React.FC = () => {
  const { companyInfo } = useApp();

  // --- LIVE DATA ---
  const invoices = useLiveQuery(() => db.invoices.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const purchases = useLiveQuery(() => db.purchases.toArray()) || [];

  // --- TAB NAVIGATION ---
  const [activeTab, setActiveTab] = useState<'sales' | 'hsn' | 'pnl' | 'stock'>('sales');

  // --- FILTER STATE ---
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Filtered dataset
  const dateRangeInvoices = useMemo(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return invoices.filter(
      inv =>
        !inv.isCancelled &&
        new Date(inv.date).getTime() >= start.getTime() &&
        new Date(inv.date).getTime() <= end.getTime()
    );
  }, [invoices, startDate, endDate]);

  const dateRangeExpenses = useMemo(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return expenses.filter(
      e => new Date(e.date).getTime() >= start.getTime() && new Date(e.date).getTime() <= end.getTime()
    );
  }, [expenses, startDate, endDate]);

  // --- 1. SALES REPORT METRICS ---
  const salesSummary = useMemo(() => {
    let grossSales = 0;
    let netTaxes = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let discounts = 0;

    dateRangeInvoices.forEach(inv => {
      grossSales += inv.grandTotal;
      netTaxes += inv.taxTotal;
      cgst += inv.cgstTotal;
      sgst += inv.sgstTotal;
      igst += inv.igstTotal;
      discounts += inv.discountTotal;
    });

    return { grossSales, netTaxes, cgst, sgst, igst, discounts };
  }, [dateRangeInvoices]);

  // --- 2. HSN GST TAX SUMMARY ---
  const hsnSummary = useMemo(() => {
    const groups: Record<string, { hsn: string; taxable: number; cgst: number; sgst: number; igst: number; totalTax: number; grossTotal: number }> = {};

    dateRangeInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const hsn = item.hsnCode || '8544';
        if (!groups[hsn]) {
          groups[hsn] = { hsn, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, grossTotal: 0 };
        }
        const itemSubtotal = item.quantity * item.price - item.discountAmount;
        const tax = item.cgst + item.sgst + item.igst;

        groups[hsn].taxable += itemSubtotal;
        groups[hsn].cgst += item.cgst;
        groups[hsn].sgst += item.sgst;
        groups[hsn].igst += item.igst;
        groups[hsn].totalTax += tax;
        groups[hsn].grossTotal += item.total;
      });
    });

    return Object.values(groups);
  }, [dateRangeInvoices]);

  // --- 3. PROFIT & LOSS CALCULATOR ---
  const pnlReport = useMemo(() => {
    const revenue = dateRangeInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const overheads = dateRangeExpenses.reduce((sum, e) => sum + e.amount, 0);

    // COGS: Cost of Goods Sold = sum(purchasePrice * quantity) for all items sold in dateRangeInvoices
    let cogs = 0;
    dateRangeInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId);
        const costPrice = p ? p.purchasePrice : item.price * 0.7; // fallback
        cogs += costPrice * item.quantity;
      });
    });

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - overheads;

    return { revenue, cogs, grossProfit, overheads, netProfit };
  }, [dateRangeInvoices, dateRangeExpenses, products]);

  // --- 4. INVENTORY STOCK VALUATION SUMMARY ---
  const stockValuation = useMemo(() => {
    let totalQty = 0;
    let costVal = 0;
    let retailVal = 0;
    const items: { sku: string; name: string; qty: number; cost: number; retail: number; costVal: number; retailVal: number }[] = [];

    products.forEach(p => {
      const q = p.currentStock;
      const c = p.purchasePrice;
      const r = p.retailPrice;

      totalQty += q;
      costVal += q * c;
      retailVal += q * r;

      items.push({
        sku: p.sku,
        name: p.name,
        qty: q,
        cost: c,
        retail: r,
        costVal: q * c,
        retailVal: q * r,
      });
    });

    return { totalQty, costVal, retailVal, items };
  }, [products]);

  // --- EXCEL EXPORT HELPERS ---
  const exportToExcel = (type: string) => {
    let data: any[] = [];
    let name = 'Report';

    if (type === 'sales') {
      name = 'Sales_Report';
      data = dateRangeInvoices.map(inv => ({
        InvoiceNumber: inv.invoiceNumber,
        Customer: inv.customerName,
        Date: new Date(inv.date).toLocaleDateString('en-IN'),
        Subtotal: inv.subtotal,
        Discount: inv.discountTotal,
        CGST: inv.cgstTotal,
        SGST: inv.sgstTotal,
        IGST: inv.igstTotal,
        TaxTotal: inv.taxTotal,
        GrandTotal: inv.grandTotal,
        Payment: inv.paymentMethod,
        Status: inv.status,
      }));
    } else if (type === 'hsn') {
      name = 'HSN_Tax_Report';
      data = hsnSummary.map(h => ({
        HSN_Code: h.hsn,
        Taxable_Value: h.taxable,
        CGST: h.cgst,
        SGST: h.sgst,
        IGST: h.igst,
        Total_Tax: h.totalTax,
        Gross_Total: h.grossTotal,
      }));
    } else if (type === 'stock') {
      name = 'Stock_Valuation_Report';
      data = stockValuation.items.map(s => ({
        SKU: s.sku,
        Product_Name: s.name,
        Quantity_On_Hand: s.qty,
        Purchase_Cost_Price: s.cost,
        Retail_Price: s.retail,
        Asset_Value_At_Cost: s.costVal,
        Asset_Value_At_Retail: s.retailVal,
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ReportData');
    XLSX.writeFile(workbook, `OM_Electrical_${name}_${startDate}_to_${endDate}.xlsx`);
    toast.success('Report Excel sheet generated!');
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Business Reports Hub</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Generate HSN summary audits, balance ledgers, and calculate true Profit & Loss.
          </p>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 text-xs font-semibold glass border border-zinc-200 dark:border-zinc-800 p-2 rounded-xl">
          <Calendar className="h-4 w-4 text-amber-500" />
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-transparent focus:outline-none"
          />
          <span className="text-zinc-500 font-normal">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-transparent focus:outline-none"
          />
        </div>
      </div>

      {/* REPORT TABS SELECTOR */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {[
          { id: 'sales', label: 'Sales & Tax Register' },
          { id: 'hsn', label: 'GST HSN Summary' },
          { id: 'pnl', label: 'Profit & Loss Sheet' },
          { id: 'stock', label: 'Stock Asset Valuation' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-3 px-6 text-xs font-bold font-heading border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT AREAS */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Quick summaries cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-500 block text-[9px] uppercase font-bold">Gross Invoiced Volume</span>
              <span className="text-base font-black block mt-1">₹{salesSummary.grossSales.toLocaleString('en-IN')}</span>
            </div>
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-500 block text-[9px] uppercase font-bold">GST Collection Total</span>
              <span className="text-base font-black block mt-1 text-amber-500">₹{salesSummary.netTaxes.toLocaleString('en-IN')}</span>
            </div>
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-500 block text-[9px] uppercase font-bold">CGST / SGST</span>
              <span className="text-base font-black block mt-1 text-zinc-600 dark:text-zinc-400">
                ₹{salesSummary.cgst.toLocaleString('en-IN')} / ₹{salesSummary.sgst.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <span className="text-zinc-500 block text-[9px] uppercase font-bold">Discounts Disbursed</span>
                <span className="text-base font-black block mt-1 text-rose-500">₹{salesSummary.discounts.toLocaleString('en-IN')}</span>
              </div>
              <button
                onClick={() => exportToExcel('sales')}
                title="Download Sales Sheet"
                className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-zinc-950 rounded-xl"
              >
                <FileSpreadsheet className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Sales Logs */}
          <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold text-sm font-heading pb-3 border-b border-zinc-100 dark:border-zinc-900 mb-4">Invoice sales journal</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">Inv Number</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Taxable Subtotal (₹)</th>
                    <th className="pb-3">Taxes GST (₹)</th>
                    <th className="pb-3">Bill Total (₹)</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                  {dateRangeInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-zinc-500">
                        No transactions recorded in this date range.
                      </td>
                    </tr>
                  ) : (
                    dateRangeInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-zinc-500/5 transition-colors">
                        <td className="py-3.5 font-bold text-amber-500">{inv.invoiceNumber}</td>
                        <td className="py-3.5 text-zinc-500">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                        <td className="py-3.5 font-semibold">{inv.customerName}</td>
                        <td className="py-3.5">₹{(inv.subtotal - inv.discountTotal).toLocaleString('en-IN')}</td>
                        <td className="py-3.5 font-medium text-amber-500">₹{inv.taxTotal.toLocaleString('en-IN')}</td>
                        <td className="py-3.5 font-bold">₹{inv.grandTotal.toLocaleString('en-IN')}</td>
                        <td className="py-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hsn' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm font-heading">HSN Summary & GST Auditor Logs</h3>
            <button
              onClick={() => exportToExcel('hsn')}
              className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-zinc-950 rounded-xl flex items-center gap-1.5 text-xs font-semibold"
            >
              <Download className="h-4 w-4" /> Download HSN Register
            </button>
          </div>

          <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">HSN Code</th>
                    <th className="pb-3">Taxable Value (₹)</th>
                    <th className="pb-3">CGST Amount (₹)</th>
                    <th className="pb-3">SGST Amount (₹)</th>
                    <th className="pb-3">IGST Amount (₹)</th>
                    <th className="pb-3 font-semibold text-amber-500">Total Tax Collected (₹)</th>
                    <th className="pb-3">Gross Sales (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                  {hsnSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-zinc-500">
                        No HSN record aggregates.
                      </td>
                    </tr>
                  ) : (
                    hsnSummary.map(h => (
                      <tr key={h.hsn} className="hover:bg-zinc-500/5 transition-colors font-semibold">
                        <td className="py-3.5 font-mono text-zinc-700 dark:text-zinc-300">{h.hsn}</td>
                        <td className="py-3.5">₹{h.taxable.toFixed(2)}</td>
                        <td className="py-3.5 text-zinc-500">₹{h.cgst.toFixed(2)}</td>
                        <td className="py-3.5 text-zinc-500">₹{h.sgst.toFixed(2)}</td>
                        <td className="py-3.5 text-zinc-500">₹{h.igst.toFixed(2)}</td>
                        <td className="py-3.5 text-amber-500">₹{h.totalTax.toFixed(2)}</td>
                        <td className="py-3.5 font-bold">₹{h.grossTotal.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pnl' && (
        <div className="space-y-6">
          <h3 className="font-bold text-sm font-heading">Profit & Loss Accounting Ledger</h3>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calculation details panel */}
            <div className="lg:col-span-2 p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
              <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider">Statement of Operations</h4>
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-900 pb-2">
                  <span className="font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Revenue (Sales Volume)
                  </span>
                  <span className="font-bold text-emerald-500">₹{pnlReport.revenue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-900 pb-2">
                  <span className="font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-orange-500" /> Cost of Goods Sold (COGS)
                  </span>
                  <span className="font-bold text-rose-500">-₹{pnlReport.cogs.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-900 pb-2 bg-amber-500/5 p-2 rounded">
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">Gross Operating Profit</span>
                  <span className="font-bold">₹{pnlReport.grossProfit.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-900 pb-2">
                  <span className="font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <Percent className="h-4 w-4 text-rose-500" /> Operating Expenses (OPEX)
                  </span>
                  <span className="font-bold text-rose-500">-₹{pnlReport.overheads.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center pt-2 text-base font-black border-t-2 border-zinc-350 bg-amber-500/10 p-3 rounded-xl">
                  <span>Net Business Profit</span>
                  <span className={pnlReport.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                    ₹{pnlReport.netProfit.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Explanation box */}
            <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 bg-zinc-900/5 space-y-3.5">
              <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="h-4 w-4 text-amber-500" />
                Accounting remarks
              </h4>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Gross profits are derived by subtracting Cost of Goods Sold (COGS, which aggregates purchase cost rates for items sold) from invoice collections.
              </p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Net profit is calculated by subtracting operating overhead costs (Electricity bills, showroom rent, cashier staff salaries) from gross profits.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm font-heading">Live Asset Valuation</h3>
            <button
              onClick={() => exportToExcel('stock')}
              className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-zinc-950 rounded-xl flex items-center gap-1.5 text-xs font-semibold"
            >
              <Download className="h-4 w-4" /> Export Stock Audit
            </button>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-500 block text-[9px] uppercase font-bold">Total Stock Units</span>
              <span className="text-base font-black block mt-1">{stockValuation.totalQty} Units</span>
            </div>
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-500 block text-[9px] uppercase font-bold">Asset Value (at Cost)</span>
              <span className="text-base font-black block mt-1 text-emerald-500">₹{stockValuation.costVal.toLocaleString('en-IN')}</span>
            </div>
            <div className="p-4 rounded-xl glass border border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-500 block text-[9px] uppercase font-bold">Asset Value (at Retail MRP)</span>
              <span className="text-base font-black block mt-1 text-amber-500">₹{stockValuation.retailVal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">SKU</th>
                    <th className="pb-3">Product Name</th>
                    <th className="pb-3">In-Stock Count</th>
                    <th className="pb-3">Cost Price (₹)</th>
                    <th className="pb-3">Retail Price (₹)</th>
                    <th className="pb-3">Total Asset Value (Cost)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                  {stockValuation.items.map(s => (
                    <tr key={s.sku} className="hover:bg-zinc-500/5 transition-colors">
                      <td className="py-3.5 font-bold text-zinc-600 dark:text-zinc-450">{s.sku}</td>
                      <td className="py-3.5 font-semibold">{s.name}</td>
                      <td className="py-3.5 font-bold">{s.qty}</td>
                      <td className="py-3.5">₹{s.cost.toFixed(2)}</td>
                      <td className="py-3.5 text-amber-500 font-medium">₹{s.retail.toFixed(2)}</td>
                      <td className="py-3.5 font-bold">₹{s.costVal.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
