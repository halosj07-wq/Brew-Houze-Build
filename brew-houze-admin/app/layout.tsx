import type { Metadata } from "next";
import "./globals.css";

// The browser tab's name (named like the system portal's, "Brew Houze · System Portal").
export const metadata: Metadata = {
  title: "Brew Houze · Admin Portal",
  description: "Brew Houze admin portal: sales, inventory, menu, staff and settings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}