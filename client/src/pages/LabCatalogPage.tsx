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
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { Plus, TestTubes, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

type ResultType = "NUMBER" | "TEXT" | "CHOICE";

type ParameterForm = {
  key: string;
  code: string;
  name: string;
  resultType: ResultType;
  unit: string;
  referenceRange: string;
  choices: string;
};

function emptyParameter(): ParameterForm {
  return {
    key: crypto.randomUUID(),
    code: "",
    name: "",
    resultType: "TEXT",
    unit: "",
    referenceRange: "",
    choices: "",
  };
}

export default function LabCatalogPage() {
  const { currency, language } = useSettings();
  const utils = trpc.useUtils();
  const tests = trpc.lab.tests.list.useQuery();
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    sampleType: "",
    price: "",
  });
  const [parameters, setParameters] = useState<ParameterForm[]>([
    emptyParameter(),
  ]);
  const createTest = trpc.lab.tests.create.useMutation({
    onSuccess: async () => {
      await utils.lab.tests.list.invalidate();
      setForm({
        code: "",
        name: "",
        category: "",
        sampleType: "",
        price: "",
      });
      setParameters([emptyParameter()]);
      toast.success("تمت إضافة التحليل إلى الدليل");
    },
    onError: error => toast.error(error.message),
  });

  const updateParameter = (key: string, values: Partial<ParameterForm>) => {
    setParameters(current =>
      current.map(parameter =>
        parameter.key === key ? { ...parameter, ...values } : parameter
      )
    );
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <LabNavigation />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTubes className="h-5 w-5" />
                دليل التحاليل
              </CardTitle>
              <CardDescription>
                كل تحليل يحتفظ بالسعر وحقول النتائج والوحدات والمجالات المرجعية.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tests.isLoading && (
                <div className="py-12 text-center">جاري التحميل…</div>
              )}
              {tests.error && (
                <div className="space-y-3 py-12 text-center">
                  <p>{tests.error.message}</p>
                  <Button onClick={() => tests.refetch()}>
                    إعادة المحاولة
                  </Button>
                </div>
              )}
              {(tests.data ?? []).map(row => (
                <div key={row.test.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{row.test.name}</h3>
                        <Badge variant="outline">{row.test.code}</Badge>
                        {!row.test.isActive && (
                          <Badge variant="secondary">متوقف</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[row.test.category, row.test.sampleType]
                          .filter(Boolean)
                          .join(" · ") || "دون تصنيف أو نوع عينة"}
                      </p>
                    </div>
                    <strong>
                      {formatPrice(Number(row.test.price), currency, language)}
                    </strong>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {row.parameters.map(parameter => (
                      <div
                        key={parameter.id}
                        className="rounded-lg bg-muted/60 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{parameter.name}</span>
                          <Badge variant="secondary">
                            {parameter.resultType}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {parameter.code}
                          {parameter.unit ? ` · ${parameter.unit}` : ""}
                          {parameter.referenceRange
                            ? ` · المرجع ${parameter.referenceRange}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!tests.isLoading &&
                !tests.error &&
                (tests.data?.length ?? 0) === 0 && (
                  <div className="py-12 text-center text-muted-foreground">
                    دليل التحاليل فارغ.
                  </div>
                )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>إضافة تحليل</CardTitle>
              <CardDescription>
                يمكن للتحليل أن يحتوي حقل نتيجة واحدًا أو مجموعة حقول.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={event => {
                  event.preventDefault();
                  createTest.mutate({
                    code: form.code.trim(),
                    name: form.name.trim(),
                    category: form.category.trim() || undefined,
                    sampleType: form.sampleType.trim() || undefined,
                    price: form.price,
                    parameters: parameters.map(parameter => ({
                      code: parameter.code.trim(),
                      name: parameter.name.trim(),
                      resultType: parameter.resultType,
                      unit: parameter.unit.trim() || undefined,
                      referenceRange:
                        parameter.referenceRange.trim() || undefined,
                      choices:
                        parameter.resultType === "CHOICE"
                          ? parameter.choices
                              .split(",")
                              .map(choice => choice.trim())
                              .filter(Boolean)
                          : undefined,
                    })),
                  });
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="رمز التحليل">
                    <Input
                      dir="ltr"
                      required
                      data-testid="test-code"
                      placeholder="FBS"
                      value={form.code}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="السعر">
                    <Input
                      dir="ltr"
                      required
                      data-testid="test-price"
                      inputMode="decimal"
                      placeholder="10.00"
                      value={form.price}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          price: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
                <Field label="اسم التحليل">
                  <Input
                    required
                    data-testid="test-name"
                    value={form.name}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="التصنيف">
                    <Input
                      placeholder="كيمياء حيوية"
                      value={form.category}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="نوع العينة">
                    <Input
                      placeholder="مصل"
                      value={form.sampleType}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          sampleType: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>حقول النتائج</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setParameters(current => [...current, emptyParameter()])
                      }
                    >
                      <Plus className="h-4 w-4" />
                      حقل
                    </Button>
                  </div>
                  {parameters.map((parameter, index) => (
                    <div
                      key={parameter.key}
                      className="space-y-3 rounded-xl border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          الحقل {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={parameters.length === 1}
                          onClick={() =>
                            setParameters(current =>
                              current.filter(row => row.key !== parameter.key)
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          dir="ltr"
                          required
                          data-testid="parameter-code"
                          placeholder="CODE"
                          value={parameter.code}
                          onChange={event =>
                            updateParameter(parameter.key, {
                              code: event.target.value,
                            })
                          }
                        />
                        <Input
                          required
                          data-testid="parameter-name"
                          placeholder="اسم النتيجة"
                          value={parameter.name}
                          onChange={event =>
                            updateParameter(parameter.key, {
                              name: event.target.value,
                            })
                          }
                        />
                      </div>
                      <Select
                        value={parameter.resultType}
                        onValueChange={value =>
                          updateParameter(parameter.key, {
                            resultType: value as ResultType,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NUMBER">رقم</SelectItem>
                          <SelectItem value="TEXT">نص</SelectItem>
                          <SelectItem value="CHOICE">اختيار</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          placeholder="الوحدة"
                          value={parameter.unit}
                          onChange={event =>
                            updateParameter(parameter.key, {
                              unit: event.target.value,
                            })
                          }
                        />
                        <Input
                          placeholder="المجال المرجعي"
                          value={parameter.referenceRange}
                          onChange={event =>
                            updateParameter(parameter.key, {
                              referenceRange: event.target.value,
                            })
                          }
                        />
                      </div>
                      {parameter.resultType === "CHOICE" && (
                        <Input
                          placeholder="الخيارات مفصولة بفاصلة: إيجابي, سلبي"
                          value={parameter.choices}
                          onChange={event =>
                            updateParameter(parameter.key, {
                              choices: event.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  type="submit"
                  data-testid="test-save"
                  disabled={createTest.isPending}
                >
                  {createTest.isPending ? "جاري الحفظ…" : "حفظ التحليل"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
