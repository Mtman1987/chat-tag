
import { MainDashboard } from "@/app/main-dashboard";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <MainDashboard />
      </main>
    </div>
  );
}
