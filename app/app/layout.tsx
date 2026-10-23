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

export const metadata: Metadata = {
  title: "MicroEChef — Kitchen & Good Company",
  description:
    "A little kitchen, a warm welcome, and your kind of food. Explore the MicroEChef kitchen and find your next favourite table.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
