import type { Page } from "@/components/layout/Sidebar";

interface HeaderProps {
  page:     Page;
  lowStock: number;
  onGoInventory: () => void;
}

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "Dashboard",
  pos:       "Point of Sale",
  inventory: "Inventory",
  expenses:  "Expenses",
  suppliers: "Suppliers",
  reports:   "Reports",
  query:     "Query Shop Data",
};

export function Header({ page, lowStock, onGoInventory }: HeaderProps) {
  return (
    <div style={{ background:"var(--wh)",padding:"14px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid var(--crd)",boxShadow:"0 2px 10px rgba(0,0,0,0.04)" }}>
      <h1 style={{ fontFamily:"Playfair Display",fontSize:18,color:"var(--gr)" }}>
        {PAGE_TITLES[page]}
      </h1>
      <div style={{ display:"flex",alignItems:"center",gap:12 }}>
        {lowStock > 0 && (
          <div
            onClick={onGoInventory}
            style={{ display:"flex",alignItems:"center",gap:6,background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:8,padding:"5px 12px",cursor:"pointer" }}
          >
            <span style={{ fontSize:14 }}>⚠️</span>
            <span style={{ fontSize:12,color:"var(--rd)",fontWeight:600 }}>{lowStock} low stock</span>
          </div>
        )}
        <div style={{ fontSize:12,color:"var(--mu)",background:"var(--cr)",padding:"5px 12px",borderRadius:8 }}>
          {new Date().toLocaleDateString("en-GH", { day:"numeric", month:"short", year:"numeric" })}
        </div>
      </div>
    </div>
  );
}
