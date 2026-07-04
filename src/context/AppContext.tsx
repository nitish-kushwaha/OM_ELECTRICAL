import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { db, seedDatabase } from '../db/db';
import { User, Branch, AppNotification, AuditLog } from '../types';

interface AppContextType {
  activeUser: User | null;
  activeBranch: Branch | null;
  companyInfo: any | null;
  printerSettings: any | null;
  notifications: AppNotification[];
  isLoading: boolean;
  changeUser: (user: User) => Promise<void>;
  changeBranch: (branchId: string) => Promise<void>;
  updateCompanyInfo: (info: any) => Promise<void>;
  updatePrinterSettings: (settings: any) => Promise<void>;
  addNotification: (type: AppNotification['type'], title: string, message: string) => void;
  clearNotification: (id: string) => void;
  markAllNotificationsRead: () => void;
  logAction: (action: string, details: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any | null>(null);
  const [printerSettings, setPrinterSettings] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize DB and load settings
  useEffect(() => {
    const initApp = async () => {
      try {
        await seedDatabase();

        // Load active user
        const userSetting = await db.settings.get('activeUser');
        if (userSetting) {
          setActiveUser(userSetting.value);
        }

        // Load company info
        const companySetting = await db.settings.get('companyInfo');
        if (companySetting) {
          setCompanyInfo(companySetting.value);
        }

        // Load printer settings
        const printerSetting = await db.settings.get('printerSettings');
        if (printerSetting) {
          setPrinterSettings(printerSetting.value);
        }

        // Set default branch based on active user
        if (userSetting?.value) {
          const branch = await db.branches.get(userSetting.value.branchId);
          if (branch) {
            setActiveBranch(branch);
          }
        }

        // Generate initial notifications
        await checkSystemAlerts();
      } catch (error) {
        console.error('Error during app initialization:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  // System scanning helper for low stock and outstanding payments
  const checkSystemAlerts = async () => {
    const alerts: AppNotification[] = [];

    try {
      // 1. Check Low Stock Items
      const lowStockProducts = await db.products
        .filter(p => p.currentStock <= p.minQuantity)
        .toArray();

      lowStockProducts.forEach(p => {
        alerts.push({
          id: `low-stock-${p.id}`,
          type: 'warning',
          title: 'Low Stock Alert',
          message: `${p.name} is low on stock (${p.currentStock} ${p.unit} remaining).`,
          timestamp: new Date(),
          read: false,
        });
      });

      // 2. Check Overdue payments (customers with high outstanding)
      const debtCustomers = await db.customers
        .filter(c => c.outstandingAmount > 100000)
        .toArray();

      debtCustomers.forEach(c => {
        alerts.push({
          id: `debt-${c.id}`,
          type: 'error',
          title: 'High Outstanding Payment',
          message: `Customer ${c.name} has outstanding dues of ₹${c.outstandingAmount.toLocaleString('en-IN')}.`,
          timestamp: new Date(),
          read: false,
        });
      });

      setNotifications(alerts);
    } catch (e) {
      console.error('Error checking system alerts:', e);
    }
  };

  const changeUser = async (user: User) => {
    setActiveUser(user);
    await db.settings.put({ key: 'activeUser', value: user });
    const branch = await db.branches.get(user.branchId);
    if (branch) {
      setActiveBranch(branch);
    }
    await logAction('USER_LOGIN', `Switched user to ${user.name} (${user.role})`);
  };

  const changeBranch = async (branchId: string) => {
    const branch = await db.branches.get(branchId);
    if (branch && activeUser) {
      const updatedUser = { ...activeUser, branchId };
      setActiveUser(updatedUser);
      setActiveBranch(branch);
      await db.settings.put({ key: 'activeUser', value: updatedUser });
      await logAction('BRANCH_SWITCH', `Switched active branch to ${branch.name}`);
    }
  };

  const updateCompanyInfo = async (info: any) => {
    setCompanyInfo(info);
    await db.settings.put({ key: 'companyInfo', value: info });
    await logAction('COMPANY_UPDATE', 'Updated company profile details');
  };

  const updatePrinterSettings = async (settings: any) => {
    setPrinterSettings(settings);
    await db.settings.put({ key: 'printerSettings', value: settings });
    await logAction('SETTINGS_UPDATE', `Updated printer layout to ${settings.type}`);
  };

  const addNotification = (type: AppNotification['type'], title: string, message: string) => {
    const newNotif: AppNotification = {
      id: `custom-${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const logAction = useCallback(async (action: string, details: string) => {
    if (!activeUser) return;
    const logEntry: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userId: activeUser.id,
      userName: activeUser.name,
      userRole: activeUser.role,
      action,
      details,
      branchId: activeUser.branchId,
    };
    try {
      await db.auditLogs.add(logEntry);
    } catch (e) {
      console.error('Failed to log audit action:', e);
    }
  }, [activeUser]);

  return (
    <AppContext.Provider
      value={{
        activeUser,
        activeBranch,
        companyInfo,
        printerSettings,
        notifications,
        isLoading,
        changeUser,
        changeBranch,
        updateCompanyInfo,
        updatePrinterSettings,
        addNotification,
        clearNotification,
        markAllNotificationsRead,
        logAction,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
