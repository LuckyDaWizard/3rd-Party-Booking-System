import type { Metadata } from "next";
import { Roboto, Mulish } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const mulish = Mulish({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: "900",
});

export const metadata: Metadata = {
  title: "CareFirst Third Party Booking",
  description: "Third party booking system for CareFirst clients and their units",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${mulish.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
