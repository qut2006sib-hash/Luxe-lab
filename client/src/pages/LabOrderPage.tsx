import DashboardLayout from "@/components/DashboardLayout";
import { LabNavigation } from "@/components/LabNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Printer,
  RefreshCw,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ResultFlag = "UNKNOWN" | "NORMAL" | "HIGH" | "LOW" | "ABNORMAL";

type ResultDraft = {
  value: string;
  flag: ResultFlag;
  notes: string;
  version: number;
};

const statusLabels: Record<string, string> = {
  DRAFT: "بانتظار الفوترة",
  ORDERED: "بانتظار النتائج",
  IN_PROGRESS: "إدخال النتائج",
  COMPLETED: "جاهز للاعتماد",
  APPROVED: "معتمد",
  CANCELLED: "ملغى",
};

const flagLabels: Record<ResultFlag, string> = {
  UNKNOWN: "غير محدد",
  NORMAL: "طبيعي",
  HIGH: "مرتفع",
  LOW: "منخفض",
  ABNORMAL: "غير طبيعي",
};

export default function LabOrderPage({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const { currency, language } = useSettings();
  const orderId = Number(params.id);
  const validId = Number.isSafeInteger(orderId) && orderId > 0;
  const utils = trpc.useUtils();
  const detail = trpc.lab.orders.get.useQuery(
    { orderId },
    { enabled: validId, retry: false }
  );
  const membership = trpc.organization.current.useQuery(undefined, {
    enabled: validId,
  });
  const accounts = trpc.accounting.accounts.list.useQuery(undefined, {
    enabled: validId,
  });
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({});
  const [dirtyResultIds, setDirtyResultIds] = useState<number[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");

  useEffect(() => {
    if (!detail.data) return;
    const next: Record<number, ResultDraft> = {};
    for (const item of detail.data.items) {
      for (const result of item.results) {
        next[result.id] = {
          value: result.value ?? "",
          flag: result.flag,
          notes: result.notes ?? "",
          version: result.version,
        };
      }
    }
    setDrafts(next);
    setDirtyResultIds([]);
    setPaymentAmount(detail.data.invoice?.balanceDue ?? "");
  }, [detail.data]);

  const refresh = async () => {
    await Promise.all([
      detail.refetch(),
      utils.lab.orders.list.invalidate(),
      utils.lab.summary.invalidate(),
      utils.accounting.documents.list.invalidate(),
      utils.accounting.payments.list.invalidate(),
    ]);
  };
  const saveResults = trpc.lab.orders.saveResults.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم حفظ النتائج");
    },
    onError: error => toast.error(error.message),
  });
  const approve = trpc.lab.orders.approve.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم اعتماد النتائج وإقفالها");
    },
    onError: error => toast.error(error.message),
  });
  const retryBilling = trpc.lab.orders.retryBilling.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم إنشاء الفاتورة والقيد المحاسبي");
    },
    onError: error => toast.error(error.message),
  });
  const recordPayment = trpc.accounting.payments.record.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("تم تسجيل الدفعة");
    },
    onError: error => toast.error(error.message),
  });

  const updateDraft = (resultId: number, values: Partial<ResultDraft>) => {
    setDrafts(current => ({
      ...current,
      [resultId]: { ...current[resultId]!, ...values },
    }));
    setDirtyResultIds(current =>
      current.includes(resultId) ? current : [...current, resultId]
    );
  };

  if (!validId) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            رقم طلب التحليل غير صالح.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }
  if (detail.isLoading) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">جاري التحميل…</CardContent>
        </Card>
      </DashboardLayout>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="space-y-4 py-12 text-center">
            <p>{detail.error?.message ?? "طلب التحليل غير موجود"}</p>
            <Button onClick={() => navigate("/")}>العودة إلى الطلبات</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const data = detail.data;
  const editable =
    data.order.status === "ORDERED" || data.order.status === "IN_PROGRESS";
  const approved = data.order.status === "APPROVED";
  const cashAccount = accounts.data?.find(account => account.code === "1000");
  const canRecordPayment =
    membership.data?.role === "owner" &&
    cashAccount &&
    data.invoice &&
    (data.invoice.status === "POSTED" ||
      data.invoice.status === "PARTIALLY_PAID") &&
    Number(data.invoice.balanceDue) > 0;

  return (
    <DashboardLayout>
      <div className="lab-print-area mx-auto max-w-5xl space-y-6">
        <LabNavigation />
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowRight className="h-4 w-4" />
            العودة
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              طباعة النتيجة
            </Button>
            {data.order.status === "DRAFT" && (
              <Button
                onClick={() => retryBilling.mutate({ orderId })}
                disabled={retryBilling.isPending}
              >
                <RefreshCw className="h-4 w-4" />
                إعادة محاولة الفوترة
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-2xl">
                  نتيجة طلب {data.order.orderNumber}
                </CardTitle>
                <CardDescription className="mt-2">
                  {new Date(data.order.orderedAt).toLocaleString("ar-SY")}
                </CardDescription>
              </div>
              <Badge
                className="w-fit"
                variant={approved ? "default" : "secondary"}
              >
                {statusLabels[data.order.status] ?? data.order.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="المريض" value={data.patient.fullName} />
            <Info
              label="رقم المريض"
              value={data.patient.patientNumber ?? "-"}
            />
            <Info
              label="تاريخ الميلاد"
              value={
                data.patient.birthDate
                  ? new Date(data.patient.birthDate).toLocaleDateString("ar-SY")
                  : "-"
              }
            />
            <Info label="الهاتف" value={data.patient.phone ?? "-"} />
          </CardContent>
        </Card>

        {data.items.map(({ item, results }) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{item.testName}</CardTitle>
                  <CardDescription>{item.testCode}</CardDescription>
                </div>
                <Badge variant="outline">
                  {item.status === "PENDING"
                    ? "بانتظار النتيجة"
                    : item.status === "RESULTED"
                      ? "مكتمل"
                      : "معتمد"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {results.map(result => {
                const draft = drafts[result.id];
                if (!draft) return null;
                return (
                  <div
                    key={result.id}
                    className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px]"
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`result-${result.id}`}>
                        {result.parameterName}
                      </Label>
                      {result.resultType === "CHOICE" ? (
                        <Select
                          value={draft.value}
                          disabled={!editable}
                          onValueChange={value =>
                            updateDraft(result.id, { value })
                          }
                        >
                          <SelectTrigger
                            id={`result-${result.id}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="اختر النتيجة" />
                          </SelectTrigger>
                          <SelectContent>
                            {(result.choices ?? []).map(choice => (
                              <SelectItem key={choice} value={choice}>
                                {choice}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`result-${result.id}`}
                          dir={result.resultType === "NUMBER" ? "ltr" : "auto"}
                          inputMode={
                            result.resultType === "NUMBER" ? "decimal" : "text"
                          }
                          disabled={!editable}
                          value={draft.value}
                          onChange={event =>
                            updateDraft(result.id, {
                              value: event.target.value,
                            })
                          }
                        />
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>الوحدة: {result.unit ?? "-"}</span>
                        <span>
                          المجال المرجعي: {result.referenceRange ?? "-"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>التصنيف</Label>
                      <Select
                        value={draft.flag}
                        disabled={!editable}
                        onValueChange={value =>
                          updateDraft(result.id, {
                            flag: value as ResultFlag,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(flagLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 print:hidden">
                      <Label>ملاحظة</Label>
                      <Textarea
                        className="min-h-9"
                        disabled={!editable}
                        value={draft.notes}
                        onChange={event =>
                          updateDraft(result.id, {
                            notes: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        <div className="print:hidden flex flex-wrap justify-end gap-3">
          {editable && (
            <Button
              disabled={saveResults.isPending || dirtyResultIds.length === 0}
              onClick={() => {
                const results = dirtyResultIds.map(resultId => ({
                  resultId,
                  version: drafts[resultId]!.version,
                  value: drafts[resultId]!.value,
                  flag: drafts[resultId]!.flag,
                  notes: drafts[resultId]!.notes.trim() || undefined,
                }));
                if (results.some(result => !result.value.trim())) {
                  toast.error("أدخل قيمة لكل نتيجة معدلة قبل الحفظ");
                  return;
                }
                saveResults.mutate({
                  orderId,
                  orderVersion: data.order.version,
                  results,
                });
              }}
            >
              <Save className="h-4 w-4" />
              حفظ النتائج
            </Button>
          )}
          {data.order.status === "COMPLETED" && (
            <Button
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate({
                  orderId,
                  orderVersion: data.order.version,
                })
              }
            >
              <BadgeCheck className="h-4 w-4" />
              اعتماد النتائج
            </Button>
          )}
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              الحالة المالية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.invoice ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Info
                    label="إجمالي الفاتورة"
                    value={formatPrice(
                      Number(data.invoice.total),
                      currency,
                      language
                    )}
                  />
                  <Info
                    label="المدفوع"
                    value={formatPrice(
                      Number(data.invoice.paidAmount),
                      currency,
                      language
                    )}
                  />
                  <Info
                    label="المتبقي"
                    value={formatPrice(
                      Number(data.invoice.balanceDue),
                      currency,
                      language
                    )}
                  />
                </div>
                {canRecordPayment && (
                  <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="lab-payment">دفعة نقدية</Label>
                      <Input
                        id="lab-payment"
                        dir="ltr"
                        inputMode="decimal"
                        value={paymentAmount}
                        onChange={event => setPaymentAmount(event.target.value)}
                      />
                    </div>
                    <Button
                      disabled={
                        recordPayment.isPending ||
                        !paymentAmount ||
                        Number(paymentAmount) <= 0
                      }
                      onClick={() =>
                        recordPayment.mutate({
                          documentId: data.invoice!.id,
                          documentVersion: data.invoice!.version,
                          cashAccountId: cashAccount!.id,
                          amount: paymentAmount,
                          method: "CASH",
                          idempotencyKey: `lab-order-${orderId}-payment-${crypto.randomUUID()}`,
                        })
                      }
                    >
                      تسجيل الدفعة
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-amber-700">
                لم تُنشأ الفاتورة بعد. استخدم إعادة محاولة الفوترة أعلى الصفحة.
              </p>
            )}
          </CardContent>
        </Card>

        {approved && (
          <div className="hidden border-t pt-4 text-center text-sm print:block">
            تم اعتماد هذه النتائج إلكترونيًا ضمن LUXE Lab.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
