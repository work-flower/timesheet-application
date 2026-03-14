import { createContext, useContext, useState } from 'react';

const EmbeddedContext = createContext(false);

export function EmbeddedProvider({ children }) {
  const [isEmbedded] = useState(
    () => new URLSearchParams(window.location.search).get('embedded') === 'true'
  );
  return (
    <EmbeddedContext.Provider value={isEmbedded}>
      {children}
    </EmbeddedContext.Provider>
  );
}

export function useEmbedded() {
  return useContext(EmbeddedContext);
}
