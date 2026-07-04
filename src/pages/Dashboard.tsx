import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  TrendingUp,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  Users,
  Package,
  Layers,
  ArrowUpRight,
  TrendingDown,
  Calendar,
  Activity,
  Award,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useTheme } from '../context/ThemeContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export const Dashboard: React.FC = () => {
  const { theme } = useTheme();

  // --- QUERY LIVE DATABASE TABLES ---
  const invoices = useLiveQuery(() => db.invoices.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray()) || [];
  const auditLogs = useLiveQuery(() => db.auditLogs.orderBy('timestamp').reverse().limit(6).toArray()) || [];

  // --- CALCULATE ANALYTICS STATE ---
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // 1. Invoices today
    const invoicesToday = invoices.filter(
      inv => new Date(inv.date).getTime() >= today.getTime() && !inv.isCancelled
    );

    const todaySales = invoicesToday.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const todayOrders = invoicesToday.length;

    // 2. Invoices this month
    const invoicesThisMonth = invoices.filter(
      inv => new Date(inv.date).getTime() >= startOfMonth.getTime() && !inv.isCancelled
    );
    const monthlySales = invoicesThisMonth.reduce((sum, inv) => sum + inv.grandTotal, 0);

    // 3. Lifetime totals
    const activeInvoices = invoices.filter(inv => !inv.isCancelled);
    const totalRevenue = activeInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const outstandingAmount = activeInvoices.reduce((sum, inv) => sum + inv.outstandingAmount, 0);

    // 4. Inventory stats
    const totalProducts = products.length;
    const stockValue = products.reduce((sum, p) => sum + p.currentStock * p.purchasePrice, 0);
    const lowStockItems = products.filter(p => p.currentStock <= p.minQuantity);

    // 5. Expense calculations
    const expensesThisMonth = expenses.filter(
      exp => new Date(exp.date).getTime() >= startOfMonth.getTime()
    );
    const monthlyExpenses = expensesThisMonth.reduce((sum, exp) => sum + exp.amount, 0);

    // 6. Profit Calculations
    // Gross profit = sold price - cost price for all items in active invoices
    let grossProfit = 0;
    activeInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        const costPrice = prod ? prod.purchasePrice : item.price * 0.7; // fallback to 70% cost
        grossProfit += (item.price - costPrice) * item.quantity;
        // Adjust for item-level discounts
        grossProfit -= item.discountAmount;
      });
    });

    const netProfit = grossProfit - expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // 7. Recent Invoices
    const recentBills = [...invoices]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    // 8. Top Selling Products
    const productSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    activeInvoices.forEach(inv => {
      inv.items.forEach(item => {
        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
        }
        productSalesMap[item.productId].qty += item.quantity;
        productSalesMap[item.productId].revenue += item.total;
      });
    });
    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // 9. Top Customers by Revenue
    const customerRevenueMap: Record<string, { name: string; phone: string; revenue: number }> = {};
    activeInvoices.forEach(inv => {
      if (!customerRevenueMap[inv.customerId]) {
        customerRevenueMap[inv.customerId] = {
          name: inv.customerName,
          phone: inv.customerPhone,
          revenue: 0,
        };
      }
      customerRevenueMap[inv.customerId].revenue += inv.grandTotal;
    });
    const topCustomers = Object.values(customerRevenueMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      todaySales,
      todayOrders,
      monthlySales,
      totalRevenue,
      outstandingAmount,
      totalProducts,
      stockValue,
      lowStockCount: lowStockItems.length,
      lowStockList: lowStockItems.slice(0, 5),
      monthlyExpenses,
      netProfit,
      recentBills,
      topSellingProducts,
      topCustomers,
    };
  }, [invoices, products, expenses]);

  // --- CHART CONFIGURATIONS ---
  const isDark = false;
  const textColor = '#71717a';
  const gridColor = 'rgba(228, 228, 231, 0.6)';

  // 1. Monthly Revenue Trend Chart Data (Last 6 Months)
  const lineChartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const labels: string[] = [];
    const salesData: number[] = [];

    // Initialize 6 months history
    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      labels.push(months[monthIdx]);

      // Calculate sales for this historical month
      const targetYear = new Date().getFullYear() - (currentMonth - i < 0 ? 1 : 0);
      const targetMonth = monthIdx;

      const monthlySum = invoices
        .filter(inv => {
          if (inv.isCancelled) return false;
          const d = new Date(inv.date);
          return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
        })
        .reduce((sum, inv) => sum + inv.grandTotal, 0);

      salesData.push(monthlySum);
    }

    return {
      labels,
      datasets: [
        {
          label: 'Revenue (₹)',
          data: salesData,
          borderColor: '#f59e0b', // Amber 500
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: isDark ? '#18181b' : '#ffffff',
          pointHoverRadius: 6,
        },
      ],
    };
  }, [invoices, isDark]);

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#18181b' : '#ffffff',
        titleColor: isDark ? '#ffffff' : '#18181b',
        bodyColor: isDark ? '#ffffff' : '#18181b',
        borderColor: isDark ? '#3f3f46' : '#e4e4e7',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: textColor },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
    },
  };

  // 2. Category Distribution Doughnut Chart Data
  const doughnutChartData = useMemo(() => {
    const categoryCount: Record<string, number> = {};
    products.forEach(p => {
      categoryCount[p.category] = (categoryCount[p.category] || 0) + p.currentStock;
    });

    const sortedCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const labels = sortedCategories.map(c => c[0]);
    const data = sortedCategories.map(c => c[1]);

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            '#f59e0b', // amber
            '#3b82f6', // blue
            '#10b981', // emerald
            '#8b5cf6', // violet
            '#ec4899', // pink
          ],
          borderColor: isDark ? '#18181b' : '#ffffff',
          borderWidth: 2,
        },
      ],
    };
  }, [products, isDark]);

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: textColor,
          boxWidth: 12,
          padding: 10,
          font: { size: 11 },
        },
      },
    },
    cutout: '70%',
  };

  return (
    <div className="space-y-6">
      {/* HEADER TITLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Analytics Dashboard</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Real-time shop performance metrics and inventory status.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 glass">
          <Calendar className="h-4 w-4 text-amber-500" />
          <span>Last sync: Just now (Offline Local DB)</span>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Today's Sales</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1">₹{stats.todaySales.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">{stats.todayOrders} invoices today</p>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Monthly Revenue</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1">₹{stats.monthlySales.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">This calendar month</p>
          </div>
        </div>

        {/* Outstanding Amount */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 shrink-0">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Dues Outstanding</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1 text-rose-500">₹{stats.outstandingAmount.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">Pending collection</p>
          </div>
        </div>

        {/* Stock Value */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Stock Value</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1">₹{stats.stockValue.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">{stats.totalProducts} distinct SKUs</p>
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Net Business Profit</p>
            <h3 className={`text-lg md:text-xl font-bold font-heading mt-1 ${stats.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              ₹{stats.netProfit.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">Less expenses</p>
          </div>
        </div>

        {/* Monthly Expenses */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
            <TrendingDown className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Monthly Expenses</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1">₹{stats.monthlyExpenses.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">Salaries, Rent, Bills</p>
          </div>
        </div>

        {/* Total Customers */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Total Customers</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1">{customers.length}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">Retail & Contractors</p>
          </div>
        </div>

        {/* Low Stock Warn */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 hover:shadow-lg transition-all duration-300">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${stats.lowStockCount > 0 ? 'bg-amber-500/15 text-amber-500 animate-pulse' : 'bg-zinc-500/10 text-zinc-500'}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold tracking-wide uppercase">Low Stock Alerts</p>
            <h3 className="text-lg md:text-xl font-bold font-heading mt-1">{stats.lowStockCount}</h3>
            <p className="text-[10px] text-zinc-400 mt-0.5">Need immediate order</p>
          </div>
        </div>
      </div>

      {/* CHARTS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading">Sales Revenue Trend</h3>
            <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded font-semibold uppercase">6-Month View</span>
          </div>
          <div className="h-64 mt-4 relative">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        </div>

        {/* Doughnut Chart */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading">Stock Category Share</h3>
            <span className="text-[10px] px-2 py-0.5 bg-zinc-500/10 text-zinc-500 rounded font-semibold uppercase">By Quantity</span>
          </div>
          <div className="h-60 mt-4 relative flex items-center justify-center">
            {doughnutChartData.labels.length > 0 ? (
              <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
            ) : (
              <p className="text-xs text-zinc-500">No stock data available</p>
            )}
          </div>
        </div>
      </div>

      {/* DATA DETAILS TABLES CONTAINER */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Bills */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading">Recent Invoices</h3>
            <span className="text-[10px] text-zinc-400 font-semibold">Updated live</span>
          </div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-semibold">
                  <th className="py-2.5">Inv No.</th>
                  <th className="py-2.5">Customer</th>
                  <th className="py-2.5">Amount</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                {stats.recentBills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-zinc-500">
                      No invoices recorded yet.
                    </td>
                  </tr>
                ) : (
                  stats.recentBills.map(b => (
                    <tr key={b.id} className="hover:bg-zinc-500/5 transition-colors">
                      <td className="py-2.5 font-bold text-amber-500">{b.invoiceNumber}</td>
                      <td className="py-2.5 font-medium truncate max-w-[120px]">{b.customerName}</td>
                      <td className="py-2.5 font-semibold">₹{b.grandTotal.toLocaleString('en-IN')}</td>
                      <td className="py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          b.status === 'Paid'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : b.status === 'Partially Paid'
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-zinc-400">
                        {new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Items */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading text-amber-500 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Low Stock Warnings
            </h3>
            <span className="text-[10px] text-zinc-400 font-semibold">Alert threshold</span>
          </div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-semibold">
                  <th className="py-2.5">SKU</th>
                  <th className="py-2.5">Product Name</th>
                  <th className="py-2.5">Current Stock</th>
                  <th className="py-2.5">Min Stock</th>
                  <th className="py-2.5 text-right">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
                {stats.lowStockList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-emerald-500 font-semibold bg-emerald-500/5 rounded-xl">
                      All products stock levels are optimal!
                    </td>
                  </tr>
                ) : (
                  stats.lowStockList.map(p => (
                    <tr key={p.id} className="hover:bg-zinc-500/5 transition-colors">
                      <td className="py-2.5 font-bold text-zinc-500">{p.sku}</td>
                      <td className="py-2.5 font-medium truncate max-w-[150px]">{p.name}</td>
                      <td className="py-2.5 font-bold text-rose-500">{p.currentStock} {p.unit}</td>
                      <td className="py-2.5 text-zinc-500">{p.minQuantity} {p.unit}</td>
                      <td className="py-2.5 text-right text-zinc-400">{p.location || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top Selling Products */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-500" />
              Fast Moving Products
            </h3>
            <span className="text-[10px] text-zinc-400 font-semibold">By Quantity</span>
          </div>
          <div className="mt-3 space-y-3">
            {stats.topSellingProducts.length === 0 ? (
              <p className="text-xs text-center py-8 text-zinc-500">No transactions recorded yet.</p>
            ) : (
              stats.topSellingProducts.map((p, idx) => (
                <div key={`${p.name}-${idx}`} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center font-bold text-amber-500 text-xs">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-zinc-800 dark:text-zinc-200">{p.name}</p>
                    <p className="text-[10px] text-zinc-400">Sold: {p.qty} units</p>
                  </div>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    ₹{Math.round(p.revenue).toLocaleString('en-IN')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Customers */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading flex items-center gap-1.5">
              <Users className="h-4 w-4 text-blue-500" />
              Top Customers
            </h3>
            <span className="text-[10px] text-zinc-400 font-semibold">By Billing Vol.</span>
          </div>
          <div className="mt-3 space-y-3">
            {stats.topCustomers.length === 0 ? (
              <p className="text-xs text-center py-8 text-zinc-500">No billing history.</p>
            ) : (
              stats.topCustomers.map((c, idx) => (
                <div key={`${c.name}-${idx}`} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center font-bold text-blue-500 text-xs">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-zinc-800 dark:text-zinc-200">{c.name}</p>
                    <p className="text-[10px] text-zinc-400">{c.phone}</p>
                  </div>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    ₹{Math.round(c.revenue).toLocaleString('en-IN')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Audit Log / Recent Activities */}
        <div className="p-5 rounded-2xl glass border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-900">
            <h3 className="font-bold text-sm font-heading flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-emerald-500" />
              Audit & Activity Log
            </h3>
            <span className="text-[10px] text-zinc-400 font-semibold">Secured tracker</span>
          </div>
          <div className="mt-3 space-y-3 max-h-56 overflow-y-auto pr-1">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-center py-8 text-zinc-500">No logs generated.</p>
            ) : (
              auditLogs.map(l => (
                <div key={l.id} className="text-xs border-l-2 border-amber-500/40 pl-3 py-0.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{l.action}</span>
                    <span className="text-[9px] text-zinc-400">
                      {new Date(l.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">{l.details}</p>
                  <div className="text-[8px] font-bold text-amber-500/80 uppercase">
                    {l.userName} ({l.userRole})
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
