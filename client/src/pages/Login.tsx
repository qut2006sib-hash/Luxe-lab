import { AlertCircle, FlaskConical } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLoginUrl } from "@/const";

const safeErrors: Record<string, string> = {
  account_not_preseeded:
    "هذا البريد غير مُجهّز للوصول. اطلب من مالك النظام إضافته إلى المؤسسة أولاً.",
  email_not_allowed: "هذا البريد غير موجود في قائمة الوصول المسموح بها.",
  email_unverified: "يجب استخدام بريد Google موثّق.",
  identity_conflict: "تعذر ربط هوية Google بهذا الحساب بأمان.",
  provider_error: "تعذر إكمال تسجيل الدخول مع Google. حاول مرة أخرى.",
  state_mismatch: "انتهت أو أصبحت جلسة تسجيل الدخول غير صالحة. ابدأ من جديد.",
  transaction_expired: "انتهت مهلة تسجيل الدخول. ابدأ من جديد.",
};

export default function Login() {
  const errorCode =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("auth_error");
  const errorMessage = errorCode ? safeErrors[errorCode] : undefined;

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <FlaskConical className="w-8 h-8 text-cyan-700" />
            <h1 className="text-3xl font-bold text-gray-900">LUXE Lab</h1>
          </div>
          <p className="text-gray-600">نظام إدارة مخبر طبي واحد</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>تسجيل الدخول</CardTitle>
            <CardDescription>
              استخدم حساب Google المسموح والمُجهّز مسبقًا لمؤسستك.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {errorMessage ? (
              <Alert variant="destructive" data-testid="google-auth-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                لا ينشئ تسجيل الدخول مستخدمًا أو مؤسسة جديدة، ولا يحتفظ برموز
                وصول Google.
              </AlertDescription>
            </Alert>

            <Button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700"
              data-testid="oauth-login-button"
              onClick={() => {
                window.location.assign(getLoginUrl());
              }}
            >
              المتابعة باستخدام Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
