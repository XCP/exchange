import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import RetiredAtomicPage from '@/app/atomic/[[...retired]]/page'

it('old atomic URLs show a permanent retirement notice and Marketplace link with no trade controls', () => {
  render(<RetiredAtomicPage />)
  expect(screen.getByRole('heading').textContent).toContain('has been retired')
  expect(screen.getByRole('link', { name: 'Open Marketplace' }).getAttribute('href')).toBe('https://digirare.com/')
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})
