import type { Metadata } from "next";
import { Sora, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import { FloatingHeader } from "@/components/ui/floating-header";
import { MeshBackground } from "@/components/ui/mesh-background";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const metadataBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "AI Mock Interviewer",
  description:
    "Biến áp lực thành tự tin: Trợ lý AI cá nhân giúp bạn phân tích CV và luyện tập phỏng vấn như một chuyên gia.",
  icons: {
    icon: "/brand-mark.svg",
    shortcut: "/brand-mark.svg",
    apple: "/brand-mark.svg",
  },
  openGraph: {
    title: "AI Mock Interviewer",
    description:
      "Biến áp lực thành tự tin: Trợ lý AI cá nhân giúp bạn phân tích CV và luyện tập phỏng vấn như một chuyên gia.",
    type: "website",
    locale: "vi_VN",
    images: [
      {
        url: "/og-preview.svg",
        width: 1200,
        height: 630,
        alt: "AI Mock Interviewer - CV analysis and interview practice",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Mock Interviewer",
    description:
      "Biến áp lực thành tự tin: Trợ lý AI cá nhân giúp bạn phân tích CV và luyện tập phỏng vấn như một chuyên gia.",
    images: ["/og-preview.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${sora.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900">
        <div className="relative min-h-screen overflow-x-hidden">
          <MeshBackground />
          <Suspense fallback={null}>
            <FloatingHeader />
          </Suspense>
          <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-28 sm:px-8 sm:pt-32">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
