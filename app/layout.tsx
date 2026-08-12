import "./globals.css";
import "leaflet/dist/leaflet.css";
import { AuthProvider } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";

export const metadata = { title: "SIRA Web", description: "SIRA Next.js web replica" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider><AppShell>{children}</AppShell></AuthProvider></body></html>;
}
