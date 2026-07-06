'use client'

import React, { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export type Column<T> = {
  key: string
  label?: string
  header?: string
  width?: number | string
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  render?: (row: T) => React.ReactNode
}

export interface PaginationConfig {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}

export interface DataTableProps<T extends object> {
  columns: Column<T>[]
  data?: T[]
  rows?: T[]
  groupedData?: { key: string; label: React.ReactNode; items: T[] }[]
  loading?: boolean
  selectable?: boolean
  onSelectionChange?: (selected: T[]) => void
  pagination?: PaginationConfig
  emptyState?: React.ReactNode
  rowKey?: (row: T, idx: number) => string
  onRowClick?: (row: T) => void
  onSort?: (key: string | null, dir: 'asc' | 'desc' | null) => void
}

type SortDir = 'asc' | 'desc' | null

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

function SkeletonRows({ columns, count }: { columns: Column<unknown>[]; count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          {columns.map((col) => (
            <td key={col.key} className="px-4 py-3">
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function DataTable<T extends object>({
  columns,
  data,
  rows,
  groupedData,
  loading = false,
  selectable = false,
  onSelectionChange,
  pagination,
  emptyState,
  rowKey,
  onRowClick,
  onSort,
}: DataTableProps<T>) {
  const tableData = rows ?? data ?? []
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const getKey = (row: T, idx: number): string =>
    rowKey ? rowKey(row, idx) : String((row as Record<string, unknown>)['id'] ?? idx)

  const handleSort = (key: string) => {
    let nextKey: string | null = key
    let nextDir: SortDir = 'asc'

    if (sortKey !== key) {
      nextKey = key
      nextDir = 'asc'
    } else if (sortDir === 'asc') {
      nextKey = key
      nextDir = 'desc'
    } else {
      nextKey = null
      nextDir = null
    }

    setSortKey(nextKey)
    setSortDir(nextDir)
    onSort?.(nextKey, nextDir)
  }

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return tableData
    return [...tableData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]
      const aStr = String(aVal ?? '')
      const bStr = String(bVal ?? '')
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [tableData, sortKey, sortDir])

  const renderedGroups = useMemo(() => {
    if (!groupedData) return null
    if (!sortKey || !sortDir) return groupedData
    return groupedData.map(g => ({
      ...g,
      items: [...g.items].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortKey]
        const bVal = (b as Record<string, unknown>)[sortKey]
        const aStr = String(aVal ?? '')
        const bStr = String(bVal ?? '')
        const cmp = aStr.localeCompare(bStr, undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }))
  }, [groupedData, sortKey, sortDir])

  const allKeys = sortedData.map((row, idx) => getKey(row, idx))
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k))
  const someSelected = allKeys.some((k) => selected.has(k)) && !allSelected

  const toggleAll = () => {
    let next: Set<string>
    if (allSelected) {
      next = new Set(Array.from(selected).filter((k) => !allKeys.includes(k)))
    } else {
      next = new Set([...Array.from(selected), ...allKeys])
    }
    setSelected(next)
    onSelectionChange?.(sortedData.filter((_, idx) => next.has(getKey(sortedData[idx], idx))))
  }

  const toggleRow = (key: string, row: T) => {
    const next = new Set(selected)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setSelected(next)
    onSelectionChange?.(sortedData.filter((r, idx) => next.has(getKey(r, idx))))
  }

  const effectiveColumns: Column<T>[] = selectable
    ? [
        {
          key: '__checkbox__',
          label: '',
          width: 40,
          render: (row: T) => {
            const k = getKey(row, sortedData.indexOf(row))
            return (
              <input
                type="checkbox"
                checked={selected.has(k)}
                onChange={() => toggleRow(k, row)}
                className="h-4 w-4 rounded border-slate-300 accent-primary"
              />
            )
          },
        },
        ...columns,
      ]
    : columns

  const isEmpty = !loading && (groupedData ? groupedData.length === 0 : sortedData.length === 0)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm w-full">
      <table className="min-w-full text-sm whitespace-nowrap md:whitespace-normal">
        <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 border-b border-slate-200">
          <tr>
            {selectable && (
              <th className="px-4 py-3" style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 accent-primary"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={[
                  'px-4 py-3 font-medium',
                  alignClass[col.align ?? 'left'],
                  col.sortable ? 'cursor-pointer select-none hover:bg-slate-100' : '',
                  col.className ?? '',
                ].join(' ')}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label ?? col.header ?? ''}
                  {col.sortable && (() => {
                    const isSorted = sortKey === col.key
                    const isAsc = isSorted && sortDir === 'asc'
                    const isDesc = isSorted && sortDir === 'desc'
                    
                    if (isAsc) {
                      return <ArrowUp className="w-3.5 h-3.5 text-slate-800 ml-1 inline-block" />
                    }
                    if (isDesc) {
                      return <ArrowDown className="w-3.5 h-3.5 text-slate-800 ml-1 inline-block" />
                    }
                    return <ArrowUpDown className="w-3.5 h-3.5 text-slate-350 ml-1 inline-block opacity-70 hover:opacity-100 transition-opacity" />
                  })()}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {loading ? (
            <SkeletonRows
              columns={effectiveColumns as Column<unknown>[]}
              count={5}
            />
          ) : isEmpty ? (
            <tr>
              <td
                colSpan={effectiveColumns.length}
                className="px-4 py-12 text-center"
              >
                {emptyState ?? (
                  <span className="text-slate-400">Không có dữ liệu</span>
                )}
              </td>
            </tr>
          ) : renderedGroups ? (
            renderedGroups.map((group) => (
              <React.Fragment key={group.key}>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <td colSpan={effectiveColumns.length} className="px-4 py-2.5 text-sm font-bold text-slate-800">
                    {group.label}
                  </td>
                </tr>
                {group.items.length === 0 ? (
                  <tr>
                    <td colSpan={effectiveColumns.length} className="px-4 py-4 text-center text-slate-400 italic">Trống</td>
                  </tr>
                ) : group.items.map((row, idx) => {
                  const key = getKey(row, idx)
                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick?.(row)}
                      className={[
                        'border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors',
                        onRowClick ? 'cursor-pointer' : '',
                        selected.has(key) ? 'bg-blue-50' : '',
                      ].join(' ')}
                    >
                      {selectable && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggleRow(key, row)}
                            className="h-4 w-4 rounded border-slate-300 accent-primary"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={[
                            'px-4 py-3 align-middle',
                            alignClass[col.align ?? 'left'],
                            col.className ?? '',
                          ].join(' ')}
                        >
                          {col.render
                            ? col.render(row)
                            : String((row as Record<string, unknown>)[col.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </React.Fragment>
            ))
          ) : (
            sortedData.map((row, idx) => {
              const key = getKey(row, idx)
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={[
                    'border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors',
                    onRowClick ? 'cursor-pointer' : '',
                    selected.has(key) ? 'bg-blue-50' : '',
                  ].join(' ')}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key, row)}
                        className="h-4 w-4 rounded border-slate-300 accent-primary"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        'px-4 py-3 align-middle',
                        alignClass[col.align ?? 'left'],
                        col.className ?? '',
                      ].join(' ')}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      {pagination && !loading && !isEmpty && (
        <div className="border-t border-slate-200 px-4 py-3">
          <PaginationInline {...pagination} />
        </div>
      )}
    </div>
  )
}

function PaginationInline({
  page,
  total,
  pageSize,
  onChange,
}: PaginationConfig) {
  const totalPages = Math.ceil(total / pageSize)
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end = Math.min(page * pageSize, total)

  const pages = buildPageList(page, totalPages)

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">
        Hiển thị {start}–{end} trong {total} kết quả
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1 text-sm text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={[
                'min-w-[32px] rounded-lg border border-slate-200 px-2 py-1 text-sm shadow-sm transition-colors',
                p === page
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {p}
            </button>
          )
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  )
}

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = []
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total)
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total)
  }
  return pages
}
