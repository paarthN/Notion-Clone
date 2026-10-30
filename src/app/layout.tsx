import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { isPotionConfigured } from "@/lib/potion";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Potion",
  description: "A shared workspace for nested pages.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const configured = isPotionConfigured();
  const app = (
    <ThemeProvider>
      {configured ? (
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/app"
          signUpFallbackRedirectUrl="/app"
          afterSignOutUrl="/sign-in"
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      ) : (
        children
      )}
      <Toaster />
    </ThemeProvider>
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{app}</body>
    </html>
  );
}
