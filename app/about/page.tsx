import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "물류·WMS 도메인에서 일하는 4년 차 백엔드 개발자 beatmeJY입니다. 장애 격리, 분산 환경 동시성, 이벤트 기반 책임 분리 경험을 문제해결 사례로 정리했습니다.",
  alternates: {
    canonical: "/about/",
  },
};

const strengths = [
  "장애나 동시성처럼 재현이 어려운 문제를 스레드 덤프와 라이브러리 소스까지 내려가 원인을 특정합니다.",
  "도메인 규칙을 데이터 모델로 옮겨, 요구사항이 바뀌어도 분기가 늘지 않는 구조를 만듭니다.",
  "선택할 때 트레이드오프를 수치로 확인하고, 해결하지 못하고 남은 위험은 숨기지 않고 기록합니다.",
];

type Project = {
  domain: string;
  title: string;
  problem: string;
  decisions: string[];
  result: string;
  stack: string[];
  slug?: string;
};

const projects: Project[] = [
  {
    domain: "주문 연동 · 장애 대응",
    title: "하위 서버 한 곳이 죽자 우리 서버 스레드 풀이 40분간 고갈됐다",
    problem:
      "주문 전달 배치를 비동기로 전환한 지 한 달쯤 됐을 때, 협력 중이던 하위 서버가 다운되면서 200개짜리 스레드 풀이 약 40분 동안 고갈됐다. 하위 서버가 죽었는데 왜 우리 서버 기능까지 멈추는지가 먼저 풀어야 할 문제였다.",
    decisions: [
      "스레드 덤프에서 워커 대부분이 `TIMED_WAITING`으로 소켓 응답을 기다리고 있고, 대기 시간이 60초 근처에서 끊기는 패턴을 확인했다.",
      "`feign.Request.Options` 소스를 열어 설정하지 않은 기본 readTimeout이 60초라는 걸 특정했다. 요청 하나가 스레드를 최대 60초까지 붙잡고 있었다.",
      "하위 서버마다 평소 응답 속도가 달라 일괄 적용 대신 서버별로 타임아웃을 잡았다(3~15초). 느린 서버 하나가 전체 대기 시간을 결정하지 못하게 했다.",
      "Resilience4j 서킷 브레이커를 붙였다. 값은 피크 트래픽(초당 약 1,000건)에서 역산했다. 슬라이딩 윈도 100건이 쌓이는 데 약 0.1초, 실패율 50%면 초당 500건이 스레드를 점유해 풀 200개가 약 0.4초 만에 소진되는 구조였다.",
      "차단이 곧 유실이 되지 않도록, 끊긴 주문은 복구 후 재전송 배치로 되돌리고 Slack으로 알렸다.",
    ],
    result:
      "남의 장애를 내 장애로 받지 않는 경계가 생겼다. 설정값을 감이 아니라 트래픽에서 역산해 정했다는 게 이 작업에서 가장 크게 남았다.",
    stack: ["Java", "Spring Async", "OpenFeign", "Resilience4j"],
    slug: "preventing-thread-blocking-with-circuitBreaker",
  },
  {
    domain: "WMS · 물류센터",
    title: "작업 이력과 통계를 업무 API에서 떼어냈다",
    problem:
      "메인 서버가 입고·피킹 같은 핵심 업무 API를 처리하면서, 공정이 끝날 때마다 쌓이는 작업 이력과 통계까지 같은 요청 흐름에서 맡고 있었다. 이력 로직이 무거워질수록 그 부담이 작업자의 응답 시간에 그대로 얹혔다.",
    decisions: [
      "Controller에 `@WorkCount`만 선언하면 AOP가 이력을 수집하도록 만들고, 정상 응답인 요청만 이력으로 남겼다.",
      "수집과 전송을 끊어, 이벤트를 Redis Streams로 넘기고 그 뒤 처리는 전부 별도 Worker가 맡게 했다.",
      "저장소를 데이터 성격으로 갈랐다. 시간대로 뭉쳐도 되는 집계는 MongoDB, 초 단위 구간 추적은 MySQL.",
      "Streams 레코드 ID를 로그 문서 키로 써서, 재처리로 같은 이벤트가 다시 들어와도 집계가 두 번 올라가지 않게 했다.",
    ],
    result:
      "업무 API 코드에서 이력 로직이 사라졌고, 결과적으로 특정 Controller에 종속되지 않는 공용 이력 처리 경로가 됐다. 지금은 WMS 바깥의 공정 시스템도 같은 경로를 쓴다. 전달 실패분은 RDB에 적재해 나중에 벌크로 메우고 있고, 완전한 전달 보장은 남은 과제로 기록해뒀다.",
    stack: ["Spring AOP", "이벤트 기반", "Redis Streams", "MongoDB", "MySQL"],
    slug: "wms-worker-server-history-separation",
  },
  {
    domain: "WMS · 물류센터",
    title: "문자열 ID뿐이던 창고를 격자 그래프로 다시 그렸다",
    problem:
      "로케이션이 `3-12-2` 같은 문자열 ID로만 존재해, 작업자가 어디로 어떻게 가야 하는지 알 수 없었다. 설비마다 ID 자릿수의 의미가 달랐고 창고 레이아웃 자체도 자주 바뀌었다.",
    decisions: [
      "창고를 격자 그래프로 모델링하고, 공간과 설비를 1:N으로 분리해 레이아웃 변경이 재고 데이터를 건드리지 않게 했다.",
      "셀마다 접근 가능한 방향을 Bit Flag 한 컬럼(0~15)으로 두어, 층당 약 8,000행이 필요한 엣지 테이블 없이 4방향 접근을 제어했다.",
      "행·열 삽입 같은 레이아웃 변경은 JPQL 벌크 연산으로 처리해, 셀을 하나씩 옮기지 않고 한 번에 밀어냈다.",
    ],
    result:
      "3,800개가 넘는 격자 셀 위에 행거 2,746개와 경량 렉 528개를 매핑했다. 셀을 하나씩 클릭해야 하면 쓰이지 않을 기능이라, 관리자가 화면에서 창고를 직접 편집할 수 있는 데까지 만들었다.",
    stack: ["Java", "JPA / JPQL", "MySQL", "그래프 모델링", "Bit Flag"],
    slug: "warehouse-map",
  },
];

