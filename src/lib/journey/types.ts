import type {
  ShortStudyConfiguration,
  ShortStudyContribution,
} from "@/lib/journey/short-study";
import type {
  MinistryPrayerBundle,
  MinistryPrayerConfiguration,
} from "@/lib/journey/ministry-prayer";

export type JourneyModulePayloads = {
  "test-guided-prayer": { prompt: string };
  "short-study": ShortStudyConfiguration;
  "ministry-prayer": MinistryPrayerConfiguration;
};

export type JourneyBehaviorKey = keyof JourneyModulePayloads;

export type JourneyClientModule = {
  [Key in JourneyBehaviorKey]: {
    behaviorKey: Key;
    configuration: JourneyModulePayloads[Key];
  };
}[JourneyBehaviorKey];

export type JourneyModuleDefinition<Key extends JourneyBehaviorKey> = {
  validateConfiguration: (
    value: unknown,
  ) => JourneyModulePayloads[Key] | undefined;
};

export type ValidJourneyModule = JourneyClientModule & {
  id: string;
  position: number;
  title: string;
  recommendedSeconds: number;
};

export type ValidJourney = {
  id: string;
  name: string;
  modules: ValidJourneyModule[];
};

export type ShortStudyPresentation = {
  contribution: ShortStudyContribution;
  contributionNumber: number;
  contributionCount: number;
  reader: { id: string; name: string } | null;
  viewerRole: "leader" | "reader" | "member";
  canReassign: boolean;
};

export type MinistryPrayerPresentation = {
  bundle: MinistryPrayerBundle;
  bundleNumber: number;
  bundleCount: number;
  assignees: { id: string; name: string }[];
  viewerRole: "leader" | "assigned" | "member";
  canReassign: boolean;
  bundleStartedAt: string;
  bundleRecommendedSeconds: number;
};

export type PresentedJourneyModule =
  | Extract<JourneyClientModule, { behaviorKey: "test-guided-prayer" }>
  | {
      behaviorKey: "short-study";
      configuration: { translation: string };
      shortStudy: ShortStudyPresentation;
    }
  | {
      behaviorKey: "ministry-prayer";
      configuration: { bundlesPerRoom: number };
      ministryPrayer: MinistryPrayerPresentation;
    };
