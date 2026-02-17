import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type Currency = "USD" | "EUR" | "GBP";
export type DimensionUnit = "in" | "cm";

interface ViewerPreferences {
  currency: Currency;
  dimensionUnit: DimensionUnit;
  setCurrency: (currency: Currency) => void;
  setDimensionUnit: (dimensionUnit: DimensionUnit) => void;
}

const VIEWER_PREFERENCES_KEY = "tm.viewerPreferences.v1";

const ViewerPreferencesContext = createContext<ViewerPreferences | undefined>(
  undefined,
);

const isCurrency = (value: unknown): value is Currency =>
  value === "USD" || value === "EUR" || value === "GBP";

const isDimensionUnit = (value: unknown): value is DimensionUnit =>
  value === "in" || value === "cm";

const readStoredPreferences = (): Pick<
  ViewerPreferences,
  "currency" | "dimensionUnit"
> => {
  try {
    const raw = localStorage.getItem(VIEWER_PREFERENCES_KEY);
    if (!raw) {
      return { currency: "USD", dimensionUnit: "in" };
    }
    const parsed = JSON.parse(raw) as {
      currency?: unknown;
      dimensionUnit?: unknown;
    };

    return {
      currency: isCurrency(parsed.currency) ? parsed.currency : "USD",
      dimensionUnit: isDimensionUnit(parsed.dimensionUnit)
        ? parsed.dimensionUnit
        : "in",
    };
  } catch {
    return { currency: "USD", dimensionUnit: "in" };
  }
};

export function ViewerPreferencesProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(
    () => readStoredPreferences().currency,
  );
  const [dimensionUnit, setDimensionUnitState] = useState<DimensionUnit>(
    () => readStoredPreferences().dimensionUnit,
  );

  const setCurrency = useCallback((nextCurrency: Currency) => {
    setCurrencyState(nextCurrency);
    try {
      localStorage.setItem(
        VIEWER_PREFERENCES_KEY,
        JSON.stringify({ currency: nextCurrency, dimensionUnit }),
      );
    } catch {
      // no-op: storage might be unavailable
    }
  }, [dimensionUnit]);

  const setDimensionUnit = useCallback((nextDimensionUnit: DimensionUnit) => {
    setDimensionUnitState(nextDimensionUnit);
    try {
      localStorage.setItem(
        VIEWER_PREFERENCES_KEY,
        JSON.stringify({ currency, dimensionUnit: nextDimensionUnit }),
      );
    } catch {
      // no-op: storage might be unavailable
    }
  }, [currency]);

  const value = useMemo(
    () => ({ currency, dimensionUnit, setCurrency, setDimensionUnit }),
    [currency, dimensionUnit, setCurrency, setDimensionUnit],
  );

  return (
    <ViewerPreferencesContext.Provider value={value}>
      {children}
    </ViewerPreferencesContext.Provider>
  );
}

export function useViewerPreferences() {
  const context = useContext(ViewerPreferencesContext);
  if (!context) {
    throw new Error(
      "useViewerPreferences must be used within a ViewerPreferencesProvider",
    );
  }
  return context;
}
