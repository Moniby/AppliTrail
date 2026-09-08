import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APPLITRAIL_PUBLIC_URL || "https://applitrail.com"),
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
  const isStaging = process.env.APPLITRAIL_ENVIRONMENT === "staging";

  return (
    <html lang="en">
      <body className={isStaging ? "staging-environment" : undefined}>
        {isStaging ? (
          <div className="environment-banner" role="status">
            <strong>STAGING</strong>
            <span>Private test environment — no production customer data</span>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
