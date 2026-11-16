// 로그인 화면: 점포 번호 탭 · 마스터 탭 + 점포번호 찾기 팝업 (화면정의서 p.8~10).
import { useCallback, useState } from "react";
import type { AccountType, AuthApi, Session } from "../../shared/api/auth";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import { TabBar } from "../../shared/ui/TabBar";
import { FindStoreCodeDialog } from "./FindStoreCodeDialog";
import { LoginForm } from "./LoginForm";

const LOGIN_TABS = [
  { id: "store", label: "점포 번호로 로그인" },
  { id: "master", label: "마스터 계정으로 로그인" },
] as const satisfies readonly { id: AccountType; label: string }[];

interface Props {
  authApi: AuthApi;
  onLogin(session: Session, remember: boolean): void;
}

export function LoginScreen({ authApi, onLogin }: Props) {
  const [tab, setTab] = useState<AccountType>("store");
  // 폼을 새로 그려 입력값을 비우기 위한 번호. 점포번호 찾기 뒤 [로그인]에서 올린다.
  const [formKey, setFormKey] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const closeFind = useCallback(() => setFindOpen(false), []);

  return (
    <section
      aria-label="로그인"
      className="flex flex-1 flex-col items-center overflow-y-auto pt-16"
    >
      {/* 팝업이 떠 있는 동안 뒤 폼은 Tab 키로도 닿지 않게 막는다. */}
      <div inert={findOpen} className="flex w-[30rem] max-w-full flex-col px-4">
        <h1 className="mb-10 text-center text-4xl font-bold">로그인</h1>
        <TabBar<AccountType>
          label="로그인 방식"
          tabs={LOGIN_TABS}
          activeId={tab}
          idPrefix="login"
          size="sub"
          onSelect={setTab}
        />
        <div
          role="tabpanel"
          id={panelId("login", tab)}
          aria-labelledby={tabId("login", tab)}
          className="pt-8"
        >
          {/* 탭을 바꾸면 key가 바뀌어 입력값과 오류 문구가 지워진다 (스펙 3.2-4). */}
          <LoginForm
            key={`${tab}-${formKey}`}
            kind={tab}
            authApi={authApi}
            onLogin={onLogin}
            onFindStoreCode={() => setFindOpen(true)}
          />
        </div>
      </div>
      {findOpen && (
        <FindStoreCodeDialog
          authApi={authApi}
          onClose={closeFind}
          onGoToLogin={() => {
            // 가려진 점포번호로는 로그인할 수 없어 칸을 비운 채 돌아간다 (스펙 3.3-7, Q12 답변 전 임시).
            setFindOpen(false);
            setTab("store");
            setFormKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}
