import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AppliFlow | Job Application Studio",
  description: "Track applications and prepare tailored career materials.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
