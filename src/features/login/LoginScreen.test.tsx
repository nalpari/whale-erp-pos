import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockAuthApi,
  MOCK_ACCOUNTS,
  type AuthApi,
} from "../../shared/api/auth";
import { loadLastStoreCode } from "../../shared/session/last-store-code";
import { LoginScreen } from "./LoginScreen";

const { store, master, codes } = MOCK_ACCOUNTS;
const CODE = "점포코드 (예: ST000001)";
const STORE_PW = "매장 프로그램 비밀번호";
const ERP_ID = "웨일ERP 아이디 입력";
const ERP_PW = "웨일ERP 비밀번호 입력";
const INVALID = "! 아이디와 비밀번호가 올바르지 않습니다.";
const NETWORK = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderLogin(authApi: AuthApi = createMockAuthApi({ delayMs: 0 })) {
  const onLogin = vi.fn();
  render(<LoginScreen authApi={authApi} onLogin={onLogin} />);
  return { onLogin };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const loginButton = () => screen.getByRole("button", { name: "로그인" });
const erpTab = () =>
  screen.getByRole("tab", { name: "웨일ERP 계정으로 로그인" });
const storeTab = () => screen.getByRole("tab", { name: "점포번호로 로그인" });

function storeLogin(code: string, password: string) {
  type(CODE, code);
  type(STORE_PW, password);
  fireEvent.click(loginButton());
}

function erpLogin(id: string, password: string, code: string) {
  fireEvent.click(erpTab());
  type(ERP_ID, id);
  type(ERP_PW, password);
  type(CODE, code);
  fireEvent.click(loginButton());
}

describe("점포번호로 로그인 (스펙 3.1)", () => {
  it("처음에는 점포번호 탭, 자동로그인 해제, 로그인 버튼 비활성, 찾기 버튼 없음", () => {
    renderLogin();

    expect(storeTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByPlaceholderText(CODE)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(STORE_PW)).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("checkbox", { name: "자동로그인" }),
    ).not.toBeChecked();
    expect(loginButton()).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "점포번호 찾기" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("두 칸이 모두 차야 로그인 버튼이 활성되고, 공백만으로는 켜지지 않는다", () => {
    renderLogin();

    type(CODE, "   ");
    type(STORE_PW, "1234");
    expect(loginButton()).toBeDisabled();
    type(CODE, store.storeCode);
    expect(loginButton()).toBeEnabled();
    // Enter 제출은 submit 버튼이 있어야 브라우저에서 동작한다.
    expect(loginButton()).toHaveAttribute("type", "submit");
  });

  it("점포코드는 대문자로 바뀌고 공백이 지워지며 20자까지, 비밀번호도 20자까지(문자 제한 없음)", () => {
    renderLogin();

    type(CODE, " st000001 ");
    expect(screen.getByLabelText(CODE)).toHaveValue("ST000001");
    expect(screen.getByLabelText(CODE)).toHaveAttribute("maxlength", "20");
    type(STORE_PW, "abc가!1");
    expect(screen.getByLabelText(STORE_PW)).toHaveValue("abc가!1");
    expect(screen.getByLabelText(STORE_PW)).toHaveAttribute("maxlength", "20");
  });

  it("눈 아이콘으로 비밀번호를 보이고 가린다", () => {
    renderLogin();
    const input = screen.getByLabelText(STORE_PW);

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 숨기기" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("[로그인] 아래 안내 한 줄이 있다", () => {
    renderLogin();
    expect(
      screen.getByText(
        "점포코드와 매장 프로그램 비밀번호는 웨일ERP 점포 상세에서 확인할 수 있습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("성공하면 세션과 자동로그인 체크 여부를 넘긴다 (Enter로도 제출)", async () => {
    const { onLogin } = renderLogin();

    type(CODE, store.storeCode);
    type(STORE_PW, store.password);
    fireEvent.click(screen.getByRole("checkbox", { name: "자동로그인" }));
    fireEvent.submit(screen.getByLabelText(STORE_PW));

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ accountType: "store" }),
      true,
    );
  });

  it("소문자로 넣어도 대문자 점포코드로 로그인된다", async () => {
    const { onLogin } = renderLogin();

    storeLogin(store.storeCode.toLowerCase(), store.password);

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });
});

describe("오류 문구 6가지 (스펙 3.4)", () => {
  async function expectAlert(text: string) {
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  }

  it("틀림 (점포번호 탭)", async () => {
    renderLogin();
    storeLogin(store.storeCode, "x");
    await expectAlert(INVALID);
  });

  it("틀림 (웨일ERP 탭)", async () => {
    renderLogin();
    erpLogin(master.masterId, "x", master.storeCode);
    await expectAlert(INVALID);
  });

  it("구독하지 않은 점포 (두 탭)", async () => {
    const text = "픽업오더를 구독한 점포만 사용할 수 있습니다.";
    renderLogin();
    storeLogin(codes.notSubscribed, store.password);
    await expectAlert(text);
    erpLogin(master.masterId, master.password, codes.notSubscribed);
    await expectAlert(text);
  });

  it("웨일ERP 계정이 관리하지 않는 점포 (웨일ERP 탭)", async () => {
    renderLogin();
    erpLogin(master.masterId, master.password, codes.notManaged);
    await expectAlert("이 계정으로 관리할 수 없는 점포입니다.");
  });

  it("매장 프로그램 비밀번호 미설정 (점포번호 탭)", async () => {
    renderLogin();
    storeLogin(codes.passwordNotSet, store.password);
    await expectAlert(
      "웨일ERP 점포 상세에서 매장 프로그램 비밀번호를 먼저 설정해 주세요.",
    );
  });

  it("잠김: 문구만 보이고 버튼은 막지 않는다 (두 탭)", async () => {
    const text = "로그인이 잠겼습니다. 5분 뒤에 다시 시도해 주세요.";
    renderLogin();
    storeLogin(codes.locked, store.password);
    await expectAlert(text);
    expect(loginButton()).toBeEnabled();
    erpLogin(master.masterId, master.password, codes.locked);
    await expectAlert(text);
  });

  it("네트워크 오류는 다른 문구를 보이고, 입력값 · PC 이름을 로그에 남기지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    renderLogin(createMockAuthApi({ delayMs: 0, networkDown: true }));

    storeLogin(store.storeCode, store.password);

    await expectAlert(NETWORK);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(store.password);
    expect(logged).not.toContain(store.storeCode);
    log.mockRestore();
  });

  it("서버가 10초 동안 응답하지 않으면 네트워크 오류 문구를 보인다 (T03 스펙 3.6)", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const hanging = new Promise<never>(() => {});
      renderLogin({
        ...createMockAuthApi({ delayMs: 0 }),
        loginWithStoreCode: () => hanging,
        loginWithMaster: () => hanging,
      });

      storeLogin(store.storeCode, store.password);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_999);
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(screen.getByRole("alert")).toHaveTextContent(NETWORK);
      expect(loginButton()).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("웨일ERP 계정도 10초 동안 응답이 없으면 같은 문구를 보인다", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const hanging = new Promise<never>(() => {});
      renderLogin({
        ...createMockAuthApi({ delayMs: 0 }),
        loginWithStoreCode: () => hanging,
        loginWithMaster: () => hanging,
      });

      erpLogin(master.masterId, master.password, master.storeCode);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByRole("alert")).toHaveTextContent(NETWORK);
    } finally {
      vi.useRealTimers();
    }
  });

  it("입력을 고치면 오류 문구가 사라진다", async () => {
    renderLogin();
    storeLogin(store.storeCode, "x");
    await expectAlert(INVALID);
    type(STORE_PW, "xy");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("로그인 요청 처리", () => {
  it("요청에 PC 이름(deviceName) 인자를 넘긴다 (브라우저에서는 빈 문자열)", async () => {
    const api = createMockAuthApi({ delayMs: 0 });
    const spy = vi.spyOn(api, "loginWithStoreCode");
    renderLogin(api);

    storeLogin(store.storeCode, store.password);

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith(store.storeCode, store.password, "");
  });

  it("요청 중에는 버튼을 다시 누를 수 없다", async () => {
    const api = createMockAuthApi({ delayMs: 0 });
    const spy = vi.spyOn(api, "loginWithStoreCode");
    renderLogin(api);

    storeLogin(store.storeCode, store.password);
    fireEvent.click(loginButton());

    expect(loginButton()).toBeDisabled();
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("탭을 바꾼 뒤 늦게 온 로그인 응답은 쓰지 않고 점포코드도 기억하지 않는다", async () => {
    const { onLogin } = renderLogin(createMockAuthApi({ delayMs: 20 }));

    storeLogin(store.storeCode, store.password);
    fireEvent.click(erpTab());

    await new Promise((r) => setTimeout(r, 60));
    expect(onLogin).not.toHaveBeenCalled();
    expect(loadLastStoreCode()).toBe("");
  });
});

describe("웨일ERP 계정으로 로그인 (스펙 3.2)", () => {
  it("칸 3개, 자동로그인 없음, 세 칸이 모두 차야 로그인 활성", () => {
    renderLogin();
    fireEvent.click(erpTab());

    expect(screen.getByPlaceholderText(ERP_ID)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(ERP_PW)).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByPlaceholderText(CODE)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(loginButton()).toBeDisabled();
    type(ERP_ID, master.masterId);
    type(ERP_PW, master.password);
    expect(loginButton()).toBeDisabled();
    type(CODE, master.storeCode);
    expect(loginButton()).toBeEnabled();
  });

  it("웨일ERP 아이디가 공백뿐이면 로그인이 켜지지 않는다", () => {
    renderLogin();
    fireEvent.click(erpTab());

    type(ERP_ID, "   ");
    type(ERP_PW, master.password);
    type(CODE, master.storeCode);
    expect(loginButton()).toBeDisabled();
  });

  it("안내 줄과 [웨일ERP 열기] 버튼이 있다", () => {
    renderLogin();
    fireEvent.click(erpTab());

    expect(
      screen.getByText(
        /아이디 · 비밀번호를 잊으셨나요\? 웨일ERP에서 찾을 수 있습니다\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "웨일ERP 열기" }),
    ).toBeInTheDocument();
  });

  it("성공하면 master 세션, 자동로그인은 항상 false", async () => {
    const { onLogin } = renderLogin();

    erpLogin(master.masterId, master.password, master.storeCode);

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ accountType: "master" }),
      false,
    );
  });

  it("탭을 바꾸면 비밀번호 · 아이디와 오류 문구를 지운다", async () => {
    renderLogin();
    storeLogin(store.storeCode, "x");
    await screen.findByRole("alert");

    fireEvent.click(erpTab());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    type(ERP_ID, "abc");
    type(ERP_PW, "pw");
    fireEvent.click(storeTab());
    fireEvent.click(erpTab());

    expect(screen.getByLabelText(ERP_ID)).toHaveValue("");
    expect(screen.getByLabelText(ERP_PW)).toHaveValue("");
  });

  it("점포코드는 탭을 바꿔도, 다시 돌아와도 입력 중이던 값 그대로다", () => {
    localStorage.setItem("lastStoreCode", "ST000009");
    renderLogin();
    expect(screen.getByLabelText(CODE)).toHaveValue("ST000009");

    type(CODE, "st000007");
    fireEvent.click(erpTab());
    expect(screen.getByLabelText(CODE)).toHaveValue("ST000007");
    fireEvent.click(storeTab());
    expect(screen.getByLabelText(CODE)).toHaveValue("ST000007");
  });
});

