"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const nav = [
  ["/map", "Map", "⌖"],
  ["/dashboard", "Dashboard", "▦"],
  ["/incidents", "Incidents", "☷"],
  ["/report", "Report", "+"],
  ["/alerts", "Alerts", "◉"],
  ["/more", "More", "•••"],
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const publicPage = pathname === "/auth" || pathname === "/signup";

  useEffect(() => {
    if (!loading && !user && !publicPage) router.replace("/auth");
  }, [loading, user, publicPage, router]);

  if (publicPage) return <>{children}</>;
  if (loading || !user) return <div className="center-screen"><div className="spinner"/><p>Loading SIRA...</p></div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/sira-icon.png" alt="SIRA" />
          <div><strong>SIRA</strong><span>Web Console</span></div>
        </div>
        <nav>
          {nav.map(([href, label, icon]) => {
            const active = pathname === href || (href === "/incidents" && pathname.startsWith("/incident"));
            return <Link key={href} href={href} className={active ? "nav-item active" : "nav-item"}><span className="nav-icon">{icon}</span>{label}</Link>;
          })}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{(profile?.full_name || user.email || "U").slice(0,1).toUpperCase()}</div>
          <div><strong>{profile?.full_name || "SIRA User"}</strong><span>{profile?.job_title || profile?.role || user.email}</span></div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav">
        {nav.map(([href, label, icon]) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><span>{icon}</span><small>{label}</small></Link>)}
      </nav>
    </div>
  );
}
