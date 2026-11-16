// 주문 받기 토글. 확인 팝업은 호출하는 쪽(AppShellContext)이 띄운다 (화면정의서 p.5).
interface Props {
  accepting: boolean;
  pending: boolean;
  onRequestChange(next: boolean): void;
}

export function OrderAcceptToggle({
  accepting,
  pending,
  onRequestChange,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={accepting}
      aria-label="주문 받기"
      disabled={pending}
      onClick={() => onRequestChange(!accepting)}
      className="flex h-12 items-center gap-3 rounded-lg px-3 text-lg font-bold hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
    >
      <span className={accepting ? "text-green-400" : "text-gray-400"}>
        주문 받기
      </span>
      <span
        aria-hidden="true"
        className={`relative h-8 w-14 rounded-full transition-colors ${
          accepting ? "bg-green-500" : "bg-gray-500"
        }`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white transition-all ${
            accepting ? "left-7" : "left-1"
          }`}
        />
      </span>
      <span
        className={`w-10 text-left ${accepting ? "text-green-400" : "text-gray-400"}`}
      >
        {accepting ? "ON" : "OFF"}
      </span>
    </button>
  );
}
