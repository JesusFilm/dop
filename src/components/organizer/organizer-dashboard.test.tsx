import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminSettings } from "./admin-settings";
import { OrganizerDashboard } from "./organizer-dashboard";
import type { OrganizerSnapshot } from "@/lib/gathering/types";

const snapshot: OrganizerSnapshot = {
  phase: "FORMING",
  revision: 1,
  participantCount: 2,
  prayerRequestCount: 1,
  capacitySufficient: true,
  journey: {
    available: true,
    name: "July prayer journey",
  },
  rooms: [
    {
      id: "room-1",
      name: "Boardroom",
      directions: "Upstairs",
      maxCapacity: 8,
      memberCount: 2,
      leaderName: "Ana",
      journeyState: "unavailable",
      members: [
        { id: "participant-1", name: "Ana", isLeader: true },
        { id: "participant-2", name: "Ben", isLeader: false },
      ],
    },
  ],
};

describe("OrganizerDashboard", () => {
  it("renders the dashboard navigation and visible room rosters", () => {
    const html = renderToStaticMarkup(
      <OrganizerDashboard initialSnapshot={snapshot} />,
    );

    expect(html).toContain('href="/admin"');
    expect(html).toContain(">Dashboard</a>");
    expect(html).toContain('href="/admin/settings"');
    expect(html).toContain(">Settings</a>");
    expect(html).toContain('aria-label="Collapse sidebar"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-controls="mobile-admin-navigation"');
    expect(html).toContain(">2</strong>");
    expect(html).toContain(">Participants joined</p>");
    expect(html).toContain(">Prayer requests</p>");
    expect(html).toContain(">Rooms in use</p>");
    expect(html).toContain(">Rooms at capacity</p>");
    expect(html).toContain("Boardroom");
    expect(html).toContain("Ana");
    expect(html).toContain("Ben");
    expect(html).toContain('aria-label="Leader"');
    expect(html).toContain("lucide-star");
    expect(html).not.toContain("lucide-user-round");
    expect(html).not.toContain("Leader: <strong");
    expect(html).toContain(">Reveal assignments<");
    expect(html).not.toContain(">Reveal room assignments<");
    expect(html).not.toContain(">2 participants</p>");
    expect(html).not.toContain("<details");
  });

  it("shows journey progress after reveal without changing leader identity", () => {
    const html = renderToStaticMarkup(
      <OrganizerDashboard
        initialSnapshot={{
          ...snapshot,
          phase: "ASSIGNED",
          rooms: [
            {
              ...snapshot.rooms[0],
              leaderName: "Ana",
              journeyState: "gathering",
              members: [
                {
                  ...snapshot.rooms[0].members[0],
                  isLeader: true,
                },
                snapshot.rooms[0].members[1],
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Journey: gathering");
    expect(html).toContain('aria-label="Leader"');
    expect(html).toContain("lucide-star");
    expect(html).toContain("Assignments revealed");
  });

  it("shows unlimited room membership against the total joined count", () => {
    const html = renderToStaticMarkup(
      <OrganizerDashboard
        initialSnapshot={{
          ...snapshot,
          rooms: [
            {
              ...snapshot.rooms[0],
              name: "Auditorium",
              directions: "Foyer",
              maxCapacity: null,
              memberCount: 1,
              members: [snapshot.rooms[0].members[0]],
            },
          ],
        }}
      />,
    );

    expect(html).toContain(">1 of 2 · Foyer</p>");
    expect(html).not.toContain("Unlimited capacity");
    expect(html).not.toContain(">1 participant</p>");
  });

  it("removes the superseded dashboard labels and privacy copy", () => {
    const html = renderToStaticMarkup(
      <OrganizerDashboard initialSnapshot={snapshot} />,
    );

    expect(html).not.toContain("Waiting for reveal");
    expect(html).not.toContain("Room handoff");
    expect(html).not.toContain("Physical spaces");
    expect(html).not.toContain(">Rooms</h2>");
    expect(html).not.toContain("total</span>");
    expect(html).not.toContain("hidden assignments are ready to reveal");
    expect(html).not.toContain(
      "Prayer requests are collected privately and never appear here.",
    );
    expect(html).not.toContain("Reset gathering");
  });

  it("places the reset action on the Settings page", () => {
    const html = renderToStaticMarkup(<AdminSettings />);

    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Settings</a>");
    expect(html).toContain("Reset gathering");
    expect(html).toContain("Seeded room configuration will be preserved");
    expect(html).toContain("reusable journey configuration");
  });
});
