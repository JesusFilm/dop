import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getDatabase } from "@/lib/db";
import { renderQrSvg } from "@/lib/qr";
import { countSubmissions, findSessionBySetupPath } from "@/lib/repository";
import {
  isConfiguredSetupPath,
  originFromHeaders,
  submissionUrl,
} from "@/lib/setup";
import { formatZonedDateTime } from "@/lib/time";

import { CreateForm } from "./CreateForm";
import { QrPanel } from "./QrPanel";
import { SubmissionCount } from "./SubmissionCount";

// Depends on request headers and live database state — never cache.
export const dynamic = "force-dynamic";

const pageStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "2rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
};

/**
 * The organizer's no-auth, create-once setup page (§7.5, #9, #14). It lives at
 * an unguessable path configured out of source (`ORGANIZER_SETUP_PATH`); any
 * other path 404s. First visit shows the create form; once the single session
 * exists the page is read-only — QR, locked-in times, and the live submission
 * count — with no reset/create-again control.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  if (!isConfiguredSetupPath(path)) {
    notFound();
  }

  const db = getDatabase();
  const session = await findSessionBySetupPath(db, path);

  if (!session) {
    return (
      <main style={pageStyle}>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>
          Set up the Day of Prayer
        </h1>
        <CreateForm path={path} />
      </main>
    );
  }

  // Read-only view. Build the QR from the public origin (forwarded headers,
  // falling back to a configured URL) so a scan opens the submit landing.
  const headerList = await headers();
  const origin =
    originFromHeaders((name) => headerList.get(name)) ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "";
  const url = submissionUrl(origin);
  const svg = await renderQrSvg(url);
  const initialCount = await countSubmissions(db, session.id);

  return (
    <main style={pageStyle}>
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{session.name}</h1>
      <p style={{ color: "#555", margin: 0 }}>
        This session is created. Print or screenshot the QR below — there is no
        way to reset it from here, which protects everyone&rsquo;s requests.
      </p>

      <section
        style={{
          border: "1px solid #eee",
          borderRadius: "0.75rem",
          padding: "1.25rem",
        }}
      >
        <QrPanel svg={svg} url={url} />
      </section>

      <section
        style={{
          border: "1px solid #eee",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Locked-in times</h2>
        <dl style={{ margin: 0, display: "grid", gap: "0.25rem" }}>
          <div>
            <dt style={{ color: "#555", display: "inline" }}>Opens: </dt>
            <dd style={{ display: "inline", margin: 0 }}>
              {formatZonedDateTime(session.opensAt, session.timeZone)}
            </dd>
          </div>
          <div>
            <dt style={{ color: "#555", display: "inline" }}>
              Reveal / close:{" "}
            </dt>
            <dd style={{ display: "inline", margin: 0 }}>
              {formatZonedDateTime(session.revealAt, session.timeZone)}
            </dd>
          </div>
        </dl>
        <p style={{ color: "#888", fontSize: "0.85rem", margin: 0 }}>
          Times shown in {session.timeZone}.
        </p>
      </section>

      <section
        style={{
          border: "1px solid #eee",
          borderRadius: "0.75rem",
          padding: "1.25rem",
        }}
      >
        <SubmissionCount path={path} initialCount={initialCount} />
      </section>
    </main>
  );
}
