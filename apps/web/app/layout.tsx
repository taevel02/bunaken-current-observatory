import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html><body className="m-0">{children}</body></html>;
}
