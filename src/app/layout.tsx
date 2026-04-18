import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TV Buzz — Reddit Television Sentiment Tracker",
  description: "Track what Reddit's r/television community is watching. Discover trending TV shows with weekly sentiment scores from real discussions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <div className="header-inner">
            <a href="/" className="logo">
              <span className="logo-icon">📺</span>
              TV Buzz
            </a>
            <nav>
              <ul className="nav-links">
                <li><a href="/">Dashboard</a></li>
                <li><a href="/shows">All Shows</a></li>
                <li><a href="/admin">Admin</a></li>
              </ul>
            </nav>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>

        <footer className="app-footer">
          <p>
            <a href="https://thetvdb.com/subscribe" target="_blank" rel="noopener noreferrer">
              Metadata provided by TheTVDB. Please consider adding missing information or subscribing.
            </a>
          </p>
          <p style={{ marginTop: 8 }}>
            Data sourced from <a href="https://old.reddit.com/r/television/" target="_blank" rel="noopener noreferrer">r/television</a> weekly recommendation threads.
          </p>
        </footer>
      </body>
    </html>
  );
}
