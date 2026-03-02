import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SWRProvider } from "@/lib/swr-provider";
import { WalletProvider } from "@/lib/wallet/wallet-context";
import { SatsProvider } from "@/lib/sats-context";
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
  metadataBase: new URL("https://xcpdex.com"),
  title: "XCP DEX - Trade Cryptoassets Peer-to-Peer",
  description:
    "Peer-to-peer trading on the Counterparty Decentralized Exchange. No counterparty risk.",
  openGraph: {
    siteName: "XCP DEX",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
  },
  robots: { index: true, follow: true },
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
          <SatsProvider>
            <WalletProvider>
              <TopBar />
              {children}
              <Footer />
            </WalletProvider>
          </SatsProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
