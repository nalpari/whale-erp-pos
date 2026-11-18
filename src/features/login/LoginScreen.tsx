// 로그인 화면: 점포번호 탭 · 웨일ERP 계정 탭 (화면정의서 p.8~9, 기획자 Q09~Q15).
import { useState } from "react";
import type { AccountType, AuthApi, Session } from "../../shared/api/auth";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import { TabBar } from "../../shared/ui/TabBar";
import { loadLastStoreCode } from "../../shared/session/last-store-code";
import { LoginForm } from "./LoginForm";

const LOGIN_TABS = [
  { id: "store", label: "점포번호로 로그인" },
  { id: "master", label: "웨일ERP 계정으로 로그인" },
] as const satisfies readonly { id: AccountType; label: string }[];

interface Props {
  authApi: AuthApi;
  onLogin(session: Session, remember: boolean): void;
}

export function LoginScreen({ authApi, onLogin }: Props) {
  const [tab, setTab] = useState<AccountType>("store");
  // 처음 열릴 때만 기억한 점포코드로 채운다. 탭을 바꿔도 입력 중이던 값을 그대로 둔다 (스펙 3.2-4, 3.3).
  const [storeCode, setStoreCode] = useState(loadLastStoreCode);

  return (
    <section
      aria-label="로그인"
      className="flex flex-1 flex-col items-center overflow-y-auto pt-16"
    >
      <div className="flex w-[30rem] max-w-full flex-col px-4">
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
          {/* 탭을 바꾸면 key가 바뀌어 아이디 · 비밀번호와 오류 문구가 지워진다. 점포코드는 위에서 들고 있어 남는다 (스펙 3.2-4). */}
          <LoginForm
            key={tab}
            kind={tab}
            authApi={authApi}
            storeCode={storeCode}
            onStoreCodeChange={setStoreCode}
            onLogin={onLogin}
          />
        </div>
      </div>
    </section>
  );
}
