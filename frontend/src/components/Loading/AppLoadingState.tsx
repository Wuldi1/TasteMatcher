import type { ReactNode } from "react";

type AppLoadingStateProps = {
  message?: string;
  fullScreen?: boolean;
  compact?: boolean;
  className?: string;
  iconSize?: "sm" | "md";
  footer?: ReactNode;
};

type AppInlineLoaderProps = {
  label?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  theme?: "default" | "light";
};

const APP_ICON_SRC = `${process.env.PUBLIC_URL ?? ""}/tastematcher_icon_icon_128.png`;

const joinClasses = (...classes: Array<string | undefined | false>) =>
  classes.filter(Boolean).join(" ");

export function AppInlineLoader({
  label,
  size = "sm",
  className,
  theme = "default",
}: AppInlineLoaderProps) {
  const spinnerBoxClasses =
    size === "xs"
      ? "relative h-4 w-4 flex items-center justify-center"
      : size === "sm"
        ? "relative h-5 w-5 flex items-center justify-center"
        : size === "md"
          ? "relative h-6 w-6 flex items-center justify-center"
          : "relative h-12 w-12 flex items-center justify-center";
  const ringClasses = joinClasses(
    "app-loading-ring absolute inset-0 animate-spin rounded-full border-2",
    theme === "light" && "app-loading-ring--light",
  );
  const textClasses = theme === "light" ? "text-white/90" : "text-gray-600";

  return (
    <span
      role="status"
      aria-live="polite"
      className={joinClasses(
        "inline-flex items-center gap-2",
        textClasses,
        className,
      )}
    >
      <span className={spinnerBoxClasses}>
        <span className={ringClasses} aria-hidden="true" />
        <span
          className="app-loading-mark app-loading-mark--inline"
          aria-hidden="true"
        >
          <img
            src={APP_ICON_SRC}
            alt=""
            className="h-full w-full object-cover"
          />
        </span>
      </span>
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </span>
  );
}

export function AppLoadingState({
  message = "Loading...",
  fullScreen = false,
  compact = false,
  className,
  iconSize = "md",
  footer,
}: AppLoadingStateProps) {
  const wrapperClasses = fullScreen
    ? "min-h-screen"
    : compact
      ? "py-2"
      : "py-12";

  const iconBoxClasses =
    iconSize === "sm"
      ? "relative h-12 w-12 flex items-center justify-center"
      : "relative h-16 w-16 flex items-center justify-center";
  return (
    <div
      role="status"
      aria-live="polite"
      className={joinClasses(
        "app-loading-state flex items-center justify-center text-gray-600",
        wrapperClasses,
        className,
      )}
    >
      <div className="app-loading-state__content flex flex-col items-center gap-3">
        <div className={iconBoxClasses}>
          <span
            className="app-loading-ring absolute inset-0 animate-spin rounded-full border-2"
            aria-hidden="true"
          />
          <span
            className="app-loading-mark"
            aria-hidden="true"
            data-testid="tastematcher-loading-mark"
          >
            <img
              src={APP_ICON_SRC}
              alt=""
              data-testid="tastematcher-loading-logo"
              className="h-full w-full object-cover"
            />
          </span>
        </div>
        <p className="text-sm font-medium text-gray-700">{message}</p>
        {footer ? <div className="text-xs text-gray-500">{footer}</div> : null}
      </div>
    </div>
  );
}
