import { mockOcrFromUpload } from "@/lib/business";
import { formReturnRedirect } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const uploaderName = String(formData.get("uploader_name") ?? "");
    const city = String(formData.get("city") ?? "");
    const storeName = String(formData.get("store_name") ?? "");
    const channelType = String(formData.get("channel_type") ?? "");
    const body = Object.fromEntries(formData.entries());

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing image file" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const imagePath = `${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("offline-uploads")
      .upload(imagePath, file, { upsert: false });
    if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });

    const { data: publicUrl } = supabase.storage.from("offline-uploads").getPublicUrl(imagePath);
    const { data: upload, error: insertError } = await supabase
      .from("offline_uploads")
      .insert({
        uploader_name: uploaderName,
        city,
        store_name: storeName,
        channel_type: channelType,
        image_path: imagePath,
        image_url: publicUrl.publicUrl,
        upload_status: "ocr_processing",
      })
      .select("*")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 400 });

    const ocrPayload = mockOcrFromUpload({
      uploadId: upload.id,
      fileName: file.name,
      city,
      storeName,
    });
    const { error: ocrError } = await supabase
      .from("offline_ocr_results")
      .insert(ocrPayload)
      .select("*")
      .single();
    if (ocrError) return Response.json({ error: ocrError.message }, { status: 400 });

    await supabase.from("offline_uploads").update({ upload_status: "ocr_done" }).eq("id", upload.id);
    return formReturnRedirect(request, body, "/offline-uploads");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
