import type { ReactNode } from "react";

interface ModalProps {
  title:   string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="mo" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mc fade-up">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ fontFamily:"Playfair Display", fontSize:22, color:"var(--gr)" }}>{title}</h3>
          <button onClick={onClose} className="btn bgh bs">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
