import { ImageIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AnalyzeImageButton, VisitImageUploadForm } from "@/components/offline-visit-actions";
import { Badge, Button, Card, DataNotice, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { formatIdr, formatJakartaTime } from "@/lib/format";
import { getOfflineStoreVisit } from "@/lib/data";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { getPageI18n } from "@/lib/i18n/server";
import { analysisStatusLabel, imageTypeLabel, visitStatusLabel } from "@/lib/offline-visit-labels";
import type { OfflineImageVisionResult, VisionDetectedProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OfflineVisitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const resolvedParams = await params;
  const { locale, dict } = await getPageI18n(Promise.resolve({ locale: resolvedParams.locale }));
  const result = await getOfflineStoreVisit(resolvedParams.id);
  const visit = result.data;

  return (
    <AppShell locale={locale} dict={dict} title={dict.offlineUploads.visitDetail} currentPath={`/offline-uploads/${resolvedParams.id}`} isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />
      {!visit ? (
        <EmptyState text="Visit not found" />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{visit.store_name}</h2>
                  <Badge>{visitStatusLabel(visit.visit_status)}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {visit.city} / {visit.channel_type} / {visit.uploader_name} / {visit.visit_date}
                </p>
              </div>
              <form action={`/api/offline-store-visits/${visit.id}/analyze`} method="post">
                <Button type="submit">{dict.offlineUploads.analyzeAll}</Button>
              </form>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{dict.offlineUploads.uploadImages}</h2>
            <VisitImageUploadForm dict={dict} visitId={visit.id} returnTo={`/${locale}/offline-uploads/${visit.id}`} />
          </Card>

          <div className="grid gap-4">
            {(visit.offline_visit_images ?? []).length === 0 ? <EmptyState text={dict.offlineUploads.noImages} /> : null}
            {(visit.offline_visit_images ?? []).map((image) => (
              <Card key={image.id}>
                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge>{imageTypeLabel(dict, image.image_type)}</Badge>
                      <Badge>{analysisStatusLabel(dict, image.analysis_status)}</Badge>
                    </div>
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      {image.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.image_url} alt={image.file_name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-slate-400" />
                      )}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {image.file_name} / {Math.round(image.file_size / 1024)}KB / {formatJakartaTime(image.uploaded_at)}
                    </div>
                    {image.analysis_status === "failed" ? (
                      <p className="mt-2 text-sm text-red-700">{image.error_message}</p>
                    ) : null}
                    {image.analysis_status === "pending" || image.analysis_status === "failed" ? (
                      <div className="mt-3">
                        <AnalyzeImageButton imageId={image.id} label={dict.offlineUploads.retryAnalyze} />
                      </div>
                    ) : null}
                  </div>
                  <ImageAnalysisPanel dict={dict} imageId={image.id} result={image.vision_result as OfflineImageVisionResult | null} returnTo={`/${locale}/offline-uploads/${visit.id}`} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ImageAnalysisPanel({
  dict,
  imageId,
  result,
  returnTo,
}: {
  dict: Dictionary;
  imageId: string;
  result: OfflineImageVisionResult | null;
  returnTo: string;
}) {
  if (!result?.detected_products?.length) {
    return <div className="text-sm text-slate-500">{dict.offlineUploads.noOcr}</div>;
  }

  return (
    <div>
      <div className="mb-3">
        <h3 className="font-semibold">{dict.offlineUploads.detectedProducts}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {result.image_quality} / {Math.round((result.overall_confidence ?? 0) * 100)}% / {result.review_reasons.join(", ")}
        </p>
      </div>
      <div className="space-y-3">
        {result.detected_products.map((product, index) => (
          <ProductConfirmForm key={`${product.product_name_normalized}-${index}`} dict={dict} imageId={imageId} product={product} returnTo={returnTo} />
        ))}
      </div>
    </div>
  );
}

function ProductConfirmForm({
  dict,
  imageId,
  product,
  returnTo,
}: {
  dict: Dictionary;
  imageId: string;
  product: VisionDetectedProduct;
  returnTo: string;
}) {
  const pricePerPiece = product.promo_price_idr && product.total_piece_count
    ? product.promo_price_idr / product.total_piece_count
    : null;

  return (
    <form action={`/api/offline-visit-images/${imageId}/confirm`} method="post" className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{product.product_name_normalized ?? product.product_name_raw ?? "-"}</div>
          <div className="text-sm text-slate-500">
            {product.brand_name ?? "-"} / {product.size ?? "-"} / {formatIdr(product.promo_price_idr)} / {pricePerPiece ? `${formatIdr(pricePerPiece)}/pc` : "-"}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="create_event" defaultChecked />
          {dict.offlineUploads.createPromoEvent}
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-6">
        <TextInput name="brand_name" defaultValue={product.brand_name ?? ""} placeholder={dict.common.brand} required />
        <TextInput name="product_name" defaultValue={product.product_name_normalized ?? product.product_name_raw ?? ""} placeholder={dict.common.product} required className="md:col-span-2" />
        <SelectInput name="pack_type" defaultValue={product.pack_type}>
          <option value="pants">{dict.enums.packType.pants}</option>
          <option value="tape">{dict.enums.packType.tape}</option>
          <option value="unknown">{dict.enums.packType.unknown}</option>
        </SelectInput>
        <TextInput name="size" defaultValue={product.size ?? ""} placeholder={dict.common.size} />
        <TextInput name="total_piece_count" type="number" defaultValue={product.total_piece_count ?? product.piece_count ?? ""} placeholder={dict.common.pcs} required />
        <TextInput name="list_price_idr" type="number" defaultValue={product.list_price_idr ?? ""} placeholder={dict.prices.listIdr} />
        <TextInput name="promo_price_idr" type="number" defaultValue={product.promo_price_idr ?? ""} placeholder={dict.prices.promoIdr} required />
        <TextInput name="promo_mechanic" defaultValue={product.promo_mechanic ?? "offline_display"} placeholder={dict.prices.promoType} />
        <Button type="submit" className="md:col-span-3">{dict.offlineUploads.confirmProduct}</Button>
      </div>
    </form>
  );
}
