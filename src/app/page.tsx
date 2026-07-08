import { Dashboard } from "@/components/dashboard";
import { ErrorBoundary } from "@/components/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
