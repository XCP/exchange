export interface CounterpartyResponse<T> {
  result: T
  next_cursor: string | null
  result_count: number
}
