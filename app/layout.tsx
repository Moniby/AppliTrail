import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://careerflow-tobi-applications.tobimonilari.chatgpt.site"),
  title: "AppliTrail | Job Application Studio",
  description: "Track applications and prepare tailored career materials.",
  icons: {
    icon: "/applitrail-logo.png",
    shortcut: "/applitrail-logo.png",
    apple: "/applitrail-logo.png",
  },
  openGraph: {
    title: "AppliTrail | Job Application Studio",
    description: "Track opportunities, tailor evidence-based career materials, and prepare for every interview stage.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AppliTrail — Track. Tailor. Prepare." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AppliTrail | Job Application Studio",
    description: "Track opportunities, tailor evidence-based career materials, and prepare for every interview stage.",
    images: ["/og.png"],
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
