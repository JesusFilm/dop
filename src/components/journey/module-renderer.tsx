import { BadgeCheck, BookOpenText, MessageCircle } from "lucide-react";
import type { PresentedJourneyModule } from "@/lib/journey/types";

export function ModuleRenderer({ module }: { module: PresentedJourneyModule }) {
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

          <div
            aria-live="polite"
            className={
              study.viewerRole === "reader"
                ? "mt-8 rounded-3xl bg-primary p-5 text-white"
                : "mt-8 rounded-3xl bg-primary-faint p-5 text-primary"
            }
          >
            {study.viewerRole === "reader" ? (
              <p className="flex items-center gap-2 font-semibold">
                <BadgeCheck aria-hidden="true" className="size-5" />
                {readerInstruction}
              </p>
            ) : (
              <p className="font-semibold">{readerInstruction}</p>
            )}
          </div>
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
