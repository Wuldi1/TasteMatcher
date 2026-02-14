import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

export type SearchableSelectProps = {
  id: string;
  ariaLabel?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function SearchableSelect({
  id,
  ariaLabel,
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedOption?.label ?? "");
    }
  }, [open, selectedOption?.label]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    const lowered = query.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(lowered) ||
        option.value.toLowerCase().includes(lowered),
    );
  }, [options, query]);

  const handleSelect = (option: SearchableSelectOption) => {
    setQuery(option.label);
    setOpen(false);
    onChange(option.value || undefined);
  };

  const listboxId = `${id}-listbox`;
  const showClearButton = !disabled && (query.length > 0 || !!value);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value === "") {
            onChange(undefined);
          }
        }}
        className={`${className ?? ""} ${showClearButton ? "pr-9" : ""}`}
      />
      {showClearButton && (
        <button
          type="button"
          aria-label="Clear selection"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery("");
            setOpen(false);
            onChange(undefined);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-2 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              No matches found
            </div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(option)}
                className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                  option.value === value
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
