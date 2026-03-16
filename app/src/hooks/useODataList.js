import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildFilterString } from '../utils/odataBuilder.js';
import { extractFilterValues } from '../utils/odataParser.js';

const MANAGED_KEYS = new Set(['$filter', '$orderby', '$top', '$skip', '$count', '$summary']);

/**
 * Read a value from localStorage safely.
 */
function readLS(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write a value to localStorage safely.
 */
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

/**
 * Build URL search string preserving non-OData params in their original position.
 * OData params are updated in-place if present, or appended at the end.
 */
function buildSearch(currentSearch, managedValues) {
  const existing = new URLSearchParams(currentSearch);
  const pairs = [];
  const handled = new Set();

  // Walk existing params in order
  for (const [key, value] of existing.entries()) {
    if (MANAGED_KEYS.has(key)) {
      // Replace in-place with new value
      const newVal = managedValues[key];
      if (newVal != null && newVal !== '') {
        pairs.push([key, newVal]);
      }
      handled.add(key);
    } else {
      // Non-OData param — preserve exactly
      pairs.push([key, value]);
    }
  }

  // Append managed keys that weren't already in the URL
  for (const [key, value] of Object.entries(managedValues)) {
    if (!handled.has(key) && value != null && value !== '') {
      pairs.push([key, value]);
    }
  }

  // Build manually to avoid URLSearchParams encoding $ as %24
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k).replace(/%24/gi, '$')}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Coordinator hook for OData-driven list views with URL-based filter state.
 *
 * Replaces useListState + usePagination + manual fetch for data-affecting state.
 *
 * Initial page load: URL $filter is passed as-is to the backend. The hook
 * best-effort maps URL filter clauses to declared UI filters and persists
 * matched values to localStorage. Unrecognised clauses are silently skipped.
 *
 * After init: UI filter state drives $filter building normally.
 */
