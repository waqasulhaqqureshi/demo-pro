import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sawt — Arabic Voice Agent",
  description:
    "Talk with a real-time voice companion in natural Gulf, Egyptian, Levantine, Iraqi, or Moroccan Arabic, or American English.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
