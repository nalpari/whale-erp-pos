// "로그 확인" 화면 (스펙 3.2). 개발자가 추가한 화면이라 화면정의서에 없고, 문구는 모두 임시다.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { errorSummary } from "../../shared/error-summary";
import { getLogSendFailure } from "../../shared/log/log";
import type { LogApi } from "../../shared/log/log-api";

const LINES = 200;
const BUTTON =
  "h-14 rounded-xl border border-gray-300 px-6 text-xl text-gray-800 active:bg-gray-100";

interface Props {
  logApi: LogApi;
  onClose(): void;
}

export function LogViewerScreen({ logApi, onClose }: Props) {
  const [path, setPath] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [readFailed, setReadFailed] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const mountedRef = useRef(true);
  // 늦게 온 응답이 더 최근 요청의 결과를 덮지 않게 한다.
  const seqRef = useRef(0);

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    logApi.readRecent(LINES).then(
      (result) => {
        if (!mountedRef.current || seq !== seqRef.current) return;
        setPath(result.path);
        setLines(result.lines);
        setReadFailed(false);
      },
      (e: unknown) => {
        console.error("[log-viewer] 로그 읽기 실패", errorSummary(e));
        if (!mountedRef.current || seq !== seqRef.current) return;
        setReadFailed(true);
      },
    );
  }, [logApi]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // 가장 최근 줄이 보이게 내용이 바뀔 때마다 맨 아래로 내린다.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function openDir() {
    setOpenFailed(false);
    logApi.openDir().catch((e: unknown) => {
      console.error("[log-viewer] 로그 폴더 열기 실패", errorSummary(e));
      if (mountedRef.current) setOpenFailed(true);
    });
  }

  return (
    <section
      aria-label="로그 확인"
      className="flex min-h-0 flex-1 flex-col gap-4 p-6"
    >
      <h1 className="text-3xl font-bold text-gray-900">로그 확인</h1>
      {path !== null && (
        <p className="text-lg break-all text-gray-700">{`로그 위치: ${path}`}</p>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={openDir} className={BUTTON}>
          로그 폴더 열기
        </button>
        <button type="button" onClick={load} className={BUTTON}>
          새로고침
        </button>
        <button type="button" onClick={onClose} className={`${BUTTON} ml-auto`}>
          닫기
        </button>
      </div>
      {openFailed && (
        <p role="alert" className="text-lg text-red-700">
          로그 폴더를 열 수 없습니다.
        </p>
      )}
      {readFailed && (
        <p role="alert" className="text-lg text-red-700">
          로그를 불러올 수 없습니다.
        </p>
      )}
      {getLogSendFailure() && (
        <p role="alert" className="text-lg text-red-700">
          화면 로그를 기록하지 못하고 있습니다. 개발자에게 알려 주세요.
        </p>
      )}
      {!readFailed && path !== null && lines.length === 0 && (
        <p className="text-lg text-gray-500">아직 기록된 로그가 없습니다.</p>
      )}
      <pre
        ref={logRef}
        aria-label="최근 로그"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto rounded-xl bg-gray-900 p-4 font-mono text-sm break-words whitespace-pre-wrap text-gray-100"
      >
        {lines.join("\n")}
      </pre>
    </section>
  );
}
