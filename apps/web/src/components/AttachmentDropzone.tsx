import type { CreateRunRequest } from "@ray-catalyst/core";
import { fileToAttachment } from "../lib/files";

export function AttachmentDropzone({
  attachments,
  onChange
}: {
  attachments: CreateRunRequest["attachments"];
  onChange: (attachments: CreateRunRequest["attachments"]) => void;
}) {
  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = await Promise.all(Array.from(files).map(fileToAttachment));
    onChange([...attachments, ...next]);
  }

  return (
    <div className="attachment-zone">
      <label>
        <input type="file" multiple accept="image/*" onChange={(event) => handleFiles(event.target.files)} />
        <span>Drop or choose references</span>
        <small>Images stay local until the backend request is created.</small>
      </label>
      {attachments.length ? (
        <div className="attachment-list">
          {attachments.map((file) => (
            <figure key={`${file.name}-${file.dataUrl.length}`}>
              <img src={file.dataUrl} alt="" />
              <figcaption>{file.name}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}
