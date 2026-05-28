import type { CreateRunRequest } from "@ray-catalyst/core";

export async function fileToAttachment(file: File): Promise<CreateRunRequest["attachments"][number]> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl
  };
}
