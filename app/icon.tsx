import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "64px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "32px", color: "#fffdf9", background: "#1f2a44", fontSize: "22px", fontWeight: 800 }}>
      北
    </div>,
    size,
  );
}
