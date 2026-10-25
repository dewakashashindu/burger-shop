import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./motion.css";
import "./footer.css";
import "./story.css";
import "./menu.css";
import "./auth.css";
import "./reserve.css";
import "./motion-site.css";
import "./contact.css";
import "./hero-video-card.css";

export const metadata: Metadata = {
  title: "Mila Mirissa — Kitchen & Good Company",
  description:
    "A little kitchen, a warm welcome, and your kind of food. Explore the Mila Mirissa kitchen and find your next favourite table.",
  applicationName: "Mila Mirissa",
  // The logo also sits in the browser tab. The version suffix makes browsers
  // replace an older cached icon straight away.
  icons: {
    // The oval mark, not the whole lock-up — the name is unreadable at 16 px,
    // so the tab carries the picture and the title carries the name.
    icon: [
      { url: "/favicon.ico?v=4", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { url: "/icon.png?v=4", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico?v=4",
    apple: [{ url: "/apple-icon.png?v=4", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Mila Mirissa", statusBarStyle: "default" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link
          href="https://db.onlinewebfonts.com/c/1cd1e7d71e048159076fd90b39846902?family=Open+Sauce+One"
          rel="stylesheet"
        />
        <link
          href="https://db.onlinewebfonts.com/c/42acf9aa4a6dc2f2886a3f682e337ead?family=Open+Sauce+One+Bold"
          rel="stylesheet"
        />
      </head>
      <body>
        <noscript>
          <div className="no-script-note">
            Menu filters, dish details and account forms need JavaScript. You can
            still explore the restaurant below.
            <Link href="/#kitchen">Our kitchen</Link>
            <Link href="/our-story">Our story</Link>
            <Link href="/menu">The menu</Link>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
