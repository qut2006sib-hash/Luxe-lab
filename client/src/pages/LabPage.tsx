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
import { Checkbox } from "@/components/ui/checkbox";
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
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  Plus,
  ReceiptText,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const orderStatus: Record<string, string> = {
  DRAFT: "بانتظار الفوترة",
  ORDERED: "بانتظار النتائج",
  IN_PROGRESS: "إدخال النتائج",
  COMPLETED: "جاهز للاعتماد",
  APPROVED: "معتمد",
  CANCELLED: "ملغى",
};

const invoiceStatus: Record<string, string> = {
  POSTED: "غير مدفوع",
  PARTIALLY_PAID: "مدفوع جزئيًا",
  PAID: "مدفوع",
};

export default function LabPage() {
  const [, navigate] = useLocation();
  const { currency, language } = useSettings();
  const utils = trpc.useUtils();
  const summary = trpc.lab.summary.useQuery();
  const orders = trpc.lab.orders.list.useQuery();
  const patients = trpc.lab.patients.list.useQuery();
  const tests = trpc.lab.tests.list.useQuery();
  const accounts = trpc.accounting.accounts.list.useQuery();
  const [patientId, setPatientId] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  const setupAccounting = trpc.accounting.setup.useMutation({
    onSuccess: async () => {
      await accounts.refetch();
      toast.success("تم تجهيز النواة المحاسبية للمخبر");
    },
    onError: error => toast.error(error.message),
  });
  const createOrder = trpc.lab.orders.create.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.lab.orders.list.invalidate(),
        utils.lab.summary.invalidate(),
        utils.accounting.documents.list.invalidate(),
      ]);
      setPatientId("");
      setSelectedTestIds([]);
      setNotes("");
      if (result.billingPending) {
        toast.warning(
          `تم حفظ الطلب، لكن الفوترة معلّقة: ${result.billingError}`
        );
      } else {
        toast.success("تم إنشاء طلب التحاليل وقيده محاسبيًا");
      }
      navigate(`/orders/${result.id}`);
    },
    onError: error => toast.error(error.message),
  });

  const activeTests = (tests.data ?? []).filter(row => row.test.isActive);
  const selectedTotal = activeTests
    .filter(row => selectedTestIds.includes(row.test.id))
    .reduce((total, row) => total + Number(row.test.price), 0);
  const loading =
    summary.isLoading ||
    orders.isLoading ||
    patients.isLoading ||
    tests.isLoading ||
    accounts.isLoading;
  const loadError =
    summary.error ??
    orders.error ??
    patients.error ??
    tests.error ??
    accounts.error;
  const accountingReady = (accounts.data?.length ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <LabNavigation />

        {loading && (
          <Card>
            <CardContent className="py-12 text-center">
              جاري تحميل بيانات المخبر…
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card>
            <CardContent className="space-y-4 py-12 text-center">
              <p>تعذر تحميل بيانات المخبر: {loadError.message}</p>
              <Button
                onClick={() => {
                  summary.refetch();
                  orders.refetch();
                  patients.refetch();
                  tests.refetch();
                  accounts.refetch();
                }}
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && (
          <>
            {!accountingReady && (
              <Card className="border-amber-300 bg-amber-50/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-900">
                    <ReceiptText className="h-5 w-5" />
                    يلزم تجهيز المحاسبة مرة واحدة
                  </CardTitle>
                  <CardDescription>
                    سيُنشأ دليل الحسابات الأساسي لربط كل طلب تحليل بفاتورته
                    وقيده المالي.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    data-testid="accounting-setup"
                    onClick={() => setupAccounting.mutate()}
                    disabled={setupAccounting.isPending}
                  >
                    {setupAccounting.isPending
                      ? "جاري التجهيز…"
                      : "تجهيز المحاسبة"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {summary.data && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  title="إجمالي الطلبات"
                  value={summary.data.totalOrders}
                  icon={<ClipboardList />}
                />
                <SummaryCard
                  title="بانتظار النتائج"
                  value={summary.data.pendingResults}
                  icon={<Clock3 />}
                />
                <SummaryCard
                  title="جاهزة للاعتماد"
                  value={summary.data.readyForApproval}
                  icon={<FileCheck2 />}
                />
                <SummaryCard
                  title="نتائج معتمدة"
                  value={summary.data.approvedOrders}
                  icon={<CheckCircle2 />}
                />
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card>
                <CardHeader>
                  <CardTitle>طلبات التحاليل</CardTitle>
                  <CardDescription>
                    افتح أي طلب لإدخال النتائج أو اعتمادها وطباعتها.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(orders.data ?? []).map(row => (
                    <button
                      key={row.order.id}
                      type="button"
                      onClick={() => navigate(`/orders/${row.order.id}`)}
                      className="flex w-full flex-col gap-3 rounded-xl border p-4 text-right transition hover:border-primary/50 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            {row.order.orderNumber}
                          </span>
                          <Badge variant="secondary">
                            {orderStatus[row.order.status] ?? row.order.status}
                          </Badge>
                          {row.invoiceStatus && (
                            <Badge
                              variant={
                                row.invoiceStatus === "PAID"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {invoiceStatus[row.invoiceStatus] ??
                                row.invoiceStatus}
                            </Badge>
                          )}
                        </div>
                        <p>{row.patientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.patientNumber ?? "دون رقم مريض"} ·{" "}
                          {new Date(row.order.orderedAt).toLocaleString(
                            "ar-SY"
                          )}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">
                          {formatPrice(
                            Number(row.order.total),
                            currency,
                            language
                          )}
                        </p>
                        {row.balanceDue !== null && (
                          <p className="text-xs text-muted-foreground">
                            المتبقي:{" "}
                            {formatPrice(
                              Number(row.balanceDue),
                              currency,
                              language
                            )}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                  {(orders.data?.length ?? 0) === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      لا توجد طلبات بعد. أنشئ أول طلب من النموذج المجاور.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    طلب تحاليل جديد
                  </CardTitle>
                  <CardDescription>
                    تُنشأ الفاتورة والقيد المحاسبي تلقائيًا عند الحفظ.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-5"
                    onSubmit={event => {
                      event.preventDefault();
                      createOrder.mutate({
                        patientId: Number(patientId),
                        testIds: selectedTestIds,
                        notes: notes.trim() || undefined,
                      });
                    }}
                  >
                    <div className="space-y-2">
                      <Label>المريض</Label>
                      <Select value={patientId} onValueChange={setPatientId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="اختر المريض" />
                        </SelectTrigger>
                        <SelectContent>
                          {(patients.data ?? []).map(patient => (
                            <SelectItem
                              key={patient.id}
                              value={String(patient.id)}
                            >
                              {patient.fullName} — {patient.patientNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(patients.data?.length ?? 0) === 0 && (
                        <Button
                          type="button"
                          variant="link"
                          className="px-0"
                          onClick={() => navigate("/patients")}
                        >
                          أضف مريضًا أولًا
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <Label>التحاليل المطلوبة</Label>
                      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">
                        {activeTests.map(row => {
                          const selected = selectedTestIds.includes(
                            row.test.id
                          );
                          return (
                            <label
                              key={row.test.id}
                              className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50"
                            >
                              <Checkbox
                                data-testid={`test-option-${row.test.id}`}
                                checked={selected}
                                onCheckedChange={checked => {
                                  setSelectedTestIds(current =>
                                    checked
                                      ? [...current, row.test.id]
                                      : current.filter(id => id !== row.test.id)
                                  );
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium">
                                  {row.test.name}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {row.test.code} · {row.parameters.length}{" "}
                                  نتيجة
                                </span>
                              </span>
                              <span className="text-sm font-medium">
                                {formatPrice(
                                  Number(row.test.price),
                                  currency,
                                  language
                                )}
                              </span>
                            </label>
                          );
                        })}
                        {activeTests.length === 0 && (
                          <Button
                            type="button"
                            variant="link"
                            onClick={() => navigate("/catalog")}
                          >
                            أضف تحليلًا إلى الدليل أولًا
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lab-order-notes">ملاحظات الطلب</Label>
                      <Textarea
                        id="lab-order-notes"
                        value={notes}
                        onChange={event => setNotes(event.target.value)}
                        placeholder="معلومات سريرية أو ملاحظة داخلية اختيارية"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                      <span>الإجمالي</span>
                      <strong>
                        {formatPrice(selectedTotal, currency, language)}
                      </strong>
                    </div>
                    <Button
                      className="w-full"
                      type="submit"
                      data-testid="order-create"
                      disabled={
                        createOrder.isPending ||
                        !accountingReady ||
                        !patientId ||
                        selectedTestIds.length === 0
                      }
                    >
                      {createOrder.isPending
                        ? "جاري إنشاء الطلب…"
                        : "إنشاء الطلب والفاتورة"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-cyan-700">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
