import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SWRProvider } from "@/lib/swr-provider";
import { WalletProvider } from "@/lib/wallet/wallet-context";
import { SatsProvider } from "@/lib/sats-context";
import { TopBar } from "@/components/top-bar";
import { Footer } from "@/components/footer";
import { SitePresenceBadge } from "@/components/site-presence";
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
  title: "XCP DEX - Trade Crypto Peer-to-Peer",
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
              {/* Outside the Footer on purpose: the footer is suppressed on the
                  four trading surfaces, which is where someone is most likely to
                  care whether anyone else is around. Fixed rather than in flow so
                  it never reserves space or shifts the page when it connects. */}
              <SitePresenceBadge />
            </WalletProvider>
          </SatsProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
