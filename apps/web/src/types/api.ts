export interface CounterpartyResponse<T> {
  result: T
  next_cursor: string | null
  result_count: number
}

export interface XcpResponse<T> {
  data: T
  meta?: {
    page: number
    total: number
    per_page: number
  }
}
