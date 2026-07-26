"use client";

import Link from "next/link";
import {
  FlaskConical,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";

type AdminShellProps = {
  active: "dashboard" | "settings" | "tester";
  children: React.ReactNode;
};

const navigation = [
  {
    id: "dashboard" as const,
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "settings" as const,
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
  },
  {
    id: "tester" as const,
    href: "/admin/tester",
    label: "Tester",
    icon: FlaskConical,
  },
];

const sidebarPreferenceKey = "admin-sidebar-collapsed";

export function AdminShell({ active, children }: AdminShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);

  const closeMobileNavigation = useCallback((restoreFocus = true) => {
    setIsMobileOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(sidebarPreferenceKey) === "true");
  }, []);

  useEffect(() => {
    if (!isMobileOpen) return;

    mobileCloseButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileNavigation();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeMobileNavigation, isMobileOpen]);

  const updateCollapsed = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    localStorage.setItem(sidebarPreferenceKey, String(collapsed));
  };

  const navigationLinks = (compact = false) =>
    navigation.map((item) => {
      const Icon = item.icon;
      const isActive = item.id === active;

      return (
        <Link
          key={item.id}
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          aria-label={compact ? item.label : undefined}
          title={compact ? item.label : undefined}
          onClick={() => closeMobileNavigation()}
          className={`inline-flex min-h-12 items-center rounded-2xl text-sm font-semibold transition ${
            compact ? "justify-center px-3" : "gap-3 px-4"
          } ${
            isActive
              ? "bg-white text-primary shadow-card"
              : "text-ink-muted hover:bg-white/70 hover:text-ink"
          }`}
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          {!compact && item.label}
        </Link>
      );
    });

  return (
    <div
      className={`min-h-dvh transition-[grid-template-columns] duration-200 lg:grid ${
        isCollapsed
          ? "lg:grid-cols-[6rem_minmax(0,1fr)]"
          : "lg:grid-cols-[18rem_minmax(0,1fr)]"
      }`}
    >
      <header
        inert={isMobileOpen}
        className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b border-outline/40 bg-surface-subtle/95 px-5 backdrop-blur lg:hidden"
      >
        <button
          ref={mobileMenuButtonRef}
          type="button"
          aria-label="Open navigation"
          aria-controls="mobile-admin-navigation"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen(true)}
          className="grid size-11 shrink-0 place-items-center rounded-2xl text-ink-muted transition hover:bg-white hover:text-ink"
        >
          <Menu aria-hidden="true" className="size-6" />
        </button>
        <BrandMark href="/admin" />
      </header>

      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => closeMobileNavigation(false)}
          className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        id="mobile-admin-navigation"
        role={isMobileOpen ? "dialog" : undefined}
        aria-label="Admin navigation menu"
        aria-modal={isMobileOpen ? true : undefined}
        aria-hidden={!isMobileOpen}
        inert={!isMobileOpen}
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-outline/40 bg-surface-subtle px-5 py-5 shadow-card transition-transform duration-200 lg:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <BrandMark href="/admin" />
          <button
            ref={mobileCloseButtonRef}
            type="button"
            aria-label="Close navigation"
            onClick={() => closeMobileNavigation()}
            className="grid size-11 shrink-0 place-items-center rounded-2xl text-ink-muted transition hover:bg-white hover:text-ink"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <nav
          aria-label="Mobile admin navigation"
          className="mt-8 flex flex-col gap-2"
        >
          {navigationLinks()}
        </nav>
      </aside>

      <aside
        className={`hidden border-r border-outline/40 bg-surface-subtle py-8 transition-[padding] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col ${
          isCollapsed ? "px-5" : "px-7"
        }`}
      >
        <div
          className={`flex items-center ${
            isCollapsed ? "justify-center" : "justify-start"
          }`}
        >
          <BrandMark href="/admin" compact={isCollapsed} />
        </div>

        {!isCollapsed && (
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Organizer portal
          </p>
        )}

        <nav aria-label="Admin navigation" className="mt-8 flex flex-col gap-2">
          {navigationLinks(isCollapsed)}
        </nav>

        <button
          type="button"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
          onClick={() => updateCollapsed(!isCollapsed)}
          className={`mt-auto grid min-h-12 rounded-2xl text-ink-muted transition hover:bg-white hover:text-ink ${
            isCollapsed
              ? "place-items-center"
              : "items-center justify-items-start px-4"
          }`}
        >
          {isCollapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-5" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-5" />
          )}
        </button>
      </aside>

      <main
        inert={isMobileOpen}
        className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-10 xl:px-16"
      >
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
