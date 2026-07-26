import type {
  JourneyBehaviorKey,
  JourneyClientModule,
  JourneyModuleDefinition,
} from "@/lib/journey/types";
import { validateShortStudyConfiguration } from "@/lib/journey/short-study";

const productionModuleKeys: readonly JourneyBehaviorKey[] = ["short-study"];

const moduleDefinitions: {
  [Key in JourneyBehaviorKey]: JourneyModuleDefinition<Key>;
} = {
  "test-guided-prayer": {
    validateConfiguration(value) {
      const configuration =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      if (!configuration || typeof configuration.prompt !== "string") {
        return undefined;
      }
      return { prompt: configuration.prompt };
    },
  },
  "short-study": {
    validateConfiguration: validateShortStudyConfiguration,
  },
};

function testModulesEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.JOURNEY_TEST_MODULES === "enabled"
  );
}

export function getJourneyModule(
  behaviorKey: string,
): JourneyModuleDefinition<JourneyBehaviorKey> | undefined {
  const key = behaviorKey as JourneyBehaviorKey;
  if (
    !productionModuleKeys.includes(key) &&
    (!testModulesEnabled() || key !== "test-guided-prayer")
  ) {
    return undefined;
  }
  return moduleDefinitions[key];
}

export function validateJourneyModule(
  behaviorKey: string,
  configuration: unknown,
): JourneyClientModule {
  const definition = getJourneyModule(behaviorKey);
  if (!definition) {
    throw new Error(`Unknown journey module: ${behaviorKey}`);
  }
  const validated = definition.validateConfiguration(configuration);
  if (!validated) {
    throw new Error(`Invalid configuration for journey module: ${behaviorKey}`);
  }
  return {
    behaviorKey: behaviorKey as JourneyBehaviorKey,
    configuration: validated,
  } as JourneyClientModule;
}
