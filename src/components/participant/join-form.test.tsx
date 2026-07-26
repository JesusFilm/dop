// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JoinForm } from "@/components/participant/join-form";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("JoinForm configuration", () => {
  it("prefills an editable name and posts to the supplied endpoint", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        state: "LOBBY",
        revision: 1,
        participantCount: 1,
        participant: { id: "participant-1", name: "Participant One" },
      }),
    } as unknown as Response);
    const onJoined = vi.fn();

    render(
      <JoinForm
        onJoined={onJoined}
        initialName="Participant 1"
        endpoint="/api/participant?testerSession=1"
      />,
    );

    const name = screen.getByLabelText("Your name");
    expect(name).toHaveProperty("value", "Participant 1");
    fireEvent.change(name, { target: { value: "Participant One" } });
    fireEvent.change(screen.getByLabelText("Prayer request"), {
      target: { value: "Please pray for courage." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join Day of Prayer" }));

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "/api/participant?testerSession=1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          displayName: "Participant One",
          prayerRequest: "Please pray for courage.",
        }),
      }),
    );
    await vi.waitFor(() => expect(onJoined).toHaveBeenCalled());
  });

  it("requires a personal prayer request before joining", () => {
    render(<JoinForm onJoined={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Participant One" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join Day of Prayer" }));

    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(
      screen.getByText("Please share something your group can pray for."),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Prayer request").getAttribute("aria-invalid"),
    ).toBe("true");
  });
});
