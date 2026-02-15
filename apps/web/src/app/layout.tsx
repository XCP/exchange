import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SWRProvider } from "@/lib/swr-provider";
import { TopBar } from "@/components/top-bar";
import { Footer } from "@/components/footer";
import { FathomAnalytics } from "./fathom";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XCP DEX — Trade Bitcoin Assets",
  description:
    "Peer-to-peer trading on the Counterparty Decentralized Exchange. No counterparty risk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}
      >
        <FathomAnalytics />
        <SWRProvider>
          <TopBar />
          {children}
          <Footer />
        </SWRProvider>
      </body>
    </html>
  );
}
