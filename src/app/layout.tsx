import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Our Cozy Diary",
  description: "A minimalist shared diary for two.",
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
