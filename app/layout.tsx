import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

export const metadata: Metadata = {
  title: "PalmPay — Biometric Vein Payment Platform",
  description: "Next-gen cardless checkout using palm vein pattern AI recognition.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100 font-sans antialiased min-h-screen selection:bg-primary selection:text-background overflow-x-hidden">
        <LanguageProvider>
          <AnimatedBackground />
          <Navbar />
          <main className="relative z-10 pt-20 pb-12 min-h-[calc(100vh-80px)] flex flex-col justify-center">
            {children}
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
