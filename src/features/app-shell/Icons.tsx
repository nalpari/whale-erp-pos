// 아이콘 라이브러리를 추가하지 않기 위해 필요한 것만 인라인 SVG로 둔다.
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-7"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const MinimizeIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);

export const RestoreIcon = () => (
  <Icon>
    <path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" />
  </Icon>
);

export const MaximizeIcon = () => (
  <Icon>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </Icon>
);

export const PowerIcon = () => (
  <Icon>
    <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0" />
  </Icon>
);

export const LogIcon = () => (
  <Icon>
    <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" />
  </Icon>
);

export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const StoreIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
    aria-hidden="true"
  >
    <path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v0a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8M10 20v-5h4v5" />
  </svg>
);

export const MoreIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="size-7"
    aria-hidden="true"
  >
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);
