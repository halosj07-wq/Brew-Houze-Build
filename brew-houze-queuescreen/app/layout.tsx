import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brew Houze Queue",
  description: "Brew Houze customer queue display",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
