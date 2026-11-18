// 프린터설정 화면 문구. 칸 라벨과 안내 세 줄은 화면정의서 p.19 원문 그대로다.
// 저장 토스트 · 용지 폭 · 주문서 프린터 없음 안내는 기획자 Q45 문구다.
// 시험 인쇄 · 용도 입력 · 프린터 선택 팝업 · 오류 문구는 2026-11-17 결정 문구다 (스펙 2장, 8장).
export const PRINTER_TEXTS = {
  noPrinter: "프린터 없음",
  notFound: "(찾을 수 없음)",
  addPrinter: "+ 프린터 추가",
  purposePlaceholder: "용도 입력",
  printItems: "출력 항목",
  printOrder: "주문서",
  printReceipt: "영수증 (고객 요청 시)",
  testPrint: "시험 인쇄",
  disconnect: "연결 해제",
  pickerTitle: "프린터 선택",
  cancel: "취소",
  noInstalledPrinters: "설치된 프린터가 없습니다.",
  listFailed: "프린터 목록을 불러올 수 없습니다.",
  testPrintSent: "시험 인쇄를 보냈습니다.",
  testPrintFailed:
    "시험 인쇄에 실패했습니다. 프린터 연결과 드라이버를 확인해 주세요.",
  saveFailed: "설정을 저장하지 못했습니다.",
  loadFailed: "설정을 불러오지 못했습니다.",
  paperWidth: "용지 폭",
  saved: "저장되었습니다",
  noOrderPrinter:
    "주문서를 출력할 프린터가 없습니다. 주문을 접수해도 주문서가 출력되지 않습니다.",
  guideTitle: "프린터 추가 방법",
  guideLines: [
    "① 프린터를 USB 또는 네트워크로 PC에 연결합니다",
    "② Windows 프린터 드라이버를 설치합니다",
    "③ '+ 프린터 추가' 버튼 클릭 → 목록에서 해당 프린터를 선택합니다",
  ],
} as const;
