import { CreateForm } from "@/components/create/CreateForm";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { publicStyles } from "@/config/styles";
import { captchaSiteKey } from "@/lib/captcha";
import { packPriceCents, priceCents } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import { loadJob } from "@/lib/job-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create your haunted portrait",
  description:
    "Upload a photo, pick one of five Halloween styles and get a free watermarked preview.",
  alternates: { canonical: "/create" },
};

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{
    job?: string;
    declined?: string;
    cancelled?: string;
  }>;
}) {
  const params = await searchParams;
  const job = typeof params.job === "string" ? await loadJob(params.job) : null;
  const usableJob = job && job.status !== "expired" ? job : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-10 sm:py-14">
        <CreateForm
          styles={publicStyles()}
          priceLabel={formatPrice(priceCents())}
          packPriceLabel={formatPrice(packPriceCents())}
          turnstileSiteKey={captchaSiteKey()}
          initialJob={
            usableJob
              ? {
                  id: usableJob.id,
                  status: usableJob.status,
                  previewUrl: usableJob.previewKey
                    ? `/api/preview/${usableJob.id}`
                    : undefined,
                  expiresAt: usableJob.expiresAt,
                }
              : undefined
          }
          declined={params.declined === "1"}
          cancelled={params.cancelled === "1"}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
