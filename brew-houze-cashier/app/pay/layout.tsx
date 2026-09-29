import type { Metadata } from "next";

// The GCash pages customers open on their phones (the counter sign and after paying) are named for
// them, not as the staff portal.
export const metadata: Metadata = {
  title: "Brew Houze · GCash Payment",
  description: "Pay for your Brew Houze order with GCash.",
};

export default function PayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
