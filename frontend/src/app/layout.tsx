import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KernelLens AI — Intelligent Linux Kernel Log Diagnostics",
  description:
    "LLM-driven root cause analysis for Linux kernel and system logs. Automated anomaly detection, event correlation, and troubleshooting guidance powered by trained ML models and Gemini.",
  keywords: [
    "KernelLens",
    "Linux",
    "kernel logs",
    "root cause analysis",
    "LLM",
    "anomaly detection",
    "machine learning",
    "incident response",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full bg-cream-light text-kl-black antialiased" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
