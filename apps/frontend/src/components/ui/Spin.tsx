interface SpinProps { dark?: boolean; size?: number; }

export function Spin({ dark = false, size = 16 }: SpinProps) {
  return (
    <div style={{
      width:       size,
      height:      size,
      border:      `2px solid ${dark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.3)"}`,
      borderTop:   `2px solid ${dark ? "#000" : "#fff"}`,
      borderRadius: "50%",
      animation:   "spin .7s linear infinite",
      flexShrink:  0,
    }} />
  );
}
