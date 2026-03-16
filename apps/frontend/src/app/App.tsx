import { useState, useEffect, useCallback } from "react";

import { Sidebar }        from "@/components/layout/Sidebar";
import { Header }         from "@/components/layout/Header";
import { Loader }         from "@/components/ui/Loader";
import type { Page }      from "@/components/layout/Sidebar";

import { Dashboard }      from "@/features/dashboard/Dashboard";
import { POS }            from "@/features/sales/POS";
import { Sales }          from "@/features/sales/Sales";
import { Inventory }      from "@/features/inventory/Inventory";
import { Expenses }       from "@/features/expenses/Expenses";
import { Customers }      from "@/features/customers/Customers";
import { Suppliers }      from "@/features/suppliers/Suppliers";
import { Reports }        from "@/features/reports/Reports";
import { QueryPanel }     from "@/features/query/QueryPanel";
import { Scanner }        from "@/features/scanner/Scanner";   // ← NEW

import { dbGet } from "@/lib/api";
import { useRefresh } from "@/hooks/useRefresh";

export function App() {
  const [ready,    setReady]    = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [page,     setPage]     = useState<Page>("dashboard");
  const [lowStock, setLowStock] = useState(0);
  const [tick,     refresh]     = useRefresh();

  const checkConnection = useCallback(async () => {
    try {
      const rows = await dbGet<{ id: number; stock: number; reorder_level: number }[]>(
        "/products?select=id,stock,reorder_level",
      );
      setLowStock(rows.filter((p) => p.stock <= p.reorder_level).length);
      setReady(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => { void checkConnection(); }, [tick, checkConnection]);

  if (!ready && !err) return <Loader />;
  if (err)            return <Loader error={err} />;

  const fullPad = ["pos", "query"].includes(page) ? "20px 24px" : "24px 28px";

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--cr)" }}>
      <Sidebar page={page} setPage={setPage} lowStock={lowStock} />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Header page={page} lowStock={lowStock} onGoInventory={() => setPage("inventory")} />

        <div style={{ flex: 1, overflow: "auto", padding: fullPad }}>
          {page === "dashboard" && <Dashboard key={tick} reload={tick} />}
          {page === "pos"       && <POS onRefresh={refresh} />}
          {page === "inventory" && <Inventory key={tick} onRefresh={refresh} />}
          {page === "sales"     && <Sales onGoToPOS={() => setPage("pos")} />}
          {page === "expenses"  && <Expenses  key={tick} onRefresh={refresh} />}
          {page === "customers" && <Customers key={tick} onRefresh={refresh} />}
          {page === "suppliers" && <Suppliers key={tick} onRefresh={refresh} />}
          {page === "reports"   && <Reports   key={tick} reload={tick} />}
          {page === "query"     && <QueryPanel />}
          {page === "scanner"   && <Scanner />}               {/* ← NEW */}
        </div>
      </div>
    </div>
  );
}
