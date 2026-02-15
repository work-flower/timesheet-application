import { useState, useMemo, useEffect } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

export function usePagination(items, { defaultPageSize = 25 } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Reset to page 1 when items change or pageSize changes
  useEffect(() => {
    setPage(1);
  }, [items, pageSize]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems };
}
