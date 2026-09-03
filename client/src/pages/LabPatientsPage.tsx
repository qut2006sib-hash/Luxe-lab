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
import { trpc } from "@/lib/trpc";
import { Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Sex = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";

const sexLabels: Record<Sex, string> = {
  MALE: "ذكر",
  FEMALE: "أنثى",
  OTHER: "آخر",
  UNSPECIFIED: "غير محدد",
};

export default function LabPatientsPage() {
  const utils = trpc.useUtils();
  const patients = trpc.lab.patients.list.useQuery();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    birthDate: "",
    sex: "UNSPECIFIED" as Sex,
    notes: "",
  });
  const createPatient = trpc.lab.patients.create.useMutation({
    onSuccess: async result => {
      await utils.lab.patients.list.invalidate();
      setForm({
        fullName: "",
        phone: "",
        birthDate: "",
        sex: "UNSPECIFIED",
        notes: "",
      });
      toast.success(`تم إنشاء ملف المريض ${result.patientNumber}`);
    },
    onError: error => toast.error(error.message),
  });

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (patients.data ?? []).filter(patient =>
    [patient.fullName, patient.patientNumber, patient.phone]
      .filter(Boolean)
      .some(value => value!.toLowerCase().includes(normalizedSearch))
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <LabNavigation />
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                مريض جديد
              </CardTitle>
              <CardDescription>
                يُنشأ للمريض حساب ذمة مرتبط تلقائيًا بالفواتير.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={event => {
                  event.preventDefault();
                  createPatient.mutate({
                    fullName: form.fullName.trim(),
                    phone: form.phone.trim() || undefined,
                    birthDate: form.birthDate
                      ? new Date(`${form.birthDate}T00:00:00`)
                      : undefined,
                    sex: form.sex,
                    notes: form.notes.trim() || undefined,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="patient-name">الاسم الكامل</Label>
                  <Input
                    id="patient-name"
                    data-testid="patient-name"
                    required
                    value={form.fullName}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patient-phone">الهاتف</Label>
                  <Input
                    id="patient-phone"
                    data-testid="patient-phone"
                    dir="ltr"
                    value={form.phone}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patient-birth-date">تاريخ الميلاد</Label>
                  <Input
                    id="patient-birth-date"
                    type="date"
                    value={form.birthDate}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        birthDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>الجنس</Label>
                  <Select
                    value={form.sex}
                    onValueChange={value =>
                      setForm(current => ({
                        ...current,
                        sex: value as Sex,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(sexLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patient-notes">ملاحظات</Label>
                  <Textarea
                    id="patient-notes"
                    value={form.notes}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </div>
                <Button
                  className="w-full"
                  type="submit"
                  data-testid="patient-save"
                  disabled={
                    createPatient.isPending || form.fullName.trim().length < 2
                  }
                >
                  {createPatient.isPending ? "جاري الحفظ…" : "حفظ ملف المريض"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>سجل المرضى</CardTitle>
              <CardDescription>
                {(patients.data ?? []).length} مريض مسجل في هذا المخبر
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  placeholder="بحث بالاسم أو الرقم أو الهاتف"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>
              {patients.isLoading && (
                <div className="py-12 text-center">جاري التحميل…</div>
              )}
              {patients.error && (
                <div className="space-y-3 py-12 text-center">
                  <p>{patients.error.message}</p>
                  <Button onClick={() => patients.refetch()}>
                    إعادة المحاولة
                  </Button>
                </div>
              )}
              {!patients.isLoading &&
                !patients.error &&
                filtered.map(patient => (
                  <div
                    key={patient.id}
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold">{patient.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {patient.patientNumber}
                        {patient.phone ? ` · ${patient.phone}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{sexLabels[patient.sex]}</Badge>
                  </div>
                ))}
              {!patients.isLoading &&
                !patients.error &&
                filtered.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground">
                    لا توجد نتائج مطابقة.
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
