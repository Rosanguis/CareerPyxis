import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "64px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "32px", color: "#fffdf9", background: "#1f2a44", fontSize: "24px", fontWeight: 800 }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fffdf9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,9 12,7 9,9"/><line x1="12" y1="7" x2="12" y2="17"/><polygon points="12,22 9,15 12,17 15,15"/></svg>
    </div>,
    size,
  );
}
