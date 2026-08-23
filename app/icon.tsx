import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <svg width="64" height="64" viewBox="0 0 80 80" role="img" aria-label="职途罗盘">
      <circle cx="40" cy="40" r="36" fill="#000000" />
      <path d="M40 13L53 59L40 51L27 59L40 13Z" fill="#FFFFFF" />
    </svg>,
    size,
  );
}
