import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useViewerPreferences } from "../../contexts/ViewerPreferencesContext";

export function ViewerPreferencesControls({
  defaultExpanded = false,
  tone = "default",
}: {
  defaultExpanded?: boolean;
  tone?: "default" | "inverse";
}) {
  const { currency, dimensionUnit, setCurrency, setDimensionUnit } =
    useViewerPreferences();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className={`viewer-preferences viewer-preferences--${tone} rounded-lg border border-gray-200 bg-white`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={isExpanded}
      >
        <span className="viewer-preferences__title text-xs font-medium text-gray-600">
          Display Settings
        </span>
        <div className="viewer-preferences__summary inline-flex items-center gap-2 text-[11px] text-gray-500">
          <span>{currency}</span>
          <span>/</span>
          <span>{dimensionUnit.toUpperCase()}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="viewer-preferences__expanded border-t border-gray-100 px-3 pb-3 pt-2">
          <div className="mb-3">
            <p className="viewer-preferences__label mb-1 text-[11px] font-medium text-gray-500">
              Currency
            </p>
            <div
              className="flex gap-1.5"
              role="group"
              aria-label="Select currency"
            >
              {(["USD", "EUR", "GBP"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrency(item)}
                  className={`viewer-preferences__option px-2 py-1 text-xs rounded-md border transition-colors ${
                    currency === item
                      ? "viewer-preferences__option--selected bg-gray-900/5 text-gray-700 border-gray-300"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                  aria-pressed={currency === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="viewer-preferences__label mb-1 text-[11px] font-medium text-gray-500">
              Dimensions
            </p>
            <div
              className="flex gap-1.5"
              role="group"
              aria-label="Select dimensions unit"
            >
              {(
                [
                  { value: "in", label: "IN" },
                  { value: "cm", label: "CM" },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDimensionUnit(item.value)}
                  className={`viewer-preferences__option px-2 py-1 text-xs rounded-md border transition-colors ${
                    dimensionUnit === item.value
                      ? "viewer-preferences__option--selected bg-gray-900/5 text-gray-700 border-gray-300"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                  aria-pressed={dimensionUnit === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
