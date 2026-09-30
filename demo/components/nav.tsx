"use client";
import { Briefcase, CalendarCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ openJobs, pool }: { openJobs: number; pool: number }) {
  const path = usePathname();
  const links = [
    { href: "/", label: "Today", Icon: CalendarCheck, on: path === "/" },
    { href: "/jobs", label: "Open jobs", Icon: Briefcase, on: path.startsWith("/jobs"), count: openJobs },
    { href: "/pool", label: "Talent pool", Icon: Users, on: path.startsWith("/pool") || path.startsWith("/candidates"), count: pool },
  ];
  return (
    <nav className="nav">
      {links.map(({ href, label, Icon, on, count }) => (
        <Link key={href} href={href} className={on ? "on" : ""}>
          <Icon size={15} strokeWidth={2} />
          {label}
          {count != null && <span className="count">{count}</span>}
        </Link>
      ))}
    </nav>
  );
}
