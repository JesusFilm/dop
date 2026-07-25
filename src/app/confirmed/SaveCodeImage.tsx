"use client";

import { useEffect, useState } from "react";

import {
  CODE_IMAGE_SIZE,
  drawRecoveryCodeImage,
  recoveryCodeImageFileName,
  supportsFileShare,
} from "@/lib/code-image";
import { CONFIRMATION_COPY } from "@/lib/confirmation";

/**
 * The §7.2 "Save code as image" affordance: renders the recovery code to a
 * canvas and hands the PNG to the platform share sheet (iOS "Save to Photos",
 * Android "Save to Files"), so someone who mistrusts screenshots still leaves
 * with the code.
 *
 * **Graceful by construction.** File sharing is a mobile-only capability, so the
 * button renders nothing at all until {@link supportsFileShare} confirms this
 * browser accepts a shared file — probed in an effect rather than during render
 * so the server and client markup match. Where it's unsupported (desktop, older
 * Safari) the screenshot instruction on the surrounding page is the whole story,
 * exactly as §7.2 intends. A failure mid-share degrades the same way: a short
 * message pointing back at the screenshot, never a dead end.
 */

/** An empty PNG stand-in used only to ask `canShare` whether files are allowed. */
function shareProbeFile(): File {
  return new File([new Uint8Array()], "probe.png", { type: "image/png" });
}

type Status = "idle" | "pending" | "error";

export function SaveCodeImage({ recoveryCode }: { recoveryCode: string }) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    setSupported(supportsFileShare(navigator, shareProbeFile()));
  }, []);

  if (!supported) {
    return null;
  }

  async function saveAsImage() {
    setStatus("pending");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CODE_IMAGE_SIZE.width;
      canvas.height = CODE_IMAGE_SIZE.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context unavailable.");
      }
      drawRecoveryCodeImage(context, recoveryCode);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) {
        throw new Error("Could not render the recovery code image.");
      }

      const file = new File([blob], recoveryCodeImageFileName(recoveryCode), {
        type: "image/png",
      });
      // Re-check with the real file: the probe only proved PNGs are shareable
      // in principle, and the sheet can still refuse this one.
      if (!supportsFileShare(navigator, file)) {
        throw new Error("File sharing is unavailable.");
      }

      await navigator.share({
        files: [file],
        title: "Day of Prayer recovery code",
      });
      setStatus("idle");
    } catch (error) {
      // Dismissing the share sheet raises AbortError — that's a choice, not a
      // failure, so it must not surface an error message.
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <button
        type="button"
        onClick={saveAsImage}
        disabled={status === "pending"}
        style={{
          padding: "0.75rem 1rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#2d3a7b",
          background: "#fff",
          border: "1px solid #c9d2f0",
          borderRadius: "0.5rem",
          cursor: status === "pending" ? "default" : "pointer",
        }}
      >
        {status === "pending"
          ? CONFIRMATION_COPY.saveImagePending
          : CONFIRMATION_COPY.saveImageButton}
      </button>
      {status === "error" ? (
        <p
          role="alert"
          style={{ color: "#b00020", fontSize: "0.85rem", margin: 0 }}
        >
          {CONFIRMATION_COPY.saveImageError}
        </p>
      ) : null}
    </div>
  );
}
