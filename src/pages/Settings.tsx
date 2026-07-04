import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../db/db';
import {
  Settings as SettingsIcon,
  Building,
  Printer,
  Database,
  Download,
  Upload,
  Check,
  RefreshCw,
  Trash,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Settings: React.FC = () => {
  const {
    companyInfo,
    printerSettings,
    updateCompanyInfo,
    updatePrinterSettings,
    logAction,
  } = useApp();

  // --- COMPANY STATE ---
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [terms, setTerms] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState('');

  // --- PRINTER STATE ---
  const [printerType, setPrinterType] = useState('A4');
  const [thermalWidth, setThermalWidth] = useState('80mm');

  // Load contexts into state
  useEffect(() => {
    if (companyInfo) {
      setName(companyInfo.name || '');
      setEmail(companyInfo.email || '');
      setPhone(companyInfo.phone || '');
      setWebsite(companyInfo.website || '');
      setGstNumber(companyInfo.gstNumber || '');
      setBankName(companyInfo.bankDetails?.bankName || '');
      setAccountNumber(companyInfo.bankDetails?.accountNumber || '');
      setIfscCode(companyInfo.bankDetails?.ifscCode || '');
      setBranchName(companyInfo.bankDetails?.branchName || '');
      setTerms(companyInfo.terms || '');
      setInvoicePrefix(companyInfo.invoicePrefix || '');
      setInvoiceFooter(companyInfo.invoiceFooter || '');
    }
    if (printerSettings) {
      setPrinterType(printerSettings.type || 'A4');
      setThermalWidth(printerSettings.thermalWidth || '80mm');
    }
  }, [companyInfo, printerSettings]);

  // --- SAVE COMPANY INFO ---
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedInfo = {
      name,
      email,
      phone,
      website,
      gstNumber,
      bankDetails: { bankName, accountNumber, ifscCode, branchName },
      terms,
      invoicePrefix,
      invoiceFooter,
    };
    await updateCompanyInfo(updatedInfo);
    toast.success('Company settings saved successfully!');
  };

  // --- SAVE PRINTER INFO ---
  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    await updatePrinterSettings({ type: printerType, thermalWidth });
    toast.success('Printer preferences updated!');
  };

  // --- BACKUP INDEXEDDB DATA ---
  const handleExportBackup = async () => {
    try {
      const backupData: Record<string, any[]> = {};
      const tables = [
        'products',
        'customers',
        'suppliers',
        'invoices',
        'quotations',
        'purchases',
        'expenses',
        'branches',
        'auditLogs',
      ];

      for (const t of tables) {
        backupData[t] = await db.table(t).toArray();
      }

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `OM_Electrical_Backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      await logAction('BACKUP_DATABASE', 'Exported local IndexedDB database backup file');
      toast.success('Database backup JSON file generated!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create backup');
    }
  };

  // --- RESTORE INDEXEDDB DATA ---
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const jsonStr = evt.target?.result as string;
        const backupData = JSON.parse(jsonStr);

        if (confirm('WARNING: Restoring will overwrite all local IndexedDB data. Continue?')) {
          // Truncate tables and bulk insert
          for (const [table, rows] of Object.entries(backupData)) {
            const tableObj = db.table(table);
            if (tableObj && Array.isArray(rows)) {
              await tableObj.clear();
              await tableObj.bulkAdd(rows);
            }
          }
          await logAction('RESTORE_DATABASE', 'Restored local database from JSON file');
          toast.success('Database restored successfully! Reloading...');
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to restore. Invalid backup JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    if (
      !window.confirm(
        'WARNING: This will permanently delete all products, invoices, customers, suppliers, expenses, settings, and logs. Are you sure you want to proceed?'
      )
    ) {
      return;
    }

    try {
      const tables = [
        'products',
        'customers',
        'suppliers',
        'invoices',
        'quotations',
        'purchases',
        'expenses',
        'auditLogs',
        'branches',
        'settings',
      ];

      for (const t of tables) {
        await db.table(t).clear();
      }

      toast.success('Database wiped successfully! Re-initializing...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error('Failed to wipe database');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-heading">Settings Control Center</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Customize invoice layouts, banking info, default print parameters, and perform backups.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Span 2): Company Config */}
        <div className="lg:col-span-2 p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
          <h3 className="font-bold text-sm font-heading flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-900 pb-3">
            <Building className="h-5 w-5 text-amber-500" />
            Company & Billing Profile
          </h3>

          <form onSubmit={handleSaveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-500">Company Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-500">Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-500">Phone Hotline</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-500">GST Number (GSTIN)</label>
              <input
                type="text"
                value={gstNumber}
                onChange={e => setGstNumber(e.target.value.toUpperCase())}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-500">Invoice Number Prefix</label>
              <input
                type="text"
                value={invoicePrefix}
                onChange={e => setInvoicePrefix(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-500">Business Website</label>
              <input
                type="text"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>

            {/* Bank details */}
            <div className="md:col-span-2 border-t border-zinc-100 dark:border-zinc-900 pt-3 mt-1 space-y-3">
              <p className="font-bold text-[10px] text-zinc-400 uppercase tracking-wide">Company Bank Account Registry</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">Account Number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">IFSC Code</label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={e => setIfscCode(e.target.value.toUpperCase())}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">Branch Name</label>
                  <input
                    type="text"
                    value={branchName}
                    onChange={e => setBranchName(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="font-semibold text-zinc-500">Invoice Terms & Conditions</label>
              <textarea
                rows={3}
                value={terms}
                onChange={e => setTerms(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="font-semibold text-zinc-500">Printable Invoice Footer Text</label>
              <input
                type="text"
                value={invoiceFooter}
                onChange={e => setInvoiceFooter(e.target.value)}
                className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="md:col-span-2 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl uppercase transition-colors text-xs"
            >
              Save Company Settings
            </button>
          </form>
        </div>

        {/* Right Column: Printer Preferences & Backup */}
        <div className="space-y-6">
          {/* Printer configuration */}
          <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="font-bold text-sm font-heading flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-900 pb-3">
              <Printer className="h-5 w-5 text-amber-500" />
              Printer Preferences
            </h3>

            <form onSubmit={handleSavePrinter} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-500">Invoice Print Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'A4', label: 'Standard A4 Sheet' },
                    { id: 'Thermal', label: '80mm Thermal Receipt' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPrinterType(p.id)}
                      className={`py-2 rounded-xl text-center font-semibold transition-all border ${
                        printerType === p.id
                          ? 'bg-amber-500 text-zinc-950 border-amber-500'
                          : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {printerType === 'Thermal' && (
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-500">Thermal Roll Width</label>
                  <select
                    value={thermalWidth}
                    onChange={e => setThermalWidth(e.target.value)}
                    className="w-full p-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl"
                  >
                    <option value="80mm">80mm (Standard)</option>
                    <option value="58mm">58mm (Mobile POS)</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl uppercase transition-colors text-xs"
              >
                Save Printer Preferences
              </button>
            </form>
          </div>

          {/* Backup Database */}
          <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 space-y-4">
            <h3 className="font-bold text-sm font-heading flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-900 pb-3">
              <Database className="h-5 w-5 text-amber-500" />
              Backup & Database Tools
            </h3>

            <div className="space-y-3.5 text-xs">
              <p className="text-zinc-500 leading-relaxed">
                Since this application is local-first, all billing records reside securely in your browser cache. Backup regularly.
              </p>

              <button
                onClick={handleExportBackup}
                className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 dark:hover:bg-zinc-850"
              >
                <Download className="h-4 w-4 text-amber-500" /> Export JSON Backup
              </button>

              <label className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 dark:hover:bg-zinc-850 cursor-pointer">
                <Upload className="h-4 w-4 text-amber-500" /> Restore Database
                <input type="file" onChange={handleImportBackup} accept=".json" className="hidden" />
              </label>

              <button
                onClick={handleResetDatabase}
                type="button"
                className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash className="h-4 w-4" /> Reset Database (Wipe All Data)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
