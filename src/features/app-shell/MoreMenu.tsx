// 더보기(⋮) 메뉴: 새로고침 · 다시시작 · 로그아웃 · 프로그램 종료 · 창 제어 · 로그 확인을 아이콘 칸으로 둔다 (스펙 2.4, Q05 · Q06).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toast } from "../../shared/ui/Toast";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { useOrdersOptional } from "../../shared/orders/orders-context";
import { useAppShell } from "./AppShellContext";
import {
  LogIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoreIcon,
  PowerIcon,
  RefreshIcon,
  RestartIcon,
  RestoreIcon,
  UserIcon,
} from "./Icons";

interface Item {
  label: string;
  icon: ReactNode;
  /** 빨간 아이콘 (프로그램 종료). */
  danger?: boolean;
  onSelect(): void;
}

export function MoreMenu() {
  const { state, actions, maximized } = useAppShell();
  // OrdersProvider가 없는 테스트에서는 null이다. 그때는 새로고침을 보이지 않는다.
  const orders = useOrdersOptional();
  // [새로고침] 실패 문구 (T03 사용자 결정 C-1). 공용 Toast가 2초 뒤 스스로 닫는다.
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴를 열면 첫 항목으로 초점을 옮긴다 (키보드 사용 시).
  useEffect(() => {
    if (open)
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    // capture 단계에서 듣는다. Tauri의 drag.js가 헤더(끌기 영역) mousedown에서
    // stopImmediatePropagation을 불러, bubble 단계로는 헤더 빈 곳 클릭이 오지 않는다.
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 스펙 2.4 순서. 새로고침은 로그인한 뒤 주문 수신(OrdersProvider)이 있을 때만 있다 (T03 스펙 4장, Q05).
  // 로그인 전에는 로그아웃할 대상이 없으므로 숨긴다. 로그 확인은 로그인 문제를 볼 수 있게 로그인 전에도 · 두 계정 모두 쓸 수 있다 (개발자 추가 기능, SPEC-logging 3.1).
  const items: Item[] = [
    ...(state.session && orders
      ? [
          {
            label: "새로고침",
            icon: <RefreshIcon />,
            // 주문 목록을 서버에서 다시 받는다. 로그인 · 창 · 주문받기는 그대로다 (Q05). 연결이 끊겨 있으면 바로 다시 연결을 시도하고, 그때는 주문받기가 서버 값으로 맞춰질 수 있다.
            onSelect: () =>
              void orders.refresh().then((ok) => {
                if (!ok) setRefreshFailed(true);
              }),
          },
        ]
      : []),
    {
      label: "다시시작",
      icon: <RestartIcon />,
      onSelect: () => actions.openDialog("restart"),
    },
    ...(state.session
      ? [
          {
            label: "로그아웃",
            icon: <UserIcon />,
            onSelect: () => actions.openDialog("logout"),
          },
        ]
      : []),
    {
      label: "프로그램 종료",
      icon: <PowerIcon />,
      danger: true,
      onSelect: () => actions.openDialog("exit"),
    },
    {
      label: "창 최소화",
      icon: <MinimizeIcon />,
      onSelect: actions.minimizeWindow,
    },
    // 지금 상태에 따라 하나만 보인다.
    maximized
      ? {
          label: "창 줄이기",
          icon: <RestoreIcon />,
          onSelect: actions.restoreWindow,
        }
      : {
          label: "창 늘리기",
          icon: <MaximizeIcon />,
          onSelect: actions.maximizeWindow,
        },
    {
      label: "로그 확인",
      icon: <LogIcon />,
      onSelect: actions.openLogViewer,
    },
  ];

  return (
    <div ref={rootRef} className="relative">
      {refreshFailed && (
        <Toast
          message={ORDER_MESSAGES.failed}
          onClose={() => setRefreshFailed(false)}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-12 items-center justify-center rounded-lg text-gray-200 hover:bg-white/10"
      >
        <MoreIcon />
      </button>
      {open && (
        // 메뉴는 헤더(끌기 영역) 안에 있다. 버튼 사이 여백을 눌러도 창이 끌려가지 않게 끌기 영역에서 뺀다.
        <div
          ref={menuRef}
          data-tauri-drag-region="false"
          role="menu"
          aria-label="더보기"
          className="absolute top-full right-0 z-40 mt-2 flex gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex w-24 flex-col items-center gap-2 rounded-xl py-3 text-base text-gray-800 hover:bg-gray-100"
            >
              <span
                aria-hidden="true"
                className={`flex size-12 items-center justify-center rounded-xl bg-gray-100 ${
                  item.danger ? "text-red-500" : "text-gray-600"
                }`}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
