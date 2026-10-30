// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateForm } from "@/components/create/CreateForm";

vi.mock("@/lib/client/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/image")>();
  return {
    ...actual,
    prepareImage: vi.fn(async (file: File) => file),
  };
});

const STYLES = [
  { id: "pumpkin" as const, name: "Pumpkin", description: "Lantern glow" },
  { id: "witch" as const, name: "Witch", description: "Pointed hat" },
];

function renderForm() {
  return render(
    <CreateForm styles={STYLES} priceLabel="$4.99" />,
  );
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function validJpeg(name = "photo.jpg"): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, {
    type: "image/jpeg",
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/create form", () => {
  it("AC-3: rejects a GIF with a specific message and sends no request", async () => {
    renderForm();
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], "fun.gif", {
      type: "image/gif",
    });
    fireEvent.change(fileInput(), { target: { files: [gif] } });

    expect(
      await screen.findByText(/That file type isn't supported/i),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-4: rejects an 11 MB file before any request", async () => {
    renderForm();
    const huge = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput(), { target: { files: [huge] } });

    expect(await screen.findByText(/too large\. The limit is 10 MB/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-5: keeps generate disabled until a file and consent are present", async () => {
    renderForm();
    const generateButton = screen.getByRole("button", {
      name: /generate free preview/i,
    });
    expect(generateButton).toBeDisabled();

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    expect(generateButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    expect(generateButton).toBeEnabled();
  });

  it("AC-9: a no_subject failure shows a friendly message and a free retry, with no checkout", async () => {
    renderForm();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jobId: "job_1", status: "failed", error: "no_subject" }),
    });

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    fireEvent.click(screen.getByRole("button", { name: /generate free preview/i }));

    expect(
      await screen.findByText(/couldn't find a face or pet/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /unlock hd/i }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-16: a rate-limited visitor sees when they may try again", async () => {
    renderForm();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: "rate_limited",
        retryAt: "2026-10-31T10:00:00.000Z",
      }),
    });

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    fireEvent.click(screen.getByRole("button", { name: /generate free preview/i }));

    expect(
      await screen.findByText(/try again after Oct 31, 2026, 10:00 UTC/i),
    ).toBeInTheDocument();
  });

  it("AC-17: the capacity message is shown when the daily cap is reached", async () => {
    renderForm();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "capacity" }),
    });

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    fireEvent.click(screen.getByRole("button", { name: /generate free preview/i }));

    expect(
      await screen.findByText(/we're at capacity today/i),
    ).toBeInTheDocument();
  });

  it("AC-18: a transient failure offers a free retry and no checkout", async () => {
    renderForm();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jobId: "job_3", status: "failed", error: "transient" }),
    });

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    fireEvent.click(screen.getByRole("button", { name: /generate free preview/i }));

    expect(
      await screen.findByText(/something hiccuped/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /unlock hd/i }),
    ).not.toBeInTheDocument();
  });

  it("AC-19: a timeout failure shows the timeout message and a free retry", async () => {
    renderForm();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jobId: "job_4", status: "failed", error: "timeout" }),
    });

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    fireEvent.click(screen.getByRole("button", { name: /generate free preview/i }));

    expect(
      await screen.findByText(/generation took too long/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /unlock hd/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the paywall with the price after a successful preview", async () => {
    renderForm();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        jobId: "job_2",
        status: "preview_ready",
        previewUrl: "/api/preview/job_2",
        expiresAt: "2026-11-01T10:00:00.000Z",
      }),
    });

    fireEvent.change(fileInput(), { target: { files: [validJpeg()] } });
    fireEvent.click(screen.getByLabelText(/I own this photo/i));
    fireEvent.click(screen.getByRole("button", { name: /generate free preview/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /unlock hd — \$4\.99/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByAltText(/watermarked preview of your haunted portrait/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/kept until Nov 1, 2026/i)).toBeInTheDocument();
  });
});
