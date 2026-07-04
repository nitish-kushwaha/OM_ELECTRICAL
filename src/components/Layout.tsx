import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Package,
  ShoppingCart,
  Users,
  Truck,
  Wallet,
  BarChart3,
  Settings,
  GitMerge,
  Sun,
  Moon,
  Bell,
  Menu,
  X,
  User as UserIcon,
  MapPin,
  ChevronDown,
  LogOut,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const {
    activeUser,
    activeBranch,
    notifications,
    changeUser,
    changeBranch,
    clearNotification,
    markAllNotificationsRead,
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['Super Admin', 'Owner', 'Accountant', 'Store Manager'] },
    { name: 'Billing', path: '/billing', icon: Receipt, roles: ['Super Admin', 'Owner', 'Accountant', 'Cashier'] },
    { name: 'Quotations', path: '/quotations', icon: FileText, roles: ['Super Admin', 'Owner', 'Sales Executive'] },
    { name: 'Inventory', path: '/inventory', icon: Package, roles: ['Super Admin', 'Owner', 'Store Manager'] },
    { name: 'Purchases', path: '/purchases', icon: ShoppingCart, roles: ['Super Admin', 'Owner', 'Store Manager'] },
    { name: 'Customers', path: '/customers', icon: Users, roles: ['Super Admin', 'Owner', 'Sales Executive', 'Accountant'] },
    { name: 'Suppliers', path: '/suppliers', icon: Truck, roles: ['Super Admin', 'Owner', 'Store Manager', 'Accountant'] },
    { name: 'Expenses', path: '/expenses', icon: Wallet, roles: ['Super Admin', 'Owner', 'Accountant'] },
    { name: 'Reports', path: '/reports', icon: BarChart3, roles: ['Super Admin', 'Owner', 'Accountant'] },
    { name: 'Branches', path: '/branches', icon: GitMerge, roles: ['Super Admin', 'Owner'] },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['Super Admin', 'Owner'] },
  ];

  const mobileNavItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Billing', path: '/billing', icon: Receipt },
    { name: 'Inventory', path: '/inventory', icon: Package },
  ];

  const filteredMenuItems = menuItems.filter(
    item => !activeUser || item.roles.includes(activeUser.role)
  );

  // Mock User Switch List for testing roles
  const testUsers = [
    { id: 'u-1', name: 'Nitish Kushwaha', email: 'nitish@omelectrical.com', role: 'Super Admin' as const, branchId: 'br-main' },
    { id: 'u-2', name: 'Anoop Singh', email: 'anoop@omelectrical.com', role: 'Cashier' as const, branchId: 'br-main' },
    { id: 'u-3', name: 'Karan Sharma', email: 'karan@omelectrical.com', role: 'Store Manager' as const, branchId: 'br-sub' },
    { id: 'u-4', name: 'Preeti Vyas', email: 'preeti@omelectrical.com', role: 'Sales Executive' as const, branchId: 'br-main' },
  ];

  // Available Branches List
  const branchesList = [
    { id: 'br-main', name: 'OM Electrical (Main)' },
    { id: 'br-sub', name: 'OM Electrical (Warehouse)' },
  ];

  const handleUserSwitch = async (user: typeof testUsers[0]) => {
    await changeUser(user);
    setIsUserDropdownOpen(false);
    navigate('/');
  };

  const handleBranchSwitch = async (branchId: string) => {
    await changeBranch(branchId);
    setIsBranchDropdownOpen(false);
    navigate('/');
  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-rose-500" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      {/* SIDEBAR - DESKTOP */}
      <aside className="hidden lg:flex flex-col w-64 glass border-r border-zinc-200 dark:border-zinc-800 shrink-0 sticky top-0 h-screen z-20">
        {/* Brand Logo */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-zinc-950 font-black text-xl tracking-tight">OM</span>
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight tracking-wide font-heading">OM Electrical</h1>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold tracking-wider uppercase">Billing Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5">
          {filteredMenuItems.map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className={`h-5 w-5 transition-transform group-hover:scale-105 ${isActive ? 'text-zinc-950' : 'text-zinc-500'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Info footer */}
        {activeUser && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 glass">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center font-bold text-amber-500">
                {activeUser.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight">{activeUser.name}</p>
                <span className="inline-block mt-0.5 px-2 py-0.5 text-[9px] font-bold rounded bg-amber-500/10 text-amber-500 uppercase tracking-wide">
                  {activeUser.role}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* MOBILE DRAWER SIDEBAR */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black"
            />
            {/* Menu container */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="absolute top-0 bottom-0 left-0 w-72 bg-zinc-900 text-white flex flex-col z-50 shadow-2xl"
            >
              <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800 bg-zinc-950">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center">
                    <span className="text-zinc-950 font-black text-lg">OM</span>
                  </div>
                  <h1 className="font-bold text-md font-heading">OM Electrical</h1>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="h-6 w-6" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5 bg-zinc-900">
                {filteredMenuItems.map(item => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        isActive ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>

              {activeUser && (
                <div className="p-4 border-t border-zinc-800 bg-zinc-950">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-amber-500">
                      {activeUser.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-none">{activeUser.name}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/10 text-amber-500 uppercase tracking-widest">
                        {activeUser.role}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP BAR */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-zinc-200 dark:border-zinc-800 glass sticky top-0 z-10 no-print">
          {/* Left: Mobile Toggle & Welcome */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="hidden md:flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <MapPin className="h-4 w-4 text-amber-500" />
              <span>Active Branch:</span>
              <div className="relative">
                <button
                  onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                  className="flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200 hover:text-amber-500 transition-colors"
                >
                  <span>{activeBranch?.name || 'Main Branch'}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                <AnimatePresence>
                  {isBranchDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setIsBranchDropdownOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute left-0 mt-2 w-56 rounded-xl glass border border-zinc-200 dark:border-zinc-800 shadow-xl py-2 z-30"
                      >
                        {branchesList.map(b => (
                          <button
                            key={b.id}
                            onClick={() => handleBranchSwitch(b.id)}
                            className={`w-full text-left px-4 py-2 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                              activeBranch?.id === b.id ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            {b.name}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Role switch dropdown for pairing/testing */}
            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2 p-1.5 px-3 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-xs font-semibold"
              >
                <UserIcon className="h-4 w-4 text-amber-500" />
                <span className="hidden sm:inline">{activeUser?.role || 'Guest'}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              <AnimatePresence>
                {isUserDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsUserDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-56 rounded-xl glass border border-zinc-200 dark:border-zinc-800 shadow-xl py-2 z-30"
                    >
                      <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Switch Testing Role</p>
                      </div>
                      {testUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleUserSwitch(u)}
                          className="w-full text-left px-4 py-2.5 text-xs flex flex-col hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                        >
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{u.name}</span>
                          <span className="text-[9px] text-zinc-400 uppercase font-semibold">{u.role}</span>
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="p-2.5 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors relative"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {isNotificationOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIsNotificationOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl glass border border-zinc-200 dark:border-zinc-800 shadow-xl py-3 z-30"
                    >
                      <div className="flex items-center justify-between px-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                        <h4 className="text-xs font-bold font-heading">Notifications ({unreadNotificationsCount})</h4>
                        {unreadNotificationsCount > 0 && (
                          <button
                            onClick={markAllNotificationsRead}
                            className="text-[10px] text-amber-500 font-semibold hover:underline"
                          >
                            Mark read
                          </button>
                        )}
                      </div>

                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-zinc-500 text-xs">
                          All systems normal. No notifications.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                          {notifications.map(n => (
                            <div
                              key={n.id}
                              className={`p-3 text-xs flex gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                                !n.read ? 'bg-amber-500/5 dark:bg-amber-500/5 font-medium' : ''
                              }`}
                            >
                              <div className="shrink-0 mt-0.5">{getNotificationIcon(n.type)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-zinc-800 dark:text-zinc-200">{n.title}</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">{n.message}</p>
                              </div>
                              <button
                                onClick={() => clearNotification(n.id)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0 text-[10px]"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* MAIN PAGE BODY */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex justify-around items-center z-40 px-2 pb-safe shadow-lg">
          {mobileNavItems.map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-bold ${
                  isActive ? 'text-amber-500' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <Icon className={`h-5 w-5 mb-0.5 ${isActive ? 'text-amber-500' : 'text-zinc-450'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
