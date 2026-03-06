import { useState, useMemo, useEffect } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(items, { defaultPageSize = 25, page: extPage, pageSize: extPageSize, onPageChange, onPageSizeChange } = {}) {
  const [intPage, setIntPage] = useState(1);
  const [intPageSize, setIntPageSize] = useState(defaultPageSize);

  const isExternal = extPage !== undefined;
  const page = isExternal ? extPage : intPage;
  const pageSize = isExternal ? (extPageSize ?? defaultPageSize) : intPageSize;
  const setPage = isExternal ? onPageChange : setIntPage;
  const setPageSize = isExternal ? onPageSizeChange : setIntPageSize;

  // Internal mode only: reset page on items/pageSize change
  useEffect(() => {
    if (!isExternal) setIntPage(1);
  }, [items, intPageSize, isExternal]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page to valid range (handles stale stored values)
  const effectivePage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, effectivePage, pageSize]);

  return { pageItems, page: effectivePage, pageSize, setPage, setPageSize, totalPages, totalItems };
}
