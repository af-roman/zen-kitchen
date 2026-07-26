import { fileToDataUrl } from '@/domain/recipeMath'
import { assetUrl } from '@/shared/assetUrl'
import { Field, inputClass } from './ui'

export function ImageUploadField({
  label = 'Photo',
  hint,
  value,
  onChange,
}: {
  label?: string
  hint?: string
  value?: string
  onChange: (dataUrl: string | undefined) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void fileToDataUrl(f).then(onChange)
        }}
      />
      {value ? (
        <img
          src={assetUrl(value)}
          alt=""
          className="mt-2 h-20 w-20 rounded-lg border border-line object-cover"
        />
      ) : null}
    </Field>
  )
}
