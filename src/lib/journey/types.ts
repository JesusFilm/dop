import type {
  ShortStudyConfiguration,
  ShortStudyContribution,
} from "@/lib/journey/short-study";
import type { PersonalPrayerConfiguration } from "@/lib/journey/personal-prayer";

export type JourneyModulePayloads = {
  "test-guided-prayer": { prompt: string };
  "short-study": ShortStudyConfiguration;
  "personal-prayer": PersonalPrayerConfiguration;
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

export type PersonalPrayerPresentation = {
  phase: "grouping" | "revealed";
  members: {
    id: string;
    name: string;
    request?: string | null;
  }[];
};

export type PresentedJourneyModule =
  | Extract<JourneyClientModule, { behaviorKey: "test-guided-prayer" }>
  | {
      behaviorKey: "short-study";
      configuration: { translation: string };
      shortStudy: ShortStudyPresentation;
    }
  | {
      behaviorKey: "personal-prayer";
      configuration: PersonalPrayerConfiguration;
      personalPrayer: PersonalPrayerPresentation;
    };
