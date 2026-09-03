import { Button } from "@/components/ui/button";
import { ClipboardList, FlaskConical, TestTubes, Users } from "lucide-react";
import { useLocation } from "wouter";

const items = [
  { path: "/", label: "طلبات التحاليل", icon: ClipboardList },
  { path: "/patients", label: "المرضى", icon: Users },
  { path: "/catalog", label: "دليل التحاليل", icon: TestTubes },
];

export function LabNavigation() {
  const [location, navigate] = useLocation();
  return (
    <div className="print:hidden space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-cyan-100 p-2 text-cyan-800">
          <FlaskConical className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">LUXE Lab</h1>
          <p className="text-sm text-muted-foreground">
            إدارة مخبر واحد والنتائج والذمم المالية
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(item => {
          const active =
            item.path === "/"
              ? location === "/" || location.startsWith("/orders/")
              : location.startsWith(item.path);
          return (
            <Button
              key={item.path}
              type="button"
              variant={active ? "default" : "outline"}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
