import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme";
import { cn } from "@/lib/utils";

interface Props { satellite?: boolean }

export function ThemeToggle({ satellite }: Props) {
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "group h-11 w-11 rounded-2xl border transition-all duration-200 hover:border-primary/50 active:scale-90",
        satellite
          ? "glass-satellite text-white/70 hover:text-white"
          : "glass border-white/10 hover:text-primary",
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Moon className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12" />
      ) : (
        <Sun className="h-5 w-5 transition-transform duration-300 group-hover:rotate-45" />
      )}
    </Button>
  );
}