export function useODataList({
  key,
  apiFn,
  filters: filterDefs,
  defaultOrderBy = '',
  defaultPageSize = 50,
  summaryFields = [],
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isInitRef = useRef(false);

  // Raw URL $filter captured at mount — used as-is for the initial fetch only
  const initFilterRef = useRef(new URLSearchParams(location.search).get('$filter'));

  // --- Initialization: URL → localStorage → defaults (single pass) ---
  const [state, setState] = useState(() => {
    const urlParams = new URLSearchParams(location.search);
    const ls = readLS(`odata.${key}`) || {};

    // Parse $filter from URL or localStorage — best-effort map to UI filters
    const urlFilter = urlParams.get('$filter');
    const lsFilter = ls.$filter || '';
    const activeFilter = urlFilter ?? (lsFilter || null);

    const urlFilterValues = activeFilter
      ? extractFilterValues(activeFilter, filterDefs)
      : {};

    // Build initial filter values: URL parsed > localStorage > defaults
    const filterValues = {};
    for (const def of filterDefs) {
      if (urlFilterValues[def.id] !== undefined) {
        filterValues[def.id] = urlFilterValues[def.id];
      } else if (ls.filterValues?.[def.id] !== undefined) {
        filterValues[def.id] = ls.filterValues[def.id];
      } else {
        filterValues[def.id] = def.defaultValue;
      }
    }

    // Persist matched URL filter values to localStorage
    if (urlFilter && Object.keys(urlFilterValues).length > 0) {
      writeLS(`odata.${key}`, {
        ...ls,
        filterValues: { ...(ls.filterValues || {}), ...urlFilterValues },
      });
    }

    // orderBy: URL > localStorage > default
    const orderBy = urlParams.get('$orderby') || ls.orderBy || '';

    // pageSize: URL $top > localStorage > default
    const pageSize = parseInt(urlParams.get('$top'), 10) || ls.pageSize || defaultPageSize;

    // page: derived from $skip / $top, or 1
    const skip = parseInt(urlParams.get('$skip'), 10) || 0;
    const page = Math.floor(skip / pageSize) + 1;

    return { filterValues, orderBy, page, pageSize };
  });

  const { filterValues, orderBy, page, pageSize } = state;

  // --- Data state ---
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  // --- Fetch counter for ignoring stale responses ---
  const fetchIdRef = useRef(0);

  // --- Build API params from UI state ---
  const buildApiParams = useCallback(() => {
    const params = {};

    // $filter from declared UI filters
    const filterClauses = filterDefs.map((def) => ({
      field: def.field,
      operator: def.operator,
      value: filterValues[def.id],
      type: def.type || 'string',
    }));
    const filterStr = buildFilterString(filterClauses);
    if (filterStr) params.$filter = filterStr;

    // $orderby — URL value takes precedence, else silent default
    if (orderBy) {
      params.$orderby = orderBy;
    } else if (defaultOrderBy) {
      params.$orderby = defaultOrderBy;
    }

    // Pagination
    params.$top = String(pageSize);
    params.$skip = String((page - 1) * pageSize);
    params.$count = 'true';

    // Summary
    if (summaryFields.length > 0) {
      params.$summary = summaryFields.join(',');
    }

    return params;
  }, [filterValues, orderBy, page, pageSize, filterDefs, defaultOrderBy, summaryFields]);

  // --- Fetch data with given params ---
  const doFetch = useCallback(async (params) => {
    const id = ++fetchIdRef.current;
    setLoading(true);

    try {
      const result = await apiFn(params);

      // Stale response guard
      if (id !== fetchIdRef.current) return;

      if (result && typeof result === 'object' && '@odata.count' in result) {
        setItems(result.value);
        setTotalCount(result['@odata.count']);
        setSummary(result['@odata.summary'] || {});
      } else {
        // Plain array fallback
        const arr = Array.isArray(result) ? result : [];
        setItems(arr);
        setTotalCount(arr.length);
        setSummary({});
      }
    } catch (err) {
      if (id !== fetchIdRef.current) return;
      console.error('useODataList fetch error:', err);
      setItems([]);
      setTotalCount(0);
      setSummary({});
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [apiFn]);

  // --- Sync URL when state changes (after init) ---
  useEffect(() => {
    const params = buildApiParams();

    if (!isInitRef.current) {
      isInitRef.current = true;

      // Init: pass raw URL $filter as-is to backend (overrides UI-built filter)
      if (initFilterRef.current) {
        params.$filter = initFilterRef.current;
        initFilterRef.current = null;
      }

      doFetch(params);
      return;
    }

    // Post-init: sync URL from UI state, then fetch
    const managed = {};
    if (params.$filter) managed.$filter = params.$filter;
    if (orderBy) managed.$orderby = orderBy;
    managed.$top = String(pageSize);
    managed.$skip = String((page - 1) * pageSize);

    const newSearch = buildSearch(location.search, managed);
    navigate({ search: newSearch ? `?${newSearch}` : '' }, { replace: true });

    // Persist to localStorage
    const filterStr = params.$filter || '';
    writeLS(`odata.${key}`, {
      filterValues,
      orderBy,
      pageSize,
      $filter: filterStr,
    });

    doFetch(params);
  }, [filterValues, orderBy, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Public API ---

  const getFilterValue = useCallback(
    (filterId) => filterValues[filterId],
    [filterValues]
  );

  const setFilterValues = useCallback((updates) => {
    setState((prev) => ({
      ...prev,
      filterValues: { ...prev.filterValues, ...updates },
      page: 1, // Always reset to page 1 on filter change
    }));
  }, []);

  const setPage = useCallback((p) => {
    setState((prev) => ({ ...prev, page: p }));
  }, []);

  const setPageSize = useCallback((ps) => {
    setState((prev) => ({ ...prev, pageSize: ps, page: 1 }));
  }, []);

  const setOrderBy = useCallback((ob) => {
    setState((prev) => ({ ...prev, orderBy: ob, page: 1 }));
  }, []);

  const refresh = useCallback(() => {
    doFetch(buildApiParams());
  }, [doFetch, buildApiParams]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    getFilterValue,
    setFilterValues,
    items,
    totalCount,
    loading,
    refresh,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    orderBy,
    setOrderBy,
    summary,
  };
}
