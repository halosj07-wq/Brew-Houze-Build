import type { Metadata } from "next";
import "./globals.css";
import InputGuard from "./input-guard";

// The browser tab's name (named like the system portal's, "Brew Houze · System Portal").
export const metadata: Metadata = {
  title: "Brew Houze · Staff Portal",
  description: "Brew Houze staff portal: point of sale, queue, deliveries and shifts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<InputGuard /></body>
    </html>
  );
}
