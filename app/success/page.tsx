import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SuccessPoller } from "@/components/success/SuccessPoller";
import { publicStyles } from "@/config/styles";
import { loadJob } from "@/lib/job-service";
import { getSession } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your portrait",
  description: "Download your full-resolution haunted portrait.",
  robots: { index: false, follow: false },
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const session =
    typeof params.session_id === "string"
      ? await getSession(params.session_id)
      : null;
  const job = session ? await loadJob(session.jobId) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-12 sm:py-16">
        <SuccessPoller
          sessionId={session?.id}
          jobId={job && job.status !== "expired" ? job.id : undefined}
          styles={publicStyles()}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
