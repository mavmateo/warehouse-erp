import type { ReactNode } from "react";

interface FieldProps { label: string; children: ReactNode; }

export function Field({ label, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600,
        color: "var(--mu)", marginBottom: 5,
        textTransform: "uppercase", letterSpacing: ".5px",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}
