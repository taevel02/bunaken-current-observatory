import type { ReactNode } from "react";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {title: "Bunaken Current Observatory", robots: {index: false, follow: false}};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ko"><body className="m-0">{children}</body></html>;
}
