// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: trackMock }));

import { SuccessPoller } from "@/components/success/SuccessPoller";

const JOB = {
  id: "job_share",
  status: "unlocked",
  styleId: "pumpkin",
  createdAt: "2026-10-30T10:00:00.000Z",
  expiresAt: "2026-11-01T10:00:00.000Z",
  product: "single",
  previewUrl: "/api/preview/job_share",
  downloadUrl: "/api/download?token=abc",
  shareUrl: "/api/share?token=share",
  assets: [
    {
      styleId: "pumpkin",
      status: "ready",
      downloadUrl: "/api/download?token=abc",
      previewUrl: "/api/preview/job_share",
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  trackMock.mockReset();
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ job: JOB, payment: "paid" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share button", () => {
  it("AC-17: clicking share emits share_image_downloaded once per click", async () => {
    render(
      <SuccessPoller
        sessionId="cs_1"
        jobId="job_share"
        styles={[{ id: "pumpkin", name: "Pumpkin", description: "Lantern" }]}
      />,
    );

    const link = await screen.findByRole("link", {
      name: /download before\/after image/i,
    });
    // Keep jsdom from trying to navigate to the signed URL.
    link.addEventListener("click", (event) => event.preventDefault());
    // The unlock itself emits payment_succeeded; only count share clicks.
    trackMock.mockClear();

    fireEvent.click(link);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("share_image_downloaded", {
      style: "pumpkin",
    });

    fireEvent.click(link);
    expect(trackMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(link).toHaveAttribute("download"));
  });
});
