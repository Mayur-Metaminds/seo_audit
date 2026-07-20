import type { CategoryScore } from "@/types/audit.types";
import { cn } from "@/lib/utils/cn";

export function CategoryBreakdown({ categories }: { categories: CategoryScore[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Category Breakdown</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat.category} className="rounded-xl border border-card-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">{cat.label}</h3>
              <span className={cn(
                "text-sm font-bold tabular-nums",
                cat.percentage >= 80 ? "text-success" : cat.percentage >= 60 ? "text-warning" : "text-danger"
              )}>
                {cat.percentage}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-card-border overflow-hidden mb-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  cat.percentage >= 80 ? "bg-success" : cat.percentage >= 60 ? "bg-warning" : "bg-danger"
                )}
                style={{ width: `${cat.percentage}%` }}
              />
            </div>
            <p className="text-xs text-muted">
              {cat.score} / {cat.maxScore} points · {cat.checks.length} checks
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
