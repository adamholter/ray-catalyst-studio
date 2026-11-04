import { useRef, useState, type ReactNode } from "react";

export function ImageDropzone({ className, label, multiple = true, disabled = false, onFiles, children }: {
  className: string;
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`${className}${dragging ? " is-dragging" : ""}`}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled && event.dataTransfer.types.includes("Files")) {
          depth.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        depth.current = 0;
        setDragging(false);
        if (!disabled) {
          const files = Array.from(event.dataTransfer.files);
          onFiles(multiple ? files : files.slice(0, 1));
        }
      }}
    >
      <input ref={input} className="drop-input" type="file" aria-label={label} multiple={multiple} accept="image/*" disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          onFiles(files);
        }} />
      {children}
    </label>
  );
}
