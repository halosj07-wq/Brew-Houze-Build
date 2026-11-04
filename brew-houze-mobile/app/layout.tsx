import "./globals.css";
import DialogAlerts from "./dialog-alerts";
import InputGuard from "./input-guard";
import KeyboardDone from "./keyboard-done";

export const metadata = {
  title: "Brew Houze · Online Menu",
  description: "Browse the Brew Houze menu from your table.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<InputGuard /><KeyboardDone /><DialogAlerts /></body>
    </html>
  );
}
