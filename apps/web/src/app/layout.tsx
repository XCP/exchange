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
      <head>
        {/* Every page's data comes from origins the document never references,
            so the browser cannot discover them until React has hydrated and a
            hook fires — measured at 1560ms on the homepage, at which point each
            one pays a cold DNS + TCP + TLS handshake before its first byte.
            Opening the sockets while the JS is still downloading takes that
            handshake off the critical path.

            Only origins used on EVERY page belong here: a preconnect the page
            does not use holds a socket open for ten seconds for nothing. These
            four are all reached from the root layout — the DEX API everywhere,
            mempool.space and api.xcp.io from TopBar's useNetworkInfo, and
            Counterparty from WalletProvider's balance calls. api.xcp.fun is
            homepage-only, so it gets the cheaper DNS-only hint. */}
        <link rel="preconnect" href="https://api.xcpdex.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://mempool.space" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.xcp.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.counterparty.io:4000" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.xcp.fun" />
      </head>
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
