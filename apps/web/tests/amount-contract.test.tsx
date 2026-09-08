import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import vectors from '@xcp/wallet-sdk/amounts/vectors'
import { AmountField } from '@/components/ui/form-kit'
import { SettingInput } from '@/components/form-settings'
import { fromBase, minimumBase, slippageMinimum, rawErrorMessage, sanitizeAmountInput, toBase, totalToBase } from '@/utils/numeric'
import { quoteQuantity } from '@/utils/quote-quantity'

afterEach(cleanup)

describe('shared amount vectors through Exchange conversions', () => {
  for (const vector of vectors.drafts.filter((v) => v.decimals === 0 || v.decimals === 8)) {
    it(vector.id, () => {
      const result = toBase(sanitizeAmountInput(vector.draft), vector.decimals === 8)
      expect(result.ok).toBe(vector.status === 'valid')
      if (result.ok && 'raw' in vector) expect(result.base).toBe(vector.raw)
    })
  }
  for (const vector of vectors.rawToInput) {
    it(`round trips ${vector.raw} in ${vector.decimals} decimals`, () => {
      expect(fromBase(vector.raw, vector.decimals === 8)).toBe(vector.input)
      expect(toBase(vector.input, vector.decimals === 8)).toMatchObject({ ok: true, base: vector.raw })
    })
  }
  it('rejects unknown divisibility and unsafe raw numbers before quoting', () => {
    expect(toBase('1', undefined).ok).toBe(false)
    expect(fromBase(100, undefined)).toBe('')
    expect(fromBase(10000000000000001, true)).toBe('')
    expect(quoteQuantity(10000000000000001)).toBeNull()
    expect(quoteQuantity('10000000000000001')).toBe('10000000000000001')
    for (const raw of ['1e5', '1.2', '-5', '1,234', '9223372036854775808']) expect(quoteQuantity(raw)).toBeNull()
  })
  it('rounds a sell receive floor up and a buy spend ceiling down', () => {
    expect(totalToBase('1.5', '1', false, 'ceil')).toMatchObject({ ok: true, base: '2' })
    expect(totalToBase('1.5', '1', false, 'floor')).toMatchObject({ ok: true, base: '1' })
    expect(totalToBase('0.00000001', '100000000.00000001', true, 'ceil')).toMatchObject({ ok: true, base: '100000001' })
    expect(totalToBase('1e5', '1', true).ok).toBe(false)
    expect(totalToBase('1', '0,5', true).ok).toBe(false)
    expect(minimumBase('1', 0.99)).toBe('1')
    expect(minimumBase('100', NaN)).toBe('0')
    expect(slippageMinimum('10000000000000001', 33.33)).toBe((10000000000000001n * 6667n / 10000n).toString())
  })
})

function DraftForm({ divisible }: { divisible: boolean | undefined }) {
  const [draft, setDraft] = useState('')
  const result = toBase(draft, divisible)
  return <>
    <AmountField label="Amount" value={draft} onChange={(v) => setDraft(sanitizeAmountInput(v))} chip="XCP"
      error={draft && !result.ok ? rawErrorMessage(result.error, 'XCP') : null} />
    <button disabled={!result.ok || result.base === '0'}>Compose</button>
    <output data-testid="intent">{result.ok ? result.base : 'invalid'}</output>
  </>
}

describe('real DOM editing paths', () => {
  for (const draft of ['-5', '1e5', '0,5', '1,234', '1.2.3', '0.000000001', '+5', '１.５']) {
    it(`keeps sequential ${draft} invalid`, async () => {
      render(<DraftForm divisible />)
      await userEvent.type(screen.getByRole('textbox'), draft)
      expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(draft)
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByTestId('intent').textContent).toBe('invalid')
    })
  }
  it('keeps an indivisible decimal invalid and reevaluates metadata without changing its draft', async () => {
    const view = render(<DraftForm divisible={false} />)
    await userEvent.type(screen.getByRole('textbox'), '0.5')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('0.5')
    expect(screen.getByTestId('intent').textContent).toBe('invalid')
    view.rerender(<DraftForm divisible />)
    expect(screen.getByTestId('intent').textContent).toBe('50000000')
    view.rerender(<DraftForm divisible={undefined} />)
    expect(screen.getByTestId('intent').textContent).toBe('invalid')
  })
  it('accepts an exact replacement after invalid paste and preserves a multiline paste as invalid', async () => {
    render(<DraftForm divisible />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    await userEvent.click(input)
    await userEvent.paste('1\n234')
    expect(screen.getByTestId('intent').textContent).toBe('invalid')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    await userEvent.clear(input)
    await userEvent.paste('100000000.00000001')
    expect(screen.getByTestId('intent').textContent).toBe('10000000000000001')
    fireEvent.drop(input, { dataTransfer: { getData: () => '0,5' } })
    expect(screen.getByTestId('intent').textContent).toBe('invalid')
  })
  it('does not truncate fee decimals or reuse a valid fee after malformed input', async () => {
    function Fee() {
      const [value, setValue] = useState(0)
      return <><SettingInput label="Fee" value={value} onChange={setValue} min={0} max={10000} /><output>{String(value)}</output></>
    }
    render(<Fee />)
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, '1.56')
    expect(screen.getByRole('status').textContent).toBe('1.56')
    await userEvent.clear(input)
    await userEvent.type(input, '1,5')
    expect((input as HTMLInputElement).value).toBe('1,5')
    expect(screen.getByRole('status').textContent).toBe('NaN')
    await userEvent.clear(input)
    await userEvent.type(input, '0.1')
    expect(screen.getByRole('status').textContent).toBe('0.1')
  })
})
