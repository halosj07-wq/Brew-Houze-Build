import "./globals.css";
import InputGuard from "./input-guard";

export const metadata = {
  title: "Brew Houze · Online Menu",
  description: "Browse the Brew Houze menu from your table.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<InputGuard /></body>
    </html>
  );
}
