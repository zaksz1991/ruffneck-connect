import type { Metadata, Viewport } from "next";
import GlobalHeader from "@/components/GlobalHeader";
import "./globals.css";
import "./messages-whatsapp.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://ruffneck-connect.vercel.app"
  ),

  title: {
    default: "RuffNeck Connect",
    template: "%s | RuffNeck Connect",
  },

  description:
    "Connect with people, discover opportunities, share resources, and turn needs and ideas into action.",

  applicationName: "RuffNeck Connect",

  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "any",
      },
      {
        url: "/ruffneck-connect-symbol.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],

    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },

  openGraph: {
    type: "website",
    url: "https://ruffneck-connect.vercel.app",
    siteName: "RuffNeck Connect",

    title:
      "RuffNeck Connect — Community. Collaboration. Action.",

    description:
      "Find your community, connect with people, share opportunities, and build meaningful relationships.",

    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RuffNeck Connect — Community, Collaboration, Action",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "RuffNeck Connect",

    description:
      "Find your community. Share opportunities. Build together.",

    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1e3a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <GlobalHeader />
        {children}
      </body>
    </html>
  );
}