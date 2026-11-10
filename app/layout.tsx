import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import BackButtonHandler from "@/components/BackButtonHandler";
import Toaster from "@/components/Toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Financedly - Learn Money Skills",
  description: "Master financial literacy through fun, gamified lessons designed for teens",
  applicationName: "Financedly",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

/**
 * Runs before first paint so the saved theme, text size and motion settings apply
 * immediately instead of flashing the defaults.
 */
const applySavedAppearance = `(function(){try{var p=JSON.parse(localStorage.getItem("financedly_user_preferences")||"{}");var r=document.documentElement;var d=p.theme==="dark"||((p.theme||"system")==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d){r.classList.add("dark");r.style.colorScheme="dark"}if(p.textSize==="small"||p.textSize==="large")r.dataset.textSize=p.textSize;if(p.animationsEnabled===false)r.classList.add("no-motion")}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applySavedAppearance }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppProvider>
          {children}
          <Toaster />
          <BackButtonHandler />
        </AppProvider>
      </body>
    </html>
  );
}
