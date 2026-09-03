export const translations = {
  ar: {
    // App Name
    appName: "Luxe",
    appDescription: "برنامج إدارة المشاريع العقارية",

    // Navigation
    dashboard: "لوحة التحكم",
    apartments: "الشقق",
    sales: "شقق البيع",
    rentals: "شقق الإيجار",
    maintenance: "الصيانة",
    notifications: "التنبيهات",
    analytics: "التحليلات",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",

    // Home Page
    welcome: "أهلاً وسهلاً",
    mainSections: "الأقسام الرئيسية",
    salesDescription: "إدارة الشقق المعروضة للبيع والمبيعات",
    rentalsDescription: "إدارة الشقق المؤجرة والمستأجرين والدفعات",
    maintenanceDescription: "تسجيل وتتبع طلبات الصيانة",

    // Sales Page
    salesManagement: "إدارة البيع",
    totalApartments: "إجمالي الشقق",
    soldApartments: "شقق مباعة",
    availableApartments: "شقق متاحة",
    searchPlaceholder: "ابحث عن عنوان أو رقم شقة...",
    price: "السعر",
    sold: "مباعة",
    available: "متاحة",
    viewDetails: "عرض التفاصيل",
    noResults: "لا توجد شقق تطابق البحث",

    // Rentals Page
    rentalsManagement: "إدارة الإيجار",
    rentedApartments: "شقق مؤجرة",
    monthlyRent: "الإيجار الشهري",
    rented: "مؤجرة",

    // Maintenance Page
    maintenanceManagement: "إدارة الصيانة",
    maintenanceRequests: "طلبات الصيانة",
    description: "الوصف",
    workDone: "العمل المنجز",
    workRemaining: "العمل المتبقي",
    cost: "التكلفة",
    status: "الحالة",
    pending: "قيد الانتظار",
    inProgress: "قيد التنفيذ",
    completed: "مكتملة",

    // Notifications
    notificationsTitle: "التنبيهات",
    latePayment: "دفعة متأخرة",
    newMaintenance: "طلب صيانة جديد",
    markAsRead: "تعليم كمقروء",
    noNotifications: "لا توجد تنبيهات",

    // Analytics
    analyticsTitle: "اللوحة التحليلية",
    totalRevenue: "إجمالي الإيرادات",
    totalExpenses: "إجمالي النفقات",
    occupancyRate: "معدل الإشغال",
    maintenanceCosts: "تكاليف الصيانة",

    // Settings
    settingsTitle: "الإعدادات",
    accountSettings: "إعدادات الحساب",
    preferences: "التفضيلات",
    notificationSettings: "إعدادات الإشعارات",
    securitySettings: "إعدادات الأمان",
    aboutApp: "معلومات التطبيق",
    language: "اللغة",
    currency: "العملة",
    chooseLanguage: "اختر اللغة المفضلة لعرض التطبيق",
    chooseCurrency: "اختر العملة المستخدمة في جميع المعاملات المالية",
    emailNotifications: "الإشعارات عبر البريد الإلكتروني",
    latePaymentAlerts: "تنبيهات الدفعات المتأخرة",
    maintenanceAlerts: "تنبيهات الصيانة",
    paymentConfirmation: "تأكيد الدفع",
  },
  en: {
    // App Name
    appName: "Luxe",
    appDescription: "Real Estate Project Management System",

    // Navigation
    dashboard: "Dashboard",
    apartments: "Apartments",
    sales: "Sales",
    rentals: "Rentals",
    maintenance: "Maintenance",
    notifications: "Notifications",
    analytics: "Analytics",
    settings: "Settings",
    logout: "Logout",

    // Home Page
    welcome: "Welcome",
    mainSections: "Main Sections",
    salesDescription: "Manage apartments for sale and sales",
    rentalsDescription: "Manage rental apartments, tenants and payments",
    maintenanceDescription: "Record and track maintenance requests",

    // Sales Page
    salesManagement: "Sales Management",
    totalApartments: "Total Apartments",
    soldApartments: "Sold Apartments",
    availableApartments: "Available Apartments",
    searchPlaceholder: "Search by address or apartment number...",
    price: "Price",
    sold: "Sold",
    available: "Available",
    viewDetails: "View Details",
    noResults: "No apartments match your search",

    // Rentals Page
    rentalsManagement: "Rentals Management",
    rentedApartments: "Rented Apartments",
    monthlyRent: "Monthly Rent",
    rented: "Rented",

    // Maintenance Page
    maintenanceManagement: "Maintenance Management",
    maintenanceRequests: "Maintenance Requests",
    description: "Description",
    workDone: "Work Done",
    workRemaining: "Work Remaining",
    cost: "Cost",
    status: "Status",
    pending: "Pending",
    inProgress: "In Progress",
    completed: "Completed",

    // Notifications
    notificationsTitle: "Notifications",
    latePayment: "Late Payment",
    newMaintenance: "New Maintenance Request",
    markAsRead: "Mark as Read",
    noNotifications: "No notifications",

    // Analytics
    analyticsTitle: "Analytics Dashboard",
    totalRevenue: "Total Revenue",
    totalExpenses: "Total Expenses",
    occupancyRate: "Occupancy Rate",
    maintenanceCosts: "Maintenance Costs",

    // Settings
    settingsTitle: "Settings",
    accountSettings: "Account Settings",
    preferences: "Preferences",
    notificationSettings: "Notification Settings",
    securitySettings: "Security Settings",
    aboutApp: "About App",
    language: "Language",
    currency: "Currency",
    chooseLanguage: "Choose your preferred language",
    chooseCurrency: "Choose the currency used in all financial transactions",
    emailNotifications: "Email Notifications",
    latePaymentAlerts: "Late Payment Alerts",
    maintenanceAlerts: "Maintenance Alerts",
    paymentConfirmation: "Payment Confirmation",
  },
};

export function t(key: string, language: 'ar' | 'en'): string {
  const keys = key.split('.');
  let value: any = translations[language];
  
  for (const k of keys) {
    value = value?.[k];
  }
  
  return value || key;
}
