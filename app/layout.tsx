import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://careerflow-tobi-applications.tobimonilari.chatgpt.site"),
  title: "applitrail | Job Application Studio",
  description: "Track applications and prepare tailored career materials.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "applitrail | Job Application Studio",
    description: "Track opportunities, tailor evidence-based career materials, and prepare for every interview stage.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "applitrail — Track. Tailor. Prepare." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "applitrail | Job Application Studio",
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
