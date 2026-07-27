import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Text, tokens } from '@fluentui/react-components';
import { ShieldPersonRegular, ShieldErrorRegular, PersonSwapRegular } from '@fluentui/react-icons';
import { meApi } from '../api/index.js';

/**
 * Current user + permission hints from GET /api/me (multiuser authorisation).
 *
 * With AUTH_ENABLED off the server answers { enabled: false } and every can*
 * helper returns true — legacy single-user behaviour. All gating is cosmetic:
 * the server pipeline is the real enforcement point.
 *
 * The provider itself renders the awaiting-access screen for pending/disabled
 * users — placed above the layout so it also covers ?embedded=true iframes.
 */
const CurrentUserContext = createContext(null);

// Stable empties so consumers can destructure without null checks and memoised
// column factories don't re-run on every render.
const EMPTY_SET = new Set();
const EMPTY_FLS = Object.freeze({ read: EMPTY_SET, create: EMPTY_SET, update: EMPTY_SET });

const BLOCKED_COPY = {
  pending: {
    icon: ShieldPersonRegular,
    title: 'Awaiting access',
    body: 'Your account has been created and is waiting for an administrator to assign your access. Check back once you have been activated.',
  },
  disabled: {
    icon: ShieldErrorRegular,
    title: 'Account disabled',
    body: 'Your account has been disabled. Contact your administrator if you believe this is a mistake.',
  },
  unauthenticated: {
    icon: ShieldErrorRegular,
    title: 'Not authenticated',
    body: 'No identity was presented with your request. Access this application through its published address.',
  },
};

// Persistent strip shown while impersonating — rendered by the provider above
// BOTH branches (normal app AND BlockedScreen) so the Stop control is always
// reachable, including when impersonating a pending/disabled user and in
// embedded iframes. Stop clears the httpOnly cookie server-side then reloads
// (page state is scoped to the old identity — a reload is the only honest reset).
function ImpersonationBanner({ info }) {
  const stop = () => meApi.stopImpersonation().finally(() => window.location.reload());
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        backgroundColor: tokens.colorPaletteDarkOrangeBackground2,
        borderBottom: `1px solid ${tokens.colorPaletteDarkOrangeBorder1}`,
      }}
    >
      <PersonSwapRegular style={{ fontSize: 16 }} />
      <Text size={200} weight="semibold">
        Viewing as {info.email}
      </Text>
      <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
        (you are {info.by})
      </Text>
      <Button size="small" appearance="outline" onClick={stop} style={{ marginLeft: 'auto' }}>
        Stop impersonating
      </Button>
    </div>
  );
}

function BlockedScreen({ status, email }) {
  const copy = BLOCKED_COPY[status] || BLOCKED_COPY.unauthenticated;
  const Icon = copy.icon;
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: tokens.colorNeutralBackground2,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <Icon style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
      <Text size={600} weight="semibold">{copy.title}</Text>
      <Text size={300} style={{ maxWidth: 420, color: tokens.colorNeutralForeground2 }}>
        {copy.body}
      </Text>
      {email && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          Signed in as {email}
        </Text>
      )}
    </div>
  );
}

export function CurrentUserProvider({ children }) {
  const [me, setMe] = useState(null); // null = loading

  useEffect(() => {
    meApi
      .get()
      .then(setMe)
      .catch((err) => {
        if (err.status === 403) {
          setMe({ enabled: true, status: err.code || 'unauthenticated', tables: {}, actions: {} });
        } else {
          // Server unreachable or legacy build — don't block the app
          setMe({ enabled: false });
        }
      });
  }, []);

  const value = useMemo(() => {
    const enabled = me?.enabled === true;
    const tables = me?.tables || {};
    const actions = me?.actions || {};
    // Field-level security: per-table per-op hidden-field Sets from /api/me.
    // Legacy mode (enabled=false) → always the shared empty sets.
    const flsByTable = {};
    for (const [table, info] of Object.entries(tables)) {
      if (!info.fls) continue;
      flsByTable[table] = {
        read: info.fls.read?.length ? new Set(info.fls.read) : EMPTY_SET,
        create: info.fls.create?.length ? new Set(info.fls.create) : EMPTY_SET,
        update: info.fls.update?.length ? new Set(info.fls.update) : EMPTY_SET,
      };
    }
    return {
      me,
      enabled,
      canRead: (table) => !enabled || !!tables[table]?.read,
      canCreate: (table) => !enabled || !!tables[table]?.create,
      canUpdate: (table) => !enabled || !!tables[table]?.update,
      canDelete: (table) => !enabled || !!tables[table]?.delete,
      canAction: (table, action) => !enabled || (actions[table] || []).includes(action),
      fls: (table) => (enabled && flsByTable[table]) || EMPTY_FLS,
    };
  }, [me]);

  if (me === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner label="Loading..." />
      </div>
    );
  }

  if (me.enabled && me.status !== 'active') {
    return (
      <>
        {me.impersonating && <ImpersonationBanner info={me.impersonating} />}
        <BlockedScreen status={me.status} email={me.email} />
      </>
    );
  }

  return (
    <CurrentUserContext.Provider value={value}>
      {me.impersonating && <ImpersonationBanner info={me.impersonating} />}
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
