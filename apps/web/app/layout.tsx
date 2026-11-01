import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Кириллица для интерфейса, latin-ext для латышских названий товаров.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "BestPrice", template: "%s — BestPrice" },
  description: "Акции магазинов Латвии в одном месте",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#14201a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="bg-background focus-visible:ring-ring/50 sr-only rounded-lg px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-3"
        >
          К содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
