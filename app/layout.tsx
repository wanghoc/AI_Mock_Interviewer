import type { Metadata } from "next";
import { Sora, Space_Grotesk } from "next/font/google";
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

export const metadata: Metadata = {
  title: "AI Mock Interviewer",
  description: "Liquid glass interface for AI-powered mock interview experience",
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
      <body className="min-h-full bg-slate-950 text-slate-100">
        <div className="relative min-h-screen overflow-x-hidden">
          <MeshBackground />
          <FloatingHeader />
          <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-28 sm:px-8 sm:pt-32">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