describe("마지막 점포코드 기억 (스펙 3.3)", () => {
  it("성공하면 기억하고, 다음 로그인 화면의 두 탭에 채운다", async () => {
    const first = renderLogin();
    storeLogin(store.storeCode, store.password);
    await vi.waitFor(() => expect(first.onLogin).toHaveBeenCalledTimes(1));
    expect(loadLastStoreCode()).toBe(store.storeCode);

    cleanup();
    renderLogin();
    expect(screen.getByLabelText(CODE)).toHaveValue(store.storeCode);
    fireEvent.click(erpTab());
    expect(screen.getByLabelText(CODE)).toHaveValue(store.storeCode);
  });

  it("실패하면 기억하지 않는다", async () => {
    renderLogin();
    storeLogin(store.storeCode, "x");
    await screen.findByRole("alert");
    expect(loadLastStoreCode()).toBe("");
  });

  it("웨일ERP 탭에서 성공해도 점포코드(아이디 아님)만 기억하고, 비밀번호 · 아이디는 저장소에 남지 않는다", async () => {
    const { onLogin } = renderLogin();

    erpLogin(master.masterId, master.password, master.storeCode);

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(loadLastStoreCode()).toBe(master.storeCode);
    const stored = JSON.stringify({ ...localStorage });
    for (const secret of [master.masterId, master.password, store.password])
      expect(stored).not.toContain(secret);
  });

  it("저장소가 막혀 있어도 로그인은 된다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { onLogin } = renderLogin();

    storeLogin(store.storeCode, store.password);

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });
});
