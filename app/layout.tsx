import "./globals.css";
import TopNav from "@/components/TopNav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthPage =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/login");

  return (
    <html lang="en">
      <body>
        {!isAuthPage && <TopNav />}
        {children}
      </body>
    </html>
  );
}