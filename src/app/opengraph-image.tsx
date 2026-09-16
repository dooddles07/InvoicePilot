import { ImageResponse } from "next/og";

import { SITE } from "@/lib/marketing";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The dark surface from globals.css, resolved to hex: ImageResponse cannot
 *  read CSS variables or oklch(). */
const INK = "#0B1120";
const CARD = "#141C2E";
const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const BRAND = "#6366F1";
const SUCCESS = "#34D399";

const FIGURES = [
  { label: "Outstanding", value: "$412,800", tone: TEXT },
  { label: "Overdue", value: "$96,400", tone: "#FBBF24" },
  { label: "Collected this month", value: "$188,250", tone: SUCCESS },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: 72,
          color: TEXT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: BRAND,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            IP
          </div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{SITE.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>
            {SITE.tagline}
          </div>
          <div style={{ fontSize: 30, color: MUTED, maxWidth: 820 }}>
            Accounts receivable automation — reminders, collections pipeline and
            cash-flow forecasting.
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {FIGURES.map((figure) => (
            <div
              key={figure.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                background: CARD,
                borderRadius: 18,
                padding: "22px 28px",
                minWidth: 300,
              }}
            >
              <div style={{ fontSize: 22, color: MUTED }}>{figure.label}</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: figure.tone }}>
                {figure.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
