import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createMockAuthApi,
  MOCK_ACCOUNTS,
  type AuthApi,
} from "../../shared/api/auth";
import { LoginScreen } from "./LoginScreen";

const { store, master, owner } = MOCK_ACCOUNTS;
const INVALID = "! 아이디와 비밀번호가 올바르지 않습니다.";
const NETWORK = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";

function renderLogin(authApi: AuthApi = createMockAuthApi({ delayMs: 0 })) {
  const onLogin = vi.fn();
  render(<LoginScreen authApi={authApi} onLogin={onLogin} />);
  return { onLogin };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const loginButton = () => screen.getByRole("button", { name: "로그인" });
const masterTab = () =>
  screen.getByRole("tab", { name: "마스터 계정으로 로그인" });

describe("점포 번호로 로그인 (스펙 3.1)", () => {
  it("처음에는 점포 번호 탭, 자동로그인 해제, 로그인 버튼 비활성", () => {
    renderLogin();

    expect(
      screen.getByRole("tab", { name: "점포 번호로 로그인" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByPlaceholderText("점포 고유번호")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("대표 휴대폰 번호")).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("checkbox", { name: "자동로그인" }),
    ).not.toBeChecked();
    expect(loginButton()).toBeDisabled();
  });

  it("두 칸이 모두 차야 로그인 버튼이 활성된다", () => {
    renderLogin();

    type("점포 고유번호", store.storeCode);
    expect(loginButton()).toBeDisabled();
    type("대표 휴대폰 번호", store.phone);
    expect(loginButton()).toBeEnabled();
  });

  it("휴대폰 번호는 숫자만 남는다 (붙여 넣은 하이픈 · 글자 제거)", () => {
    renderLogin();

    type("대표 휴대폰 번호", "010-12ab34");
    expect(screen.getByLabelText("대표 휴대폰 번호")).toHaveValue("0101234");
    type("대표 휴대폰 번호", "abc");
    expect(screen.getByLabelText("대표 휴대폰 번호")).toHaveValue("");
  });

  it("눈 아이콘으로 휴대폰 번호를 보이고 가린다", () => {
    renderLogin();
    const input = screen.getByLabelText("대표 휴대폰 번호");

    fireEvent.click(screen.getByRole("button", { name: "비밀번호 보기" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 숨기기" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("성공하면 세션과 자동로그인 체크 여부를 넘긴다 (Enter로도 제출)", async () => {
    const { onLogin } = renderLogin();

    type("점포 고유번호", store.storeCode);
    type("대표 휴대폰 번호", store.phone);
    fireEvent.click(screen.getByRole("checkbox", { name: "자동로그인" }));
    fireEvent.submit(screen.getByLabelText("대표 휴대폰 번호"));

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ accountType: "store" }),
      true,
    );
  });

  it("실패하면 원문 문구를 보이고, 입력을 고치면 지운다", async () => {
    const { onLogin } = renderLogin();

    type("점포 고유번호", store.storeCode);
    type("대표 휴대폰 번호", "01099999999");
    fireEvent.click(loginButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(INVALID);
    expect(onLogin).not.toHaveBeenCalled();
    type("대표 휴대폰 번호", "0109999999");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("네트워크 오류는 비밀번호 오류와 다른 문구를 보이고, 휴대폰 번호를 로그에 남기지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    renderLogin(createMockAuthApi({ delayMs: 0, networkDown: true }));

    type("점포 고유번호", store.storeCode);
    type("대표 휴대폰 번호", store.phone);
    fireEvent.click(loginButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK);
    expect(JSON.stringify(log.mock.calls)).not.toContain(store.phone);
    log.mockRestore();
  });
});

describe("로그인 요청 처리", () => {
  it("아이디 앞뒤 공백은 지우고 보낸다 (붙여 넣기 대비)", async () => {
    const { onLogin } = renderLogin();

    type("점포 고유번호", `  ${store.storeCode} `);
    type("대표 휴대폰 번호", store.phone);
    fireEvent.click(loginButton());

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });

  it("공백만 넣으면 로그인 버튼이 켜지지 않는다", () => {
    renderLogin();

    type("점포 고유번호", "   ");
    type("대표 휴대폰 번호", store.phone);
    expect(loginButton()).toBeDisabled();
  });

  it("요청 중에는 버튼을 다시 누를 수 없다", () => {
    const api = createMockAuthApi({ delayMs: 0 });
    const spy = vi.spyOn(api, "loginWithStoreCode");
    renderLogin(api);

    type("점포 고유번호", store.storeCode);
    type("대표 휴대폰 번호", store.phone);
    fireEvent.click(loginButton());
    fireEvent.click(loginButton());

    expect(loginButton()).toBeDisabled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("탭을 바꾼 뒤 늦게 온 로그인 응답은 쓰지 않는다", async () => {
    const api = createMockAuthApi({ delayMs: 20 });
    const { onLogin } = renderLogin(api);

    type("점포 고유번호", store.storeCode);
    type("대표 휴대폰 번호", store.phone);
    fireEvent.click(loginButton());
    fireEvent.click(masterTab());

    await new Promise((r) => setTimeout(r, 40));
    expect(onLogin).not.toHaveBeenCalled();
  });
});

describe("마스터 계정으로 로그인 (스펙 3.2)", () => {
  it("자동로그인 · 점포번호 찾기가 보이지 않는다", () => {
    renderLogin();

    fireEvent.click(masterTab());

    expect(
      screen.getByPlaceholderText("마스터 아이디 입력"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("마스터 비밀번호 입력")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "점포번호 찾기" }),
    ).not.toBeInTheDocument();
  });

  it("성공하면 master 세션, 자동로그인은 항상 false", async () => {
    const { onLogin } = renderLogin();
    fireEvent.click(masterTab());

    type("마스터 아이디 입력", master.masterId);
    type("마스터 비밀번호 입력", master.password);
    fireEvent.click(loginButton());

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ accountType: "master" }),
      false,
    );
  });

  it("실패 문구는 점포 번호 탭과 같다", async () => {
    renderLogin();
    fireEvent.click(masterTab());

    type("마스터 아이디 입력", master.masterId);
    type("마스터 비밀번호 입력", "wrong");
    fireEvent.click(loginButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(INVALID);
  });

  it("탭을 바꾸면 입력값과 오류 문구를 지운다", async () => {
    renderLogin();
    type("점포 고유번호", store.storeCode);
    type("대표 휴대폰 번호", "01099999999");
    fireEvent.click(loginButton());
    await screen.findByRole("alert");

    fireEvent.click(masterTab());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    type("마스터 아이디 입력", "abc");
    fireEvent.click(screen.getByRole("tab", { name: "점포 번호로 로그인" }));

    expect(screen.getByLabelText("점포 고유번호")).toHaveValue("");
    expect(screen.getByLabelText("대표 휴대폰 번호")).toHaveValue("");
    fireEvent.click(masterTab());
    expect(screen.getByLabelText("마스터 아이디 입력")).toHaveValue("");
  });
});

describe("점포번호 찾기 팝업 (스펙 3.3)", () => {
  function openFind() {
    fireEvent.click(screen.getByRole("button", { name: "점포번호 찾기" }));
    return screen.getByRole("dialog", { name: "점포번호 찾기" });
  }

  it("안내 문구와 입력 칸, 두 칸이 차야 찾기 활성", () => {
    renderLogin();
    const dialog = openFind();

    expect(
      within(dialog).getByText(
        "파트너오피스에 등록된 대표 이메일로 점포번호를 찾을 수 있습니다.",
      ),
    ).toBeInTheDocument();
    const find = within(dialog).getByRole("button", { name: "점포번호 찾기" });
    expect(find).toBeDisabled();
    type("대표자 이름 입력", owner.name);
    expect(find).toBeDisabled();
    type("대표 이메일 입력", owner.email);
    expect(find).toBeEnabled();
  });

  it("실패하면 두 줄 문구를 보인다", async () => {
    renderLogin();
    const dialog = openFind();

    type("대표자 이름 입력", owner.name);
    type("대표 이메일 입력", "nobody@example.com");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "점포번호 찾기" }),
    );

    const alert = await within(dialog).findByRole("alert");
    expect(
      within(alert)
        .getAllByText(/./)
        .map((p) => p.textContent),
    ).toEqual([
      "파트너오피스에 일치하는 정보가 없습니다.",
      "대표자 이름과 이메일을 확인 후 다시 시도해 주세요.",
    ]);
  });

  async function findSuccessfully() {
    const dialog = openFind();
    type("대표자 이름 입력", owner.name);
    type("대표 이메일 입력", owner.email);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "점포번호 찾기" }),
    );
    await within(dialog).findByRole("heading", { name: "점포번호 찾기 완료" });
    return dialog;
  }

  it("성공하면 완료 상태: 점포명 안내, 가린 점포번호, [로그인] [닫기]", async () => {
    renderLogin();
    const dialog = await findSuccessfully();

    expect(dialog).toHaveTextContent(
      "모의 점포 (개발용) 님의 점포번호 찾기가 완료되었습니다.",
    );
    expect(within(dialog).getByText("HC-1***4-PO")).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["×", "로그인", "닫기"]);
  });

  it("완료 상태의 [로그인]: 팝업을 닫고 점포 번호 탭으로, 칸은 비운다", async () => {
    renderLogin();
    type("점포 고유번호", "typed-before");
    const dialog = await findSuccessfully();

    fireEvent.click(within(dialog).getByRole("button", { name: "로그인" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "점포 번호로 로그인" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("점포 고유번호")).toHaveValue("");
  });

  it("[닫기]로 완료 팝업을 닫는다", async () => {
    renderLogin();
    const dialog = await findSuccessfully();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["취소", "팝업 닫기"])(
    "[%s]로 팝업을 닫고 입력값은 그대로 둔다",
    (name) => {
      renderLogin();
      type("점포 고유번호", "typed-before");
      const dialog = openFind();

      fireEvent.click(within(dialog).getByRole("button", { name }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByLabelText("점포 고유번호")).toHaveValue(
        "typed-before",
      );
    },
  );

  it("네트워크 오류는 로그인과 같은 문구를 보인다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    renderLogin(createMockAuthApi({ delayMs: 0, networkDown: true }));
    const dialog = openFind();

    type("대표자 이름 입력", owner.name);
    type("대표 이메일 입력", owner.email);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "점포번호 찾기" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(NETWORK);
    expect(JSON.stringify(log.mock.calls)).not.toContain(owner.email);
    log.mockRestore();
  });

  it("Escape로 닫고, 초점은 [점포번호 찾기] 버튼으로 돌아온다", () => {
    renderLogin();
    const opener = screen.getByRole("button", { name: "점포번호 찾기" });
    opener.focus();
    openFind();

    fireEvent.keyDown(screen.getByLabelText("대표자 이름 입력"), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
