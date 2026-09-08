import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteNav from "./components/SiteNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FutScout — scout para Career Mode",
  description: "Explore jogadores, clubes e ligas; compare atributos e salve seus favoritos no FutScout.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skipLink">Pular para o conteúdo</a>
        <div className="siteShell">
          <SiteNav />
          <div className="siteContent" id="main-content" tabIndex={-1}>{children}</div>
        </div>
      </body>
    </html>
  );
}
