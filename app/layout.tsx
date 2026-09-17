import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Decision Guardrail",
  description:
    "A reliability and evaluation layer for ops/procurement decision agents, backed by Moss for sub-10ms policy retrieval.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
