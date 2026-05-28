import type { FieldSpec } from "@ray-catalyst/core";
import { SegmentedControl } from "./SegmentedControl";

export function defaultValueForField(field: FieldSpec) {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.kind === "number") return 1;
  if (field.kind === "boolean") return false;
  if (field.kind === "images") return [];
  return "";
}

export function FieldRenderer({
  field,
  value,
  onChange
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === "textarea") {
    return (
      <label className="field field-wide">
        <span>{field.label}</span>
        <textarea
          value={String(value || "")}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          rows={5}
        />
        {field.help ? <small>{field.help}</small> : null}
      </label>
    );
  }

  if (field.kind === "select" || field.kind === "aspectRatio") {
    return (
      <SegmentedControl
        label={field.label}
        value={String(value || field.defaultValue || field.options?.[0]?.value || "")}
        options={field.options || []}
        onChange={onChange}
      />
    );
  }

  if (field.kind === "number") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <input
          type="number"
          min="1"
          value={Number(value || field.defaultValue || 1)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {field.help ? <small>{field.help}</small> : null}
      </label>
    );
  }

  if (field.kind === "boolean") {
    return (
      <label className="toggle-row">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }

  return (
    <label className="field">
      <span>{field.label}</span>
      <input
        value={String(value || "")}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.help ? <small>{field.help}</small> : null}
    </label>
  );
}
