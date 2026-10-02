import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "물류·풀필먼트 도메인 4년 차 백엔드 개발자 최지율(beatmeJY)의 포트폴리오입니다. 장애 격리, 분산 환경 동시성, 이벤트 기반 책임 분리, 대용량 처리 최적화 경험을 사례로 정리했습니다.",
  alternates: { canonical: "/about/" },
};

/** 문자열 안의 `코드` 표기를 <code>로 렌더링한다. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={index}
            className="rounded bg-code-bg px-1 py-0.5 text-[0.9em] text-[color:var(--code-inline-fg)]"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 text-sm text-muted">{description}</p>
      ) : null}
    </div>
  );
}

const stats = [
  { value: "4년 차", label: "백엔드 개발자" },
  { value: "물류 · 풀필먼트", label: "주력 도메인" },
  { value: "WMS 자체 구축", label: "입고부터 모든 공정" },
  { value: "10,000건+", label: "일 평균 처리 주문" },
];

const principles = [
  {
    title: "원인까지 확인한다",
    body: "증상이 사라지는 방향으로 고치기 전에 왜 그런지부터 봅니다. 스레드 덤프, 힙 덤프, 실행계획, 라이브러리 소스까지 내려가 병목을 특정합니다.",
  },
  {
    title: "숫자로 정한다",
    body: "설정값과 기술 선택을 인상으로 정하지 않습니다. 트래픽에서 역산하거나 직접 측정해 근거를 만들고, 측정 방법의 한계도 같이 적습니다.",
  },
  {
    title: "남은 위험을 적는다",
    body: "구조를 바꾸면 그 자리에 새 문제가 생깁니다. 해결하지 못한 것을 결과와 같은 비중으로 기록해, 다음 사람이 판단할 수 있게 합니다.",
  },
  {
    title: "설명할 수 있어야 머지한다",
    body: "구현은 AI에게 맡기고 판단에 시간을 씁니다. 한 AI가 쓴 코드는 다른 AI에게 리뷰받고, 마지막에는 코드와 테스트를 직접 확인합니다. 제가 설명할 수 없는 코드는 머지하지 않습니다.",
  },
];

type Project = {
  no: string;
  domain: string;
  role: string;
  title: string;
  problem: string;
  actions: string[];
  result: string;
  limitation?: string;
  metrics: { value: string; label: string }[];
  stack: string[];
  slug: string;
};

const projects: Project[] = [
  {
    no: "01",
    domain: "코너로지스 · WMS",
    role: "이력 수집 AOP, 이벤트 전달 경로, Worker의 저장·집계 구조 설계 및 구현",
    title: "작업 이력과 통계를 업무 API에서 떼어냈다",
    problem:
      "메인 서버가 입고·피킹 같은 핵심 업무를 처리하면서, 공정이 끝날 때마다 쌓이는 이력과 통계까지 같은 요청 흐름에서 맡고 있었습니다. 이력 로직이 무거워질수록 그 부담이 작업자의 응답 시간에 그대로 얹혔습니다.",
    actions: [
      "Controller에 `@WorkCount`만 선언하면 AOP가 이력을 수집하게 만들고, 정상 응답인 요청만 이력으로 남겼습니다.",
      "수집과 전송을 끊어, 이벤트를 Redis Streams로 넘긴 뒤 저장과 집계는 전부 별도 Worker가 맡게 했습니다.",
      "저장소를 데이터 성격으로 갈랐습니다. 시간대로 뭉쳐도 되는 집계는 MongoDB(AWS DocumentDB), 초 단위 작업 구간 추적은 MySQL.",
      "Streams 레코드 ID와 로그 문서의 유니크 제약으로 중복 이벤트를 식별하고, 이미 저장된 로그에 대한 집계 재실행을 차단했습니다.",
      "발행 실패분은 RDB에 실패 이력으로 적재하고, 벌크 반영 기능으로 나중에 되메울 수 있게 했습니다.",
    ],
    result:
      "업무 API에서 이력 코드가 사라졌고, 결과적으로 특정 Controller에 종속되지 않는 공용 이력 처리 경로가 됐습니다. 지금은 WMS 바깥의 공정 시스템도 같은 경로를 씁니다. 전달 보장은 느슨하게 두는 대신, 실패분을 되메우는 경로를 함께 만들었습니다.",
    limitation:
      "동일 ID의 중복 처리 방어와 전달·집계의 완전한 보장은 구분합니다. 기록에 설명한 로그 저장 → 집계 반영 방식에서는 두 단계 사이 장애 시 집계 누락 가능성이 남습니다. 발행 실패분 복구 경로가 이 부분 실패까지 보장하는 것은 아닙니다.",
    metrics: [
      { value: "서버 분리", label: "업무와 이력 처리" },
      { value: "DocumentDB + MySQL", label: "성격별 저장소" },
      { value: "공용 처리 경로", label: "WMS 외 공정 시스템에서도 사용" },
    ],
    stack: ["Spring AOP", "이벤트 기반", "Redis Streams", "AWS DocumentDB", "MySQL"],
    slug: "wms-worker-server-history-separation",
  },
  {
    no: "02",
    domain: "코너로지스 · WMS",
    role: "창고 공간·설비 데이터 모델, 로케이션 매핑 및 관리자 편집 기능 설계·구현",
    title: "문자열 ID뿐이던 창고를 격자 그래프로 다시 그렸다",
    problem:
      "상품을 검색하면 `행거 3-12-2` 같은 값만 나왔습니다. 그 규칙을 아는 사람만 읽을 수 있어서, 신입 작업자는 숙련자의 통역을 기다리거나 직접 돌아다녀야 했습니다. 그 시간이 그대로 피킹 리드타임이 됐습니다.",
    actions: [
      "창고를 격자 그래프로 모델링하고, 공간과 설비를 1:N으로 분리해 레이아웃 변경이 재고 데이터를 건드리지 않게 했습니다.",
      "셀마다 접근 가능한 방향을 Bit Flag 한 컬럼(0~15)에 담았습니다. 이웃은 좌표로 정해지므로 엣지 테이블을 따로 두지 않아, 행·열을 끼워 넣어도 엣지를 다시 계산할 필요가 없습니다.",
      "행·열 삽입은 JPQL 벌크 연산으로 한 번에 밀어내고, 동시 편집으로 좌표가 겹치는 경우는 유일 제약으로 DB가 거부하게 했습니다.",
      "설비마다 다른 로케이션 ID 체계는 어느 자리가 증가하고 어느 자리가 층인지를 enum 상수로 두어, ID 생성 로직에서 설비별 분기를 없앴습니다.",
      "셀 3,800개를 손으로 찍는 건 불가능하므로, 관리자가 화면에서 창고를 직접 편집하는 데까지 만들었습니다.",
    ],
    result:
      "문자열 로케이션을 지도에서 확인하고, 관리자가 레이아웃을 직접 편집할 수 있게 했습니다. 공간과 설비를 분리해 재배치와 설비별 로케이션 체계를 관리할 수 있는 구조를 만들었습니다.",
    metrics: [
      { value: "위치 시각화", label: "문자열 ID를 창고 지도에 표시" },
      { value: "관리자 편집", label: "화면에서 레이아웃 변경" },
      { value: "3,800+", label: "모델링한 격자 셀 규모" },
    ],
    stack: ["Java", "JPA / JPQL", "MySQL", "그래프 모델링", "Bit Flag"],
    slug: "warehouse-map",
  },
  {
    no: "03",
    domain: "Studio 3S Korea · 주문 연동",
    role: "장애 원인 분석, 서버별 타임아웃·서킷 브레이커 및 실패 건 재전송 경로 적용",
    title: "하위 서버 한 곳이 죽자 우리 서버가 40분간 멈췄다",
    problem:
      "일 평균 10,000건이 넘는 주문을 여러 하위 서버로 전달하는 구조였습니다. 전달을 비동기로 바꾼 지 한 달쯤 됐을 때 협력 서버 한 곳이 다운되면서, 200개짜리 스레드 풀이 약 40분 동안 고갈됐습니다. 남의 장애가 왜 우리 장애가 되는지부터 풀어야 했습니다.",
    actions: [
      "스레드 덤프에서 워커 대부분이 `TIMED_WAITING`으로 소켓 응답을 기다리고, 대기 시간이 60초 근처에서 끊기는 패턴을 확인했습니다.",
      "`feign.Request.Options` 소스를 열어 설정하지 않은 기본 readTimeout이 60초라는 것을 특정했습니다. 요청 하나가 스레드를 60초까지 붙잡고 있었습니다.",
      "하위 서버마다 평소 응답 속도가 달라 일괄 적용 대신 서버별로 타임아웃을 잡았습니다(60초 → 3~15초).",
      "피크 호출량과 스레드 풀 크기를 기준으로 장애 요청의 점유 부담을 검토하고, 반복 실패하는 하위 서버로의 호출을 서킷 브레이커로 차단했습니다.",
      "차단이 곧 유실이 되지 않도록 실패 건을 모아 복구 후 재전송하는 배치를 두고, Circuit Open 시 Slack으로 알렸습니다.",
    ],
    result:
      "서버별 readTimeout을 60초에서 3~15초로 조정하고, 반복 실패 시 호출을 중단하도록 했습니다. 장애 서버를 기다리는 시간을 제한하는 조치와 복구 후 실패 건을 재전송하는 경로를 함께 마련했습니다.",
    metrics: [
      { value: "60s → 3~15s", label: "서버별 readTimeout 설정" },
      { value: "반복 실패 차단", label: "서킷 브레이커 적용" },
      { value: "실패 건 재전송", label: "복구 후 배치 처리" },
    ],
    stack: ["Java", "Spring Async", "OpenFeign", "Resilience4j"],
    slug: "preventing-thread-blocking-with-circuitBreaker",
  },
];

type Decision = {
  tag: string;
  title: string;
  body: string;
  slug: string;
};

const decisions: Decision[] = [
  {
    tag: "동시성",
    title: "분산 환경의 lost update를 막다",
    body: "1시간 단위 슬롯 예약에서 조회와 차감 사이에 수량이 어긋났습니다. 에러 없이 두 요청 다 성공하는 문제라 더 위험했습니다. `synchronized`는 다중 서버에서 무의미하고 DB Lock은 레거시 DB에 부하를 더하며 Kafka는 지금 규모에 과하다고 보고 Redisson을 골랐습니다. 락은 트랜잭션 바깥에 두고, leaseTime 고정값이 처리 중 풀릴 수 있다는 걸 로컬 테스트로 확인한 뒤 워치독에 위임했습니다.",
    slug: "redisson-distributed-lock-multilock",
  },
  {
    tag: "보안",
    title: "AES-CBC에서 GCM으로",
    body: '운영 중인 암호 모드를 "좋다더라"로 바꿀 수는 없었습니다. 100만 회 반복 측정해 GCM이 오히려 15~20% 빠르다는 걸 확인하고 전환했습니다. 다만 `System.nanoTime()` 루프가 JMH 대비 갖는 오차 한계도 같이 적어, 정확한 수치를 주장하지는 않았습니다.',
    slug: "cbc-vs-gcm-performance-comparison",
  },
  {
    tag: "회고",
    title: "세션 키, 충돌 확률보다 예측 불가능성",
    body: "충돌 확률을 200만 배 낮추겠다고 밀리세컨드를 섞었던 과거 설계를 4년 차에 다시 봤습니다. UUID v1이 v4에 밀린 이유가 충돌이 아니라 유추 가능한 정보 노출이었다는 걸 떠올리고, 제가 같은 실수를 반대로 저질렀다는 결론에 닿았습니다.",
    slug: "session-id-lesson-predictability-over-collision",
  },
  {
    tag: "정합성",
    title: "`@Transactional`이 있는데 롤백되지 않았다",
    body: "입고 예정일을 바꾸면 두 날짜의 예약 수량이 함께 움직여야 하는데, 롤백 후 한쪽만 되돌아가지 않았습니다. 조회 순서를 바꾸자 증상은 사라졌지만 원인은 아니었고, 끝까지 따라가 보니 레거시 테이블이 MyISAM이었습니다. DB 전체의 MyISAM 테이블을 전수 조사한 뒤, 엔진 변경이 `COUNT(*)` 성능·락 단위·기존 롤백 동작까지 바꾼다는 점을 따져 영향이 없는 테이블부터 순차적으로 InnoDB로 전환했습니다.",
    slug: "myisam-rollback-failure",
  },
];

type SideProject = {
  name: string;
  period: string;
  summary: string;
  points: string[];
  stack: string[];
  repo?: string;
  repoLabel?: string;
};

const sideProjects: SideProject[] = [
  {
    name: "Dailyge",
    period: "2024.06 ~ 2024.11",
    summary:
      "일정과 목표 달성률을 관리하는 웹 서비스입니다. 사용자 도메인을 맡아 인증·성능·품질 영역을 담당했고, 직접 배포해 운영까지 했습니다. 지금은 서비스를 내렸습니다.",
    repo: "https://github.com/dailyge/dailyge-server",
    points: [
      "회원가입 부하 테스트에서 PK 생성 과정을 개선하기 위해 채번 테이블로 채번과 저장을 분리했습니다.",
      "부하 테스트 중 CPU 사용률과 GC 문제를 힙 덤프로 분석하고, 스레드 수를 조정하며 처리량을 검증했습니다.",
      "사용자 정보 조회에는 Look-Aside 캐시를 적용하고, TTL과 로그인 이벤트 기반 갱신 경로를 두었습니다.",
      "테스트 300여 개로 커버리지 80% 이상을 유지하고, RestDocs와 Swagger로 테스트가 통과할 때만 문서가 생성되게 했습니다.",
      "팀에 프론트엔드 개발자가 없어 React와 TypeScript로 UI까지 맡아 만들고 팀에 공유했습니다.",
    ],
    stack: ["Java 17", "Spring Boot 3", "Redis", "MySQL", "JUnit 5", "RestDocs", "React"],
  },
  {
    name: "이 블로그 · 멀티 에이전트 운용",
    period: "2026.08 ~",
    summary:
      "Cursor와 Claude를 독립 에이전트로 두고, 같은 요구를 각자 구현한 뒤 서로 코드리뷰하게 운영하는 실험입니다. 토이 프로젝트이지만, AI 출력을 그대로 받지 않고 리뷰·머지·제품 판단을 사람이 닫는 흐름을 만들어 보는 게 목적입니다.",
    repo: "https://github.com/beatmeJY/beatmejy.github.io",
    points: [
      "에이전트들이 공통 지침 원본 하나를 함께 읽게 하고, 리뷰는 에이전트별 전용 GitHub 계정으로 남깁니다.",
      "정합성·동시성·장애 처리를 우선으로 리뷰하고, 합리적인 설계가 둘 다라면 사람이 고릅니다.",
    ],
    stack: ["Cursor", "Claude", "GitHub"],
  },
];

type Career = {
  period: string;
  org: string;
  role: string;
  headline: string;
  points: string[];
  tags: string[];
  kind?: "work" | "break";
};

const careers: Career[] = [
  {
    period: "2024.12 ~ 2026.02",
    org: "코너로지스",
    role: "Backend Engineer · Software Team",
    headline: "입고·적재·상품화·피킹·출고·반품을 통합 관리하는 WMS 자체 시스템 구축",
    points: [
      "작업 이력·통계, 창고 지도·로케이션 등 WMS 담당 프로젝트의 초기 설계부터 구현·운영까지 책임지고 팀과 설계 방향을 결정",
      "현장 작업자를 직접 찾아가 문제와 수정 요청을 받고, 현장의 문제를 발로 뛰며 해결해 시스템에 반영",
      "바코드·RFID 기반 실시간 상품 추적과 로케이션·재고 관리 개발",
      "물류센터 전체 맵을 그래프로 모델링하고 이동 가능 방향을 Bit Flag로 표현",
      "Lock·이벤트 기반 처리로 작업 동시성과 중복 처리 문제 해결",
      "작업 공정·생산량 통계 시스템 구축, 서버 분리 및 DocumentDB 기반 이력 저장 구조 설계",
      "네트워크 지연·중복 스캔 이슈 분석 및 개선, RDS 전환과 EC2 운영 안정화",
    ],
    tags: ["WMS", "설계 주도", "현장 밀착", "도메인 모델링", "이벤트 기반 분리"],
  },
  {
    period: "2023.05 ~ 2024.11",
    org: "학습과 개인 프로젝트",
    role: "경력 전환 준비",
    headline: "멘토링으로 기본기를 다시 잡고, 직접 서비스를 만들어 배포·운영했습니다",
    points: [
      "F-Lab Java Backend 멘토링에서 2:1 코드 리뷰로 객체지향 설계·테스트·리팩토링을 다시 익혔습니다",
      "일정 관리 서비스 Dailyge를 만들어 실제로 배포하고 운영하며, 부하 테스트와 힙 덤프로 성능을 직접 개선했습니다",
      "글또 10기에 참여해 학습한 내용을 글로 정리하는 습관을 들였습니다",
    ],
    tags: ["F-Lab 멘토링", "Dailyge 개발·운영", "글또 10기"],
    kind: "break",
  },
  {
    period: "2020.10 ~ 2023.04",
    org: "Studio 3S Korea",
    role: "Backend Engineer · S/W팀",
    headline: "CJ대한통운 군포 스마트 풀필먼트 자동화 · LGL 마이크로 풀필먼트 구축",
    points: [
      "일 평균 10,000건+ 주문과 주문당 20개 이상의 물류 API를 처리하는 서버 간 통합 시스템 개발",
      "동기 스케줄러 전송을 트랜잭션 이벤트 + 비동기로 전환해 확장 가능한 구조로 개선",
      "외부 API 장애로 인한 Thread Pool 고갈을 분석하고 서버별 타임아웃·Circuit Breaker·실패 건 재전송 적용",
      "실행계획 분석으로 대량 삭제 병목을 찾아 처리 시간 10초 → 2초",
      "로봇·재고 실시간 위치 데이터를 RabbitMQ 비동기 처리로 전환해 전송 성능 20~50% 개선",
      "외부 인터페이스 컨트롤러에 AOP를 걸어 성공·실패 이력을 전수 수집하고, 실패 건 재전송 UI 제공",
      "LGL 마이크로 풀필먼트에서 데이터 모델 설계와 프로젝트 리딩, 해외 로봇 API 분석·연동·문서화",
      "온보딩 문서화로 신규 입사자 적응을 지원하고, 코드리뷰·SonarQube 도입을 시도하며 팀 내 정착의 어려움을 경험",
    ],
    tags: ["대용량 처리", "장애 격리", "성능 최적화", "온보딩 체계"],
  },
];

const education = [
  { period: "2024.10 ~ 2025.03", name: "글또 10기" },
  { period: "2023.07 ~ 2024.01", name: "F-Lab Java Backend Mentoring 수료" },
  { period: "2016.02 ~ 2022.02", name: "대림대학교 스마트소프트웨어학과 공학사" },
];

const stackGroups = [
  { name: "언어", items: ["Java", "Kotlin"], context: "Java 기반 물류 서버와 개인 서비스 개발" },
  {
    name: "프레임워크",
    items: ["Spring Boot", "Spring AOP", "JPA", "MyBatis", "OpenFeign", "Resilience4j"],
    context: "업무 API·데이터 모델 설계, 이력 수집 공통화, 외부 API 연동과 장애 격리",
  },
  {
    name: "데이터",
    items: ["MySQL", "PostgreSQL", "Redis", "Redisson", "AWS DocumentDB", "RabbitMQ"],
    context: "실행계획·스토리지 엔진 분석, 분산 락, 이벤트 전달, 작업 이력·통계 저장",
  },
  { name: "인프라", items: ["AWS EC2", "AWS RDS", "GitHub Actions"], context: "EC2 운영 안정화, RDS 전환 및 개인 서비스 배포·운영" },
];

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <header>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tracking-wide text-accent">
              최지율 · Backend Engineer
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              멈추는 지점과 어긋나는 지점을
              <br className="hidden sm:block" /> 구조로 고칩니다
            </h1>
            <p className="mt-5 text-muted">
              물류·풀필먼트 도메인에서 일해 온 4년 차 백엔드 개발자입니다. 성능·정합성·장애
              문제를 원인까지 추적하고 구조로 해결해 왔습니다.
            </p>
            <p className="mt-3 text-muted">
              최근 회사에서는 WMS의 여러 프로젝트를 설계부터 운영까지 책임졌습니다.
              요구사항은 현장 작업자에게 직접 받아 팀과 방향을 정했고, 배포 뒤에도
              현장에서 문제를 확인하며 시스템을 고쳐 나갔습니다.
            </p>
            <nav aria-label="포트폴리오 바로가기" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-accent">
              <a href="mailto:beatmejy@gmail.com">이메일 연락</a>
              <a href={siteConfig.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
              <a href="#career">경력 보기 ↓</a>
              <a href="#projects">대표 작업 보기 ↓</a>
            </nav>
          </div>
          <Image
            src="/images/profile.jpg"
            alt="화이트보드에 설계를 그리며 설명하는 최지율"
            width={900}
            height={900}
            priority
            className="size-28 shrink-0 rounded-xl border border-border object-cover sm:size-36"
          />
        </div>

        <dl className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-surface px-4 py-5">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <p className="text-lg font-semibold tracking-tight text-accent">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-muted">{stat.label}</p>
              </dd>
            </div>
          ))}
        </dl>

        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((item) => (
            <li key={item.title}>
              <p className="text-sm font-semibold tracking-tight">{item.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="career-summary" className="flex flex-col gap-4">
        <SectionHeading id="career-summary" title="경력 요약" />
        <ul className="grid gap-4 sm:grid-cols-2">
          {careers.filter((career) => career.kind !== "break").map((career) => (
            <li key={career.org} className="rounded-xl border border-border p-5">
              <p className="text-xs tabular-nums text-muted">{career.period}</p>
              <h3 className="mt-2 font-semibold">{career.org}</h3>
              <p className="mt-1 text-sm text-muted">{career.role}</p>
              <p className="mt-3 text-sm leading-relaxed">{career.headline}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 대표 작업 */}
      <section aria-labelledby="projects" className="flex flex-col gap-5">
        <SectionHeading
          id="projects"
          title="대표 작업"
          description="실제로 겪은 문제입니다. 각 항목은 그때의 판단 과정을 적어둔 글로 이어집니다."
        />

        <ol className="flex flex-col gap-5">
          {projects.map((project) => (
            <li
              key={project.slug}
              className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)]"
            >
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <div className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="text-sm font-semibold tabular-nums text-accent"
                  >
                    {project.no}
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {project.domain}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight">
                  {project.title}
                </h3>
              </div>

              <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
                <div>
                  <p className="text-xs font-semibold text-muted">담당 범위</p>
                  <p className="mt-1.5 text-sm leading-relaxed">{project.role}</p>
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  <RichText text={project.problem} />
                </p>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    한 일
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {project.actions.map((action) => (
                      <li
                        key={action}
                        className="flex gap-2.5 text-sm leading-relaxed text-muted"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                        />
                        <span>
                          <RichText text={action} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-border px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    결과
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed">
                    <RichText text={project.result} />
                  </p>
                </div>

                {project.limitation ? (
                  <div className="text-sm leading-relaxed text-muted">
                    <p className="font-semibold">보장 범위와 한계</p>
                    <p className="mt-1.5">{project.limitation}</p>
                  </div>
                ) : null}

                <dl className="grid gap-3 sm:grid-cols-3">
                  {project.metrics.map((metric) => (
                    <div key={metric.label}>
                      <dt className="sr-only">{metric.label}</dt>
                      <dd>
                        <p className="text-sm font-semibold tracking-tight">
                          {metric.value}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{metric.label}</p>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
                <ul className="flex flex-wrap gap-1.5" aria-label="사용 기술">
                  {project.stack.map((item) => (
                    <li
                      key={item}
                      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/posts/${project.slug}/`}
                  className="text-sm font-medium text-accent hover:text-accent-hover"
                >
                  자세한 기록 읽기 →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 기술 스택 */}
      <section aria-labelledby="stack" className="flex flex-col gap-5">
        <SectionHeading id="stack" title="기술 스택" />
        <dl className="flex flex-col gap-4">
          {stackGroups.map((group) => (
            <div key={group.name} className="flex flex-col gap-2 sm:flex-row sm:gap-5">
              <dt className="w-20 shrink-0 pt-1 text-sm text-muted">{group.name}</dt>
              <dd>
                <p className="mb-2 text-sm leading-relaxed text-muted">{group.context}</p>
                <ul className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-sm"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 경력 */}
      <section aria-labelledby="career" className="flex flex-col gap-5">
        <SectionHeading id="career" title="경력" />
        <ol className="flex flex-col">
          {careers.map((career, index) => (
            <li
              key={career.period}
              className={`relative pl-6 ${
                index === careers.length - 1 ? "" : "pb-10"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1.5 size-2.5 rounded-full border-2 bg-background ${
                  career.kind === "break" ? "border-border" : "border-accent"
                }`}
              />
              {index === careers.length - 1 ? null : (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[4px] top-5 w-px bg-border"
                />
              )}
              <p className="text-sm tabular-nums text-muted">{career.period}</p>
              <h3
                className={`mt-1 font-semibold tracking-tight ${
                  career.kind === "break" ? "text-muted" : ""
                }`}
              >
                {career.org}
              </h3>
              <p className="text-sm text-muted">{career.role}</p>
              <p className="mt-2 text-sm font-medium">{career.headline}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {career.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-border"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {career.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {/* 개인 프로젝트 */}
      <section aria-labelledby="side" className="flex flex-col gap-5">
        <SectionHeading
          id="side"
          title="개인 프로젝트"
          description="만들어 운영했거나, 지금 실험 중인 것들입니다."
        />
        <ul className="flex flex-col gap-4">
          {sideProjects.map((project) => (
            <li
              key={project.name}
              className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow)] sm:p-6"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold tracking-tight">
                  {project.name}
                </h3>
                <span className="text-sm tabular-nums text-muted">
                  {project.period}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {project.summary}
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {project.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="사용 기술">
                {project.stack.map((item) => (
                  <li
                    key={item}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-muted"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              {project.repo ? (
                <p className="mt-4 flex flex-wrap gap-4 text-sm">
                  <a
                    href={project.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent hover:text-accent-hover"
                  >
                    {project.repoLabel ?? "GitHub →"}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* 기술 판단 기록 */}
      <section aria-labelledby="decisions" className="flex flex-col gap-5">
        <SectionHeading
          id="decisions"
          title="기술 판단 기록"
          description="선택의 근거와, 나중에 틀렸다고 확인한 것까지 남깁니다."
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {decisions.map((decision) => (
            <li
              key={decision.slug}
              className="flex flex-col rounded-xl border border-border p-5"
            >
              <p className="text-xs font-medium text-accent">{decision.tag}</p>
              <h3 className="mt-2 font-semibold leading-snug tracking-tight">
                <RichText text={decision.title} />
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                <RichText text={decision.body} />
              </p>
              <p className="mt-4">
                <Link
                  href={`/posts/${decision.slug}/`}
                  className="text-sm font-medium text-accent hover:text-accent-hover"
                >
                  읽기 →
                </Link>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* 학력·활동 */}
      <section aria-labelledby="education" className="flex flex-col gap-5">
        <SectionHeading id="education" title="학력 · 활동" />
        <dl className="flex flex-col gap-3">
          {education.map((item) => (
            <div key={item.name} className="flex flex-col gap-1 sm:flex-row sm:gap-5">
              <dt className="w-40 shrink-0 text-sm tabular-nums text-muted">
                {item.period}
              </dt>
              <dd className="text-sm">{item.name}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 링크 */}
      <section
        aria-labelledby="links"
        className="flex flex-col gap-6 rounded-xl border border-border bg-surface px-5 py-5 sm:flex-row sm:items-center sm:gap-8 sm:px-6"
      >
        <div className="min-w-0 flex-1">
        <h2 id="links" className="text-xl font-semibold tracking-tight">
          링크
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          <li>
            GitHub{" "}
            <a
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              {siteConfig.github.replace("https://", "")}
            </a>
          </li>
          <li>
            <Link href="/posts/" className="text-accent hover:text-accent-hover">
              전체 글 보기
            </Link>
            <span> — 문제와 판단 과정을 기록합니다</span>
          </li>
          <li>
            이 블로그는 {siteConfig.author}라는 이름으로 씁니다. &ldquo;나 자신을
            이기자&rdquo;는 뜻으로 지었습니다.
          </li>
        </ul>
        </div>
        <Image
          src="/images/profile-2.jpg"
          alt="밤 강변에서 찍은 최지율"
          width={600}
          height={800}
          className="h-40 w-full shrink-0 rounded-lg border border-border object-cover sm:h-44 sm:w-36"
        />
      </section>
    </div>
  );
}
