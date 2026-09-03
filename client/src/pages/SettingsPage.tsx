import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/contexts/SettingsContext";
import { trpc } from "@/lib/trpc";
import { Bell, DollarSign, Globe, Lock, LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const defaultNotifications = {
  emailNotifications: true,
  latePaymentAlerts: true,
  maintenanceAlerts: true,
  paymentConfirmation: true,
};

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { currency, language, setCurrency, setLanguage } = useSettings();
  const { data: membership } = trpc.organization.current.useQuery();
  const { data: persistedSettings, isLoading } = trpc.settings.get.useQuery();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState(defaultNotifications);

  useEffect(() => {
    if (!persistedSettings) return;
    setNotificationSettings({
      emailNotifications: persistedSettings.emailNotifications,
      latePaymentAlerts: persistedSettings.latePaymentAlerts,
      maintenanceAlerts: persistedSettings.maintenanceAlerts,
      paymentConfirmation: persistedSettings.paymentConfirmation,
    });
  }, [persistedSettings]);

  const saveSettingsMutation = trpc.settings.update.useMutation({
    onSuccess: saved => {
      setCurrency(saved.currency);
      setLanguage(saved.language);
      setNotificationSettings({
        emailNotifications: saved.emailNotifications,
        latePaymentAlerts: saved.latePaymentAlerts,
        maintenanceAlerts: saved.maintenanceAlerts,
        paymentConfirmation: saved.paymentConfirmation,
      });
      toast.success("تم حفظ الإعدادات بنجاح");
    },
    onError: () => {
      toast.error("تعذر حفظ الإعدادات");
    },
  });

  const saveSettings = () => {
    saveSettingsMutation.mutate({
      currency,
      language,
      ...notificationSettings,
    });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      window.location.href = "/login";
    } finally {
      setIsLoggingOut(false);
    }
  };

  const saveDisabled = isLoading || saveSettingsMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">الإعدادات</h1>
          <p className="text-gray-600">إدارة حسابك والإعدادات الخاصة بك</p>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="account">الحساب</TabsTrigger>
            <TabsTrigger value="preferences">التفضيلات</TabsTrigger>
            <TabsTrigger value="notifications">الإشعارات</TabsTrigger>
            <TabsTrigger value="security">الأمان</TabsTrigger>
            <TabsTrigger value="about">معلومات</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <User className="w-5 h-5" />
                معلومات الحساب
              </h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">الاسم</Label>
                  <Input
                    id="name"
                    value={user?.name || ""}
                    disabled
                    className="mt-2 bg-gray-100"
                  />
                </div>
                <div>
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    value={user?.email || ""}
                    disabled
                    className="mt-2 bg-gray-100"
                  />
                </div>
                {membership && (
                  <>
                    <div>
                      <Label htmlFor="company">اسم المخبر</Label>
                      <Input
                        id="company"
                        value={membership.organization.name}
                        disabled
                        className="mt-2 bg-gray-100"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">رقم الهاتف</Label>
                      <Input
                        id="phone"
                        value={membership.organization.phone || ""}
                        disabled
                        className="mt-2 bg-gray-100"
                      />
                    </div>
                  </>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Globe className="w-5 h-5" />
                التفضيلات العامة
              </h3>
              <div className="space-y-6">
                <div>
                  <Label htmlFor="language" className="mb-3 block">
                    اللغة
                  </Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="language" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label
                    htmlFor="currency"
                    className="mb-3 flex items-center gap-2"
                  >
                    <DollarSign className="w-4 h-4" />
                    العملة
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">دولار أمريكي ($)</SelectItem>
                      <SelectItem value="SAR">ريال سعودي (ر.س)</SelectItem>
                      <SelectItem value="AED">درهم إماراتي (د.إ)</SelectItem>
                      <SelectItem value="SYP">ليرة سورية (ل.س)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={saveSettings}
                  disabled={saveDisabled}
                  className="w-full"
                >
                  {saveSettingsMutation.isPending
                    ? "جاري الحفظ..."
                    : "حفظ التفضيلات"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                إعدادات الإشعارات
              </h3>
              <div className="space-y-4">
                {[
                  ["emailNotifications", "الإشعارات عبر البريد الإلكتروني"],
                  ["latePaymentAlerts", "تنبيهات الفواتير غير المسددة"],
                  ["maintenanceAlerts", "تنبيهات جاهزية النتائج"],
                ].map(([key, label]) => {
                  const typedKey = key as keyof typeof notificationSettings;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <p className="font-medium text-gray-900">{label}</p>
                      <Switch
                        checked={notificationSettings[typedKey]}
                        onCheckedChange={checked =>
                          setNotificationSettings(current => ({
                            ...current,
                            [typedKey]: checked,
                          }))
                        }
                      />
                    </div>
                  );
                })}

                <Button
                  onClick={saveSettings}
                  disabled={saveDisabled}
                  className="w-full mt-6"
                >
                  {saveSettingsMutation.isPending
                    ? "جاري الحفظ..."
                    : "حفظ إعدادات الإشعارات"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5" />
                الأمان
              </h3>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  إدارة كلمة المرور والمصادقة المتقدمة تتم عبر موفر تسجيل الدخول
                  الآمن.
                </p>
                <Button
                  variant="destructive"
                  className="w-full justify-start mt-6"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  <LogOut className="w-4 h-4 ml-2" />
                  {isLoggingOut ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="about" className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                معلومات التطبيق
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">الإصدار</span>
                  <span className="font-medium">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">الحالة</span>
                  <span className="font-medium text-green-600">نشط</span>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    LUXE Lab - نظام إدارة المخبر الطبي
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
