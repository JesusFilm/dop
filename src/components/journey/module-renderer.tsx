import type { JourneyClientModule } from "@/lib/journey/types";

export function ModuleRenderer({ module }: { module: JourneyClientModule }) {
  switch (module.behaviorKey) {
    case "test-guided-prayer":
      if (process.env.NODE_ENV !== "production") {
        return (
          <p className="text-xl leading-8 text-ink">
            {module.configuration.prompt}
          </p>
        );
      }
  }

  return (
    <p role="alert" className="text-lg text-danger">
      This activity is unavailable. Please ask the organizer for help.
    </p>
  );
}
