import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReflexDash — Quick Reflex Games",
  description:
    "Tap-the-Target & Color Match: 30-second HTML5 reflex challenges for Telegram.",
  keywords: [
    "Telegram Game",
    "HTML5 Game",
    "Reflex Game",
    "Tap the Target",
    "Color Match",
  ],
  authors: [{ name: "ReflexDash" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ReflexDash — Quick Reflex Games",
    description: "30-second HTML5 reflex challenges. Beat your best, challenge a friend.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ReflexDash",
    description: "30-second HTML5 reflex challenges.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0f",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        style={{ overscrollBehavior: "none" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
