import "./globals.css";

export const metadata = {
  title: "DukanDarpan",
  description: "Local-pack rank tracking — SerpApi India Hackathon",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
