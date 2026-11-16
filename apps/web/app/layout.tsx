import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Sofia_Sans } from "next/font/google";
import "./globals.css";

// Кириллица для интерфейса, latin-ext для латышских названий товаров.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

// Заголовки: те же subsets, что у Inter (русский интерфейс, латышские названия в заголовках товаров).
const sofia = Sofia_Sans({
  variable: "--font-sofia",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: "600", // заголовки только font-semibold и font-medium (оба дают 600), 700 не нужен
});

// Цены: только цифры, запятая и «€», кириллица не нужна. Переменный шрифт: обычная цена 600/700, старая цена 400.
const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
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
    <html lang="ru" className={`${inter.variable} ${sofia.variable} ${mono.variable} h-full antialiased`}>
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
