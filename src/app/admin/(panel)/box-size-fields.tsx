/**
 * Three whole-centimetre inputs for a packed box — the markup half of
 * `box-size.ts`. Uncontrolled, so it works inside any of the admin's
 * `useFormActionKeepingInput` forms.
 */
export default function BoxSizeFields({
  values,
  error,
  hint,
  labelClass,
  inputClass,
  errorClass,
}: {
  values: { lengthCm: string; breadthCm: string; heightCm: string };
  error?: string;
  hint: string;
  labelClass: string;
  inputClass: string;
  errorClass: string;
}) {
  const sides = [
    { name: 'lengthCm', label: 'Length' },
    { name: 'breadthCm', label: 'Breadth' },
    { name: 'heightCm', label: 'Height' },
  ] as const;

  return (
    <fieldset className="mt-6">
      <legend className={labelClass}>Packed box size (cm)</legend>
      <div className="grid grid-cols-3 gap-3">
        {sides.map((side) => (
          <div key={side.name}>
            <label htmlFor={side.name} className="block type-caption text-ink-soft">
              {side.label}
            </label>
            <input
              id={side.name}
              name={side.name}
              inputMode="numeric"
              defaultValue={values[side.name]}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <p className="mt-1 type-caption text-ink-soft">{hint}</p>
      {error && <p className={errorClass}>{error}</p>}
    </fieldset>
  );
}
