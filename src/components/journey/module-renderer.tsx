import {
  BadgeCheck,
  BookOpenText,
  HeartHandshake,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import { Countdown } from "@/components/journey/countdown";
import type {
  MinistryPrayerPresentation,
  PresentedJourneyModule,
} from "@/lib/journey/types";

const nameList = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

function ministryPrayerInstruction(prayer: MinistryPrayerPresentation): string {
  const names = nameList.format(prayer.assignees.map(({ name }) => name));
  if (prayer.viewerRole === "assigned") {
    return "You’re invited to pray for this bundle.";
  }
  if (prayer.viewerRole === "leader") {
    return names
      ? `Invite ${names} to pray for this bundle.`
      : "Lead the room in praying for this bundle.";
  }
  return names
    ? `${names} will lead the room in prayer.`
    : "Pray through this bundle together.";
}

export function ModuleRenderer({
  module,
}: {
  module: PresentedJourneyModule & { serverTime: string };
}) {
  switch (module.behaviorKey) {
    case "test-guided-prayer":
      if (process.env.NODE_ENV !== "production") {
        return (
          <p className="text-xl leading-8 text-ink">
            {module.configuration.prompt}
          </p>
        );
      }
      break;
    case "short-study": {
      const study = module.shortStudy;
      if (!study) break;
      const isPassage = study.contribution.kind === "passage";
      const isDiscussion = study.contribution.kind === "discussion";
      let readerInstruction: string;
      if (study.viewerRole === "reader") {
        readerInstruction = "You’re reading this aloud";
      } else if (study.viewerRole === "leader") {
        if (isDiscussion) {
          readerInstruction = "Lead the room through this question.";
        } else if (study.reader) {
          readerInstruction = `Ask ${study.reader.name} to read this aloud.`;
        } else {
          readerInstruction = "Please read this aloud.";
        }
      } else if (isDiscussion) {
        readerInstruction = `${study.reader?.name ?? "The leader"} is leading the discussion.`;
      } else if (study.reader) {
        readerInstruction = `${study.reader.name} is reading.`;
      } else {
        readerInstruction = "The leader is reading.";
      }
      return (
        <article aria-labelledby="current-contribution-heading">
          <div
            aria-live="polite"
            className="mb-7 border-b border-slate-200 pb-5"
          >
            {study.viewerRole === "reader" ? (
              <h2 className="flex items-center gap-2 text-xl font-semibold text-primary">
                <BadgeCheck aria-hidden="true" className="size-5" />
                {readerInstruction}
              </h2>
            ) : (
              <h2 className="text-xl font-semibold leading-7 text-primary">
                {readerInstruction}
              </h2>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 text-sm font-semibold text-ink-muted">
            <span className="flex items-center gap-2">
              {isDiscussion ? (
                <MessageCircle aria-hidden="true" className="size-4" />
              ) : (
                <BookOpenText aria-hidden="true" className="size-4" />
              )}
              {study.contribution.label}
            </span>
            <span>
              {study.contributionNumber} of {study.contributionCount}
            </span>
          </div>

          <h2 id="current-contribution-heading" className="sr-only">
            Current contribution: {study.contribution.label}
          </h2>
          <p
            className={
              isPassage
                ? "mt-6 whitespace-pre-line font-serif text-2xl leading-10 text-ink"
                : "mt-6 font-serif text-3xl font-semibold leading-tight text-ink"
            }
          >
            {study.contribution.text}
          </p>
          {isPassage ? (
            <p className="mt-5 text-sm font-medium text-ink-muted">
              {module.configuration.translation}
            </p>
          ) : null}
        </article>
      );
    }
    case "ministry-prayer": {
      const prayer = module.ministryPrayer;
      return (
        <article aria-labelledby="current-prayer-bundle">
          <div aria-live="polite" className="border-b border-slate-200 pb-6">
            <h2 className="text-xl font-semibold leading-7 text-primary">
              {ministryPrayerInstruction(prayer)}
            </h2>
            {prayer.assignees.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {prayer.assignees.map(({ id, name }) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-2 rounded-full bg-primary-faint px-4 py-2 text-sm font-semibold text-primary"
                  >
                    <UsersRound aria-hidden="true" className="size-4" />
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Bundle {prayer.bundleNumber} of {prayer.bundleCount}
            </p>
            <Countdown
              startedAt={prayer.bundleStartedAt}
              recommendedSeconds={prayer.bundleRecommendedSeconds}
              serverTime={module.serverTime}
              compact
              label="This bundle:"
            />
          </div>

          <h2
            id="current-prayer-bundle"
            className="mt-7 font-serif text-3xl font-bold text-ink"
          >
            {prayer.bundle.ministry}
          </h2>
          <div className="mt-7 space-y-8">
            {prayer.bundle.sections.map((section) => (
              <section key={section.heading}>
                <h3 className="text-lg font-bold text-primary">
                  {section.heading}
                </h3>
                <ul className="mt-3 space-y-3 text-lg leading-8 text-ink">
                  {section.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span aria-hidden="true" className="text-primary">
                        •
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>
      );
    }
    case "personal-prayer": {
      const prayer = module.personalPrayer;
      if (prayer.phase === "grouping") {
        return (
          <article>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary-faint text-primary">
              <UsersRound aria-hidden="true" className="size-8" />
            </div>
            <h2 className="mt-6 text-center font-serif text-3xl font-semibold text-ink">
              Find your prayer group
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-lg leading-7 text-ink-muted">
              Get together with these people. Your leader will reveal the prayer
              requests when everyone has moved.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {prayer.members.map((member) => (
                <li
                  key={member.id}
                  className="rounded-2xl bg-surface-muted px-5 py-4 text-lg font-semibold text-ink"
                >
                  {member.name}
                </li>
              ))}
            </ul>
          </article>
        );
      }

      return (
        <article>
          <div className="flex items-center gap-3 text-primary">
            <HeartHandshake aria-hidden="true" className="size-7" />
            <h2 className="font-serif text-3xl font-semibold">
              Pray for one another
            </h2>
          </div>
          <p className="mt-3 text-lg leading-7 text-ink-muted">
            Take time to pray for each person and what they have shared.
          </p>
          <ul className="mt-8 grid gap-4">
            {prayer.members.map((member) => (
              <li
                key={member.id}
                className="rounded-2xl border border-outline/50 bg-surface-subtle p-5"
              >
                <h3 className="text-lg font-semibold text-ink">
                  {member.name}
                </h3>
                <p className="mt-2 whitespace-pre-line text-lg leading-7 text-ink">
                  {member.request ?? "Ask them what they’d like prayer for."}
                </p>
              </li>
            ))}
          </ul>
        </article>
      );
    }
  }

  return (
    <p role="alert" className="text-lg text-danger">
      This activity is unavailable. Please ask the organizer for help.
    </p>
  );
}
