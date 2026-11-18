// 헤더 아래 빨간 띠 (T03 스펙 3.4 · 3.5). 닫을 수 없다. 둘 다 있으면 인터넷 끊김 → 자동 OFF 순서로 쌓는다.
import {
  AUTO_OFF_BANNER,
  CONNECTION_LOST_BANNER,
} from "../../shared/orders/order-texts";
import { useOrdersOptional } from "../../shared/orders/orders-context";
import { useAppShell } from "./AppShellContext";

export function StatusBanners() {
  const { state } = useAppShell();
  const orders = useOrdersOptional();
  const banners: string[] = [];
  if (state.session && orders?.connection === "reconnecting") {
    banners.push(CONNECTION_LOST_BANNER);
  }
  if (state.session && state.autoOffBanner) banners.push(AUTO_OFF_BANNER);
  if (banners.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col">
      {banners.map((text) => (
        <p
          key={text}
          role="alert"
          className="bg-red-600 px-6 py-3 text-lg font-bold text-white"
        >
          {text}
        </p>
      ))}
    </div>
  );
}
