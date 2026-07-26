export type JourneyModulePayloads = {
  "test-guided-prayer": { prompt: string };
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