type Decision = {
  title: string;
  body: string;
  slug: string;
};

const decisions: Decision[] = [
  {
    title: "분산 환경의 lost update",
    body: "1시간 단위 슬롯 예약에서 조회와 차감 사이에 수량이 어긋나던 문제를 Redisson 락으로 막았습니다. 락을 트랜잭션 바깥에 두도록 AOP 경계를 잡았고, 워치독의 30초가 스레드가 죽었을 때만 적용되는 값이라는 걸 확인한 뒤 배제했던 선택을 뒤집었습니다. 두 슬롯을 함께 잠글 때는 키를 오름차순으로 정렬해 데드락을 막았습니다.",
    slug: "redisson-distributed-lock-multilock",
  },
  {
    title: "AES-CBC에서 GCM으로",
    body: "토큰의 민감 필드 암호화를 100만 회 반복 측정해 GCM이 오히려 15~20% 빠르다는 걸 확인한 뒤, 무결성까지 함께 얻는 방식으로 옮겼습니다. 운영 중인 암호 모드를 인상으로 바꿀 수는 없다고 봤고, 측정 방법이 JMH 대비 가진 한계도 같이 남겼습니다.",
    slug: "cbc-vs-gcm-performance-comparison",
  },
  {
    title: "세션 키, 충돌 확률보다 예측 불가능성",
    body: "과거에 충돌 확률을 200만 배 낮추겠다고 밀리세컨드를 섞었던 세션 키 설계를 4년 차에 다시 봤습니다. 보안 식별자에서 중요한 건 충돌이 아니라 예측 불가능성이고, 시간을 섞는 순간 키에 생성 시각을 새겨 넣은 셈이라는 결론으로 뒤집었습니다.",
    slug: "session-id-lesson-predictability-over-collision",
  },
];

const careers = [
  {
    period: "2023.11 ~ 2026.08",
    domain: "물류 플랫폼 (WMS · 주문 연동)",
    summary:
      "입고부터 출고까지 이어지는 창고 운영 시스템과 주문 연동을 맡았습니다. 실제 작업자가 쓰는 시스템이라, 장애와 데이터 정합성이 곧 현장 업무 중단으로 이어지는 환경이었습니다.",
  },
  {
    period: "2021.04 ~ 2023.10",
    domain: "SI (2년 6개월)",
    summary:
      "고객사별 시스템을 구축하며 Java·Spring 기반 업무 개발의 기본기를 쌓았습니다. 2년 만에 인턴에서 매니저까지 진급했고, 공통 라이브러리 개선과 코드리뷰·정적 분석 도입을 시도하며 개발 문화가 도구만으로 만들어지지 않는다는 걸 배웠습니다.",
  },
];

