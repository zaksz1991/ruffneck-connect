import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RuffNeck Connect",
    template: "%s | RuffNeck Connect",
  },
  description:
    "Connect with people who can help you turn needs, opportunities, and ideas into action.",
  applicationName: "RuffNeck Connect",
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
      <body>{children}</body>
    </html>
  );
}