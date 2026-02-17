interface InfoTooltipProps {
  message: string;
  ariaLabel: string;
  buttonClassName?: string;
  tooltipClassName?: string;
}

export function InfoTooltip({
  message,
  ariaLabel,
  buttonClassName,
  tooltipClassName,
}: InfoTooltipProps) {
  return (
    <span className="relative inline-flex items-center group">
      <button
        type="button"
        aria-label={ariaLabel}
        className={
          buttonClassName ??
          "inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        }
      >
        i
      </button>
      <span
        role="tooltip"
        className={
          tooltipClassName ??
          "pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-[11px] leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        }
      >
        {message}
      </span>
    </span>
  );
}