const stackGroups = [
  { name: "언어", items: ["Java", "Kotlin"] },
  {
    name: "프레임워크",
    items: ["Spring Boot", "Spring AOP", "Spring Data JPA", "OpenFeign", "Resilience4j"],
  },
  { name: "데이터", items: ["MySQL", "MongoDB", "Redis", "Redisson", "Redis Streams"] },
  { name: "인프라", items: ["AWS EC2", "GitHub Actions"] },
];

/** 문자열 안의 `코드` 표기를 <code>로 렌더링한다. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={index}
            className="rounded bg-code-bg px-1 py-0.5 text-[0.9em] text-code-inline-fg"
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

export default function AboutPage() {
  return (
    <article className="flex flex-col gap-14">
      <header>
        <p className="text-sm text-muted">{siteConfig.author}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          멈추는 지점과 어긋나는 지점을 구조로 고칩니다
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          물류·WMS 도메인에서 일하는 4년 차 백엔드 개발자입니다. 현장이 멈추면 바로
          업무가 멈추는 시스템을 다뤄 왔습니다.
        </p>
        <ul className="mt-5 flex max-w-2xl flex-col gap-2 text-muted">
          {strengths.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-accent">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="projects">
        <h2 id="projects" className="text-xl font-semibold tracking-tight">
          주요 작업
        </h2>
        <ul className="mt-5 flex flex-col gap-4">
          {projects.map((project) => (
            <li
              key={project.title}
              className="rounded-lg border border-border bg-surface p-5 shadow-[var(--shadow)]"
            >
              <p className="text-xs font-medium text-accent">{project.domain}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">
                {project.title}
              </h3>

              <dl className="mt-4 flex flex-col gap-4 text-sm">
                <div>
                  <dt className="font-medium text-foreground">상황</dt>
                  <dd className="mt-1 text-muted">
                    <RichText text={project.problem} />
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">한 일</dt>
                  <dd>
                    <ul className="mt-1 list-disc space-y-1.5 pl-5 text-muted">
                      {project.decisions.map((decision) => (
                        <li key={decision}>
                          <RichText text={decision} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">결과</dt>
                  <dd className="mt-1 text-muted">
                    <RichText text={project.result} />
                  </dd>
                </div>
              </dl>

              <ul className="mt-4 flex flex-wrap gap-2" aria-label="사용 기술">
                {project.stack.map((item) => (
                  <li
                    key={item}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-muted"
                  >
                    {item}
                  </li>
                ))}
              </ul>

              {project.slug ? (
                <p className="mt-4">
                  <Link
                    href={`/posts/${project.slug}/`}
                    className="text-sm text-accent hover:text-accent-hover"
                  >
                    자세한 기록 읽기 →
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="decisions">
        <h2 id="decisions" className="text-xl font-semibold tracking-tight">
          기술 판단 기록
        </h2>
        <dl className="mt-5 flex flex-col gap-5">
          {decisions.map((decision) => (
            <div key={decision.slug}>
              <dt className="font-medium">
                <Link
                  href={`/posts/${decision.slug}/`}
                  className="hover:text-accent"
                >
                  {decision.title}
                </Link>
              </dt>
              <dd className="mt-1 text-muted">
                <RichText text={decision.body} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="career">
        <h2 id="career" className="text-xl font-semibold tracking-tight">
          경력
        </h2>
        <ol className="mt-5 flex flex-col gap-6">
          {careers.map((career) => (
            <li key={career.period} className="border-l-2 border-border pl-4">
              <p className="text-sm text-muted">{career.period}</p>
              <h3 className="mt-1 font-semibold tracking-tight">{career.domain}</h3>
              <p className="mt-2 text-sm text-muted">{career.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="stack">
        <h2 id="stack" className="text-xl font-semibold tracking-tight">
          기술 스택
        </h2>
        <dl className="mt-5 flex flex-col gap-4">
          {stackGroups.map((group) => (
            <div key={group.name} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <dt className="w-20 shrink-0 text-sm text-muted">{group.name}</dt>
              <dd>
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

      <section aria-labelledby="links">
        <h2 id="links" className="text-xl font-semibold tracking-tight">
          링크
        </h2>
        <ul className="mt-4 flex flex-col gap-2 text-muted">
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
          </li>
        </ul>
      </section>
    </article>
  );
}
