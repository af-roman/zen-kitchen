import { fileToDataUrl } from '@/domain/recipeMath'
import { assetUrl } from '@/shared/assetUrl'
import { Field, RemoveButton, inputClass } from './ui'

export function ImageUploadField({
  label = 'Photo',
  hint,
  value,
  onChange,
  maxWidth = 640,
}: {
  label?: string
  hint?: string
  value?: string
  onChange: (dataUrl: string | undefined) => void
  /** Max width when compressing the uploaded image. */
  maxWidth?: number
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void fileToDataUrl(f, maxWidth).then(onChange)
          e.target.value = ''
        }}
      />
      {value ? (
        <div className="mt-2 flex items-end gap-3">
          <img
            src={assetUrl(value)}
            alt=""
            className="h-20 w-20 rounded-lg border border-line object-cover"
          />
          <RemoveButton label="Remove photo" onClick={() => onChange(undefined)} />
        </div>
      ) : null}
    </Field>
  )
}
