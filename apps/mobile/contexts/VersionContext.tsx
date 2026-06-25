import { createContext, useContext } from 'react';

type VersionContextType = {
  hasOtaPending: boolean;
  showOtaPrompt: () => void;
};

export const VersionContext = createContext<VersionContextType>({
  hasOtaPending: false,
  showOtaPrompt: () => {},
});

export const useVersion = () => useContext(VersionContext);
