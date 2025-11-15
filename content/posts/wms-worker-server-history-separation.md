---
title: "WMS 작업 이력을 업무 API에서 분리한 이유"
description: "WMS 작업 이력 처리를 메인 서버에서 분리해 Logis Worker로 옮긴 경험. AOP로 업무 API에서 작업 정보를 자동 수집하고, 업무가 정상 처리된 경우에만 Redis Streams로 이벤트를 전달하도록 구성한 과정과 그 트레이드오프를 정리한다."
date: "2025-11-15"
category: "Backend"
tags:
  - Spring
  - AOP
  - Redis
draft: false
popularRank: 2
---

WMS에서는 입고·적재·상품화·피킹·출고 같은 공정이 끝날 때마다 작업자·작업장·작업 코드·처리량 같은 이력이 생긴다. 처음에는 메인 서버가 업무 API를 처리하면서 이런 이력·통계 쪽까지 같이 맡고 있었다.

이 글은 그 작업 이력 처리를 메인 서버에서 떼어내 별도의 Logis Worker 서버로 옮긴 경험이다. AOP로 업무 API에서 작업 정보를 자동으로 걷어내고, 업무가 정상적으로 끝난 경우에만 그 정보를 Redis Streams로 넘기도록 구성했다. 단순히 "Redis를 썼다", "서버를 나눴다"는 이야기가 아니라, 왜 그렇게 나눠야 했는지에 대한 기록이다.

---

## 문제 상황

작업자가 업무를 하나 처리할 때마다 작업자, 작업 코드, 작업장, 처리 유형, 처리 수량, 처리 시각 같은 정보가 발생한다. 이걸 어딘가에 저장해야 한다는 것 자체는 문제가 아니었다.

기존 구조에서는 메인 서버가 업무 API를 처리하면서 이 정보를 같은 요청 흐름 안에서 저장했다. 재고 상태 같은 값과 달리, 작업 이력은 업무가 반복될수록 계속 쌓이기만 하는 데이터다. 입고, 적재, 피킹, 출고가 하루에도 수없이 발생하는 WMS 특성상 이 이력은 멈추지 않고 늘어난다.

---

## 원인 분석

진짜 문제는 "데이터가 많아진다"가 아니라 메인 서버의 역할이었다. 메인 서버는 원래 작업자의 실제 업무(입고 확정, 피킹 처리 같은)를 처리하는 서버다. 그런데 여기에 업무가 발생할 때마다 끊임없이 쌓이는 작업 이력 처리까지 같이 얹혀 있었다.

```text
핵심 업무 처리
vs
작업 이력 및 통계 처리
```

이 두 가지는 같은 API 요청 안에서 처리되고 있었지만, 성격이 다른 책임이었다. 업무 처리는 지금 당장 성공해야 하는 일이고, 작업 이력은 업무가 성공적으로 끝난 뒤에 남기면 되는 부가적인 결과였다. 이 구분이 흐려진 채로 하나의 서버, 하나의 요청 흐름에 묶여 있다는 게 진짜 문제였다.

작업 이력이 업무 처리에 필요한 핵심 데이터가 아니라 업무가 끝난 뒤에 남기는 결과물이라면, 작업자가 그 저장이 끝나기를 기다릴 이유는 없었다. 이력을 쌓고 집계하는 일이 무거워질수록, 그 부담이 그대로 업무 API의 응답 시간에 얹히는 구조였다.

---

## 해결 방법

작업 이력 저장을 메인 서버가 아니라 별도의 Worker 서버가 담당하도록 구조를 바꿨다. 최종 구조는 이렇다.

```text
                         WMS Main Server
                               │
                        업무 API 요청
                               │
                               ▼
                         Controller
                               │
                     @WorkCount Annotation
                               │
                               ▼
                       WorkCountAspect
                               │
                    정상 응답 여부 확인
                               │
                               ▼
                    WorkCountEvent 생성
                               │
                               ▼
                   ApplicationEventPublisher
                               │
                               ▼
                    WorkCountEventListener
                               │
                               ▼
                    Redis Streams 전송
                               │
                               ▼
                       Logis Worker
                      /              \
                     ▼                ▼
              MongoDB                MySQL
        개별 로그 원본 저장      작업자 작업 타임라인
        일별(+시간대별)          (연속 작업 구간 추적,
        실시간 집계               비동기 순서 역전 보정)
                     \                /
                      \              /
                       ▼            ▼
                       Scheduler
                            │
                            ▼
                  관리자용 종합 리포트
                (공정별, 주간/월별 재조합)
```

각 단계는 그냥 기술을 나열한 게 아니라, 각각 풀어야 했던 문제 하나씩에 대응한다.

- API 로직마다 이력 저장 코드를 넣지 않기 위해 → AOP
- 실패한 업무의 이력이 따라 나가는 일을 막기 위해 → 정상 응답일 때만 이벤트 발행
- 메인 서버와 이력 처리 서버를 물리적으로 떼어놓기 위해 → Redis Streams
- 대시보드용 숫자를 매번 다시 계산하지 않기 위해 → MongoDB에 일별 실시간 집계
- 작업자가 언제부터 언제까지 어떤 작업을 계속했는지 추적하기 위해 → MySQL 작업 참여 타임라인
- 관리자가 원하는 단위(공정별, 주간/월별 등)로 매번 무거운 쿼리를 만들지 않기 위해 → Scheduler 기반 재조합

### 코드: AOP로 작업 이력 자동 수집하기

업무 API에는 `@WorkCount` 어노테이션만 붙인다.

```java
@WorkCount(workCode = WorkCode.PKG_ARR)
@PostMapping
public ResponseEntity<?> saveInbound(@Valid @RequestBody InboundReqDTO dto) {
    return inboundFacade.saveInbound(dto);
}
```

이 Controller 안에는 이력 저장 코드가 한 줄도 없다. `@WorkCount(workCode = WorkCode.PKG_ARR)`만 붙어 있을 뿐이다. 실제 수집은 공통 AOP가 담당한다.

어노테이션은 Service가 아니라 Controller 메서드에 붙인다. `@Transactional`은 보통 Service(또는 Facade) 쪽에 걸려 있어서, Controller가 그 호출에서 리턴을 받은 시점엔 업무 트랜잭션은 이미 커밋된 뒤다. `@WorkCount`를 Controller에 붙이면 `WorkCountAspect`의 `@AfterReturning`도 자연스럽게 그 트랜잭션 밖에서 동작하게 된다. 이력 수집에 드는 시간이 업무 트랜잭션을 한 뼘도 더 길게 붙잡지 않는다는 뜻이다. 물론 Service 쪽에도 이력 저장과 관련된 코드는 전혀 없다. Service는 원래 하던 업무 로직만 그대로 수행하고, 이력 수집은 AOP가 Controller 바깥에서 가로채 처리한다.

```java
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class WorkCountAspect {
    private final RedisWorkCountProperties prop;
    private final WorkCountEventPublisher eventPublisher;
    private final WorkCountFailRepository failRepository;

    @AfterReturning(pointcut = "@annotation(workCount)", returning = "responseObject")
    public void afterSuccess(JoinPoint jp, WorkCount workCount, Object responseObject) {
        boolean success;
        try {
            success = isHttpSuccess(responseObject);
        } catch (Exception e) {
            log.error("WorkCount 응답 판정 실패. workCode={}", workCount.workCode(), e);
            return;
        }
        if (!success) {
            return;
        }

        HttpServletRequest req;
        try {
            ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            req = (attrs != null) ? attrs.getRequest() : null;
        } catch (Exception e) {
            log.error("WorkCount 요청 컨텍스트 조회 실패. workCode={}", workCount.workCode(), e);
            return;
        }

        if (req == null) {
            log.error("HttpServletRequest에 문제가 발생하여 작업내역이 저장되지 않았습니다. workCode: {}", workCount.workCode());
            return;
        }

        String empNo;
        String workstation;
        try {
            empNo = CookieUtil.get(req, prop.getWorkerIdCookie());
            workstation = CookieUtil.get(req, prop.getWorkstationIdCookie());
        } catch (Exception e) {
            log.error("WorkCount 쿠키 조회 실패. workCode={}", workCount.workCode(), e);
            return;
        }

        try {
            eventPublisher.publishPostOne(nullToEmpty(empNo), nullToEmpty(workstation), workCount.workCode());
        } catch (Exception e) {
            // 발행 실패는 비즈니스 흐름을 막지 않도록 로그와 실패 이력만 남김
            log.error("WorkCount event enqueue failed. workCode={}", workCount.workCode(), e);
            failRepository.save(WorkCountFail.of(empNo, workstation, workCount.workCode()));
        }
    }
}
```

`@AfterReturning`을 쓴 건 의도적이다. 이 Advice는 메서드가 예외 없이 정상적으로 반환됐을 때만 실행된다. Controller에서 예외가 터져서 정상 반환 자체가 이루어지지 않으면, 이 Advice는 아예 호출되지 않는다. 이력 이벤트가 실패한 요청까지 따라 나가는 걸 막아주는 최소한의 장치다.

정상 반환을 확인한 다음에는 `isHttpSuccess`로 응답 상태까지 본다. 예외 없이 돌아왔더라도 4xx를 내려준 요청이라면 이력을 남기지 않기 위해서다. 즉 이 Aspect가 성공 여부를 판단하는 기준은 **응답 그 자체**다.

`WorkCountAspect`는 작업자/작업장 정보를 요청 컨텍스트에서 직접 꺼내지만, Redis에는 접근하지 않는다. 이벤트 객체를 만들어 발행하는 건 `WorkCountEventPublisher`다. Aspect가 호출한 `publishPostOne()`은 POST 요청 기준의 기본값(처리 유형, 수량 1, 발생 시각)을 채워 아래 `publish()`로 넘기는 얇은 래퍼다.

```java
public WorkCountEvent publish(
    String empNo, String workstationId, String workCd,
    int adjustQty, String methodType, LocalDateTime processDt
) {
    validate(empNo, workstationId, workCd, methodType, adjustQty);

    WorkCountEvent event = new WorkCountEvent(
        nullToEmpty(empNo), nullToEmpty(workstationId), workCd,
        nullToEmpty(methodType), adjustQty, processDt
    );

    publisher.publishEvent(event);
    return event;
}
```

`WorkCountEventPublisher`가 하는 일은 값 검증과 `ApplicationEventPublisher.publishEvent()` 호출까지다. 인프라(Redis)를 직접 건드리지 않는다.

### 코드: 이벤트를 Redis로 넘기는 건 따로 두기

이 이벤트를 실제로 Redis로 넘기는 건 별도의 Listener다.

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkCountEventListener {

    private final RedisWorkCountEventPublisher redisWorkCountEventPublisher;

    @EventListener
    public void onWorkCount(WorkCountEvent event) {
        redisWorkCountEventPublisher.sendEvent(event);
    }
}
```

Aspect에서 바로 Redis로 쏴도 동작은 한다. 그런데 그러면 Aspect가 "요청에서 값을 꺼내는 일"과 "Redis에 쓰는 일"을 같이 알게 된다. 나중에 전달 채널을 바꾸거나 전송 전에 뭔가를 끼워 넣어야 할 때, 손대야 하는 곳이 Aspect가 된다.

그래서 한 단계를 끊었다. Aspect는 이벤트를 만들어 발행하는 데까지만 책임지고, 그 이벤트를 어디로 어떻게 보낼지는 Listener가 정한다. 실제로 이 경계 덕분에 이력 발행 지점을 Controller AOP 말고 다른 곳에서 추가할 때도 Redis 쪽 코드는 건드릴 게 없었다.

Listener가 부르는 `RedisWorkCountEventPublisher`는 이벤트를 Redis Streams에 넣는 것까지만 한다. 그 뒤로 이력을 저장하고 통계를 만드는 건 전부 Logis Worker의 몫이라, 메인 서버는 이 뒤에서 무슨 일이 일어나는지 알 필요가 없어졌다. (`RedisWorkCountEventPublisher`의 실제 구현은 이 글에서 다루지 않는다.)

### 코드: MongoDB에 원본 로그와 실시간 통계를 함께 남기기

Logis Worker는 스트림에서 읽은 레코드를 다시 `WorkCountEvent`로 조립한다. 이때 Redis가 레코드에 부여한 ID도 같이 담기기 때문에, Worker 쪽 이벤트는 메인 서버가 발행했던 값에 더해 "이 이벤트가 스트림의 어느 레코드였는지"를 알고 있다.

이 이벤트 하나를 MongoDB에 두 가지 방식으로 반영하는데, 순서가 있다. 개별 이벤트를 그대로 로그로 남기는 게 먼저다.

```java
public void saveWorkLog(WorkCountEvent event) {
    WorkProcessLogDoc logDoc = new WorkProcessLogDoc(
        event.getId(), event.getEmpNo(), event.getWorkCd(), event.getWorkstationId(),
        event.getMethodType(), event.getAdjustQty(), event.getProcessDt()
    );
    workProcessLogRepository.insert(logDoc);
}
```

문서의 `_id`로는 Redis가 레코드마다 부여한 ID를 그대로 쓴다. 그리고 `save`가 아니라 `insert`다. 같은 이벤트가 다시 들어오면 덮어쓰는 게 아니라 `DuplicateKeyException`으로 튕겨 나간다. 이게 왜 중요한지는 뒤에서 다시 다룬다.

이 로그에는 처리 수량(`adjustQty`)까지 그대로 남기 때문에, 나중에 통계 요구사항이 바뀌었을 때 이 원본을 기준으로 다시 집계할 수 있다. 로그가 정상적으로 들어가고 나면, 같은 이벤트로 일별(시간대별 포함) 통계를 증가시킨다.

```java
/**
 * 실시간 집계 증가
 */
public void incrementWorkStats(WorkCountEvent event) {
    final LocalDate processDate = event.getProcessDt().toLocalDate();
    final String hourKey = String.valueOf(event.getProcessDt().getHour());
    final String dayKey = DAY_FORMAT.format(processDate);

    // 실시간 일간 통계 저장
    incrementPeriodStats("work_stats_daily", "date", dayKey, event, hourKey);
}

/**
 * 집계 카운트 증가 (없다면 생성) (collection/기간 필드/키만 다르게 전달)
 */
private void incrementPeriodStats(
    String collection, String statsName, String stateKey,
    WorkCountEvent event, String hourKey
) {
    String id = createId(event.getEmpNo(), event.getWorkCd(), event.getWorkstationId(), stateKey);
    Query query = Query.query(Criteria.where("_id").is(id));
    Update update = new Update()
        .setOnInsert("_id", id)
        .setOnInsert("emp_no", event.getEmpNo())
        .setOnInsert("work_cd", event.getWorkCd())
        .setOnInsert("workstation_id", event.getWorkstationId())
        .setOnInsert(statsName, stateKey)
        .max("updated_at", event.getProcessDt())
        .inc(event.getMethodType().getTotalCountName(), event.getAdjustQty());

    // 일간 통계 - 시간대별 증가 추가
    if (StringUtils.isNotBlank(hourKey)) {
        update.inc("hours." + hourKey + "." + event.getMethodType().getCountName(), event.getAdjustQty());
    }

    safeUpsert(collection, query, update);
}
```

통계는 이벤트가 들어올 때마다 `upsert + $inc`로 즉시 반영된다. 문서가 없으면 `setOnInsert`로 새로 만들고, 있으면 카운트만 증가시킨다. 일간 문서 하나에 시간대별 세부 카운트까지 함께 쌓는다. 대시보드에서 "오늘 이 작업장의 시간대별 처리량" 같은 걸 조회할 때, 매번 원본 로그를 훑어 집계하지 않고 이 문서 하나만 읽으면 되게 하기 위해서다.

실시간으로 쌓는 단위를 일별 하나로 제한한 것도 의도적이다. 처음에는 주간·월간 문서도 같이 늘렸는데, 일별 문서가 있으면 주간도 월간도 결국 그걸 합쳐서 만들 수 있다. 같은 이벤트로 여러 문서를 동시에 갱신하는 대신, 실시간 경로에서는 가장 작은 단위 하나만 정확하게 쌓고 그 위의 집계는 Scheduler에 맡기기로 했다.

### 코드: MySQL로 작업자의 작업 타임라인 추적하기

MySQL은 통계 숫자가 아니라, 작업자가 **언제부터 언제까지 같은 작업을 계속했는지**를 추적하는 용도로 썼다.

```java
@Service
@RequiredArgsConstructor
public class WorkProcessParticipationService {

    private final WorkProcessParticipationJpaRepository jpaRepository;

    public WorkProcessParticipationEntity findLastWorkByEmpNo(String empNo) {
        return jpaRepository.findFirstByEmpNoOrderByIdDesc(empNo);
    }

    /**
     * 작업자 작업 카운트 증가 (작업이 다른 경우 종료 후, 새 작업 생성)
     * -> 과거 이력도 전달 받을 수 있음. (비동기 이벤트므로 과거 이력에 카운팅)
     */
    @Transactional
    public void incrementWorkCount(WorkCountEvent event) {
        WorkProcessParticipationEntity lastWork = findLastWorkByEmpNo(event.getEmpNo());

        // 첫 작업이면 무조건 생성
        if (lastWork == null) {
            createWorkParticipationAndIncrement(event);
            return;
        }

        // 마지막 작업과 같은 작업/작업장이면 그대로 카운트만 증가
        if (lastWork.isSameWork(event.getWorkCd(), event.getWorkstationId(), event.getProcessDt())) {
            lastWork.incrementCount(event.getMethodType(), event.getAdjustQty());
            return;
        }

        // 마지막 작업 이후에 발생한, 다른 작업으로의 전환이면 이전 작업을 종료하고 새로 시작
        if (lastWork.isBeforeStart(event.getProcessDt())) {
            if (!lastWork.isComplete()) {
                lastWork.completeWorkProcess(event.getProcessDt());
            }
            createWorkParticipationAndIncrement(event);
            return;
        }

        // 이벤트가 순서대로 오지 않은 경우: 같은 날짜의 과거 작업 구간을 다시 조회해서
        for (WorkProcessParticipationEntity pastEntity : jpaRepository.findAllByEmpNoAndWorkCdAndWorkstationIdAndStartDtBetween(
            event.getEmpNo(), event.getWorkCd(), event.getWorkstationId(),
            event.getProcessDt().toLocalDate().atStartOfDay(),
            event.getProcessDt().toLocalDate().atTime(LocalTime.MAX)
        )) {
            // 그 이벤트 시각을 포함하는 구간이 있으면 거기에 카운트를 얹는다
            if (pastEntity.isWithinRange(event.getProcessDt())) {
                pastEntity.incrementCount(event.getMethodType(), event.getAdjustQty());
                return;
            }
        }

        // 어느 구간에도 포함되지 않으면 시작/종료가 같은 단발성 구간으로 처리
        WorkProcessParticipationEntity newEntity = createWorkParticipationAndIncrement(event);
        newEntity.completeWorkProcess(event.getProcessDt());
    }

    private WorkProcessParticipationEntity createWorkParticipationAndIncrement(WorkCountEvent event) {
        WorkProcessParticipationEntity newEntity = WorkProcessParticipationEntity.create(
            event.getEmpNo(), event.getWorkCd(), event.getWorkstationId(), event.getProcessDt());
        newEntity.incrementCount(event.getMethodType(), event.getAdjustQty());
        return jpaRepository.save(newEntity);
    }
}
```

이 로직이 신경 쓰는 건 크게 두 가지다.

- **연속된 같은 작업은 하나의 구간으로 묶는다.** 작업이 바뀌는 시점을 감지해서 이전 구간을 닫고 새 구간을 연다.
- **이벤트 순서가 뒤바뀌어 도착할 수 있다는 걸 감안한다.** Redis Streams를 통한 비동기 전달이라, 이벤트가 발생 순서대로 도착한다는 보장이 없다. 그래서 단순히 "마지막 레코드에 증가"로 끝내지 않고, 이벤트 시각이 이미 지나간 과거 구간에 속한다면 그 구간을 다시 찾아 카운트를 얹는 경로까지 만들어뒀다.

작업자가 로그인하면 작업 시작 시간이, 로그아웃하면 종료 시간이 따로 저장된다. 이 타임라인을 그 값과 합치면 "얼마나 오래 일해서 얼마를 처리했는지"가 나온다. 작업량 숫자만으로는 알 수 없는 부분이라, 처리량을 시간으로 나눠 볼 수 있게 하려고 구간을 따로 추적했다.

---

## 왜 이렇게 해결했는가?

### 각 API 로직에 이력 저장 코드를 직접 넣기 vs AOP로 공통화하기

**각 API 로직에 직접 넣는 방법**: 이력을 남겨야 하는 API 수만큼, 그 로직 안에 비슷한 이력 저장 코드를 각각 작성해야 한다. 나중에 "이력에 필드 하나를 더 넣어야 한다"거나 "성공 판단 기준을 바꿔야 한다" 같은 요구사항이 생기면 그렇게 작성해둔 코드를 전부 다시 고쳐야 한다.

**어노테이션 + AOP로 공통화**: 대상만 선언하고 실제 수집 로직은 한 곳에 모아둔다. 정책이 바뀌어도 고칠 곳이 한 곳으로 줄어든다.

**선택**: AOP로 공통화했다. 다만 AOP가 모든 걸 해결해주는 건 아니다. 어떤 API가 작업 이력 대상인지는 여전히 개발자가 `@WorkCount`를 붙이는 걸 잊지 않아야 알 수 있다. 공통화한 건 "수집 로직"이지, "어디에 적용할지 판단하는 책임"까지 없앤 건 아니었다.

### 왜 성공 판단을 응답에 맡겼는가

작업 이력을 남길지 말지 판단할 기준이 필요했다. 업무 로직 안에 성공 플래그를 따로 두는 방법도 있었지만, 그러면 API마다 "무엇을 성공으로 볼 것인가"를 각자 정하게 되고 결국 API 로직마다 이력 코드를 넣는 것과 같아진다.

대신 이미 있는 기준을 썼다. REST API는 원래 처리 결과를 응답 코드로 표현한다. 업무가 성공하면 2xx, 실패하면 4xx·5xx를 내려주는 걸 지키면, 그 응답 자체가 곧 "이 작업이 실제로 처리됐는가"에 대한 답이 된다. `@AfterReturning`으로 정상 반환만 걸러내고 그 응답이 성공인지 확인하는 것으로 판단이 끝나는 이유다.

이게 성립하려면 응답 코드가 결과를 정확히 반영해야 한다. 예외를 삼키고 200을 내려주는 API가 섞여 있으면 그 API의 이력은 조용히 틀어진다. 결국 이 구조는 "REST API 설계를 제대로 해뒀다"는 전제 위에 서 있고, 그 전제를 지키는 게 이력 정확도를 지키는 일이 됐다.

### 왜 Redis Streams인가

메인 서버와 Worker 사이를 끊어줄 전달 채널이 필요했다. 그런데 전달만 되면 아무거나 괜찮았던 건 아니다. Redis List나 Pub/Sub 대신 Streams를 고른 건, 이 채널에서 메시지가 조용히 사라지는 걸 막아야 했기 때문이다. Pub/Sub은 구독자가 그 순간 붙어 있지 않으면 메시지가 그냥 없어진다. Worker를 재배포하는 몇 초 동안의 작업 이력이 통째로 비어도 아무도 모르는 구조가 된다.

Streams는 컨슈머 그룹으로 소비하면서 **처리에 성공한 것만 ACK**할 수 있다. Worker는 저장까지 끝낸 뒤에야 레코드 ID로 ACK를 보내고, 중간에 실패하거나 프로세스가 내려가면 그 메시지는 ACK되지 않은 채 pending으로 남는다. "받았다"가 아니라 "처리했다"를 기준으로 소비가 기록되는 것이다. 남은 pending은 별도 스케줄러가 `XPENDING`으로 골라내고 `XCLAIM`으로 다시 가져온다.

여기서 한 번 걸렸다. `XCLAIM`은 **소유권을 옮기는 명령이지 재배달 명령이 아니다.** 컨슈머 그룹을 `>`(새 메시지)로 읽는 이상, claim한 메시지가 리스너로 저절로 흘러들어오지는 않는다. 회수한 메시지를 누가 언제 다시 처리할지는 그것대로 따로 정해야 한다. 재처리 경로를 만들어두는 것과 그 경로가 원하는 시점에 동작하게 만드는 건 별개의 일이었다.

Streams를 고른 판단은 나중에 값을 했다. 다른 종류의 이벤트 처리가 같은 Worker에 붙으면서 스트림이 여러 개로 늘어났는데, 종류마다 스트림과 컨슈머 그룹을 두고 같은 방식으로 소비하면 돼서 채널 구조를 다시 설계할 일이 없었다.

### 왜 MongoDB와 MySQL을 같이 썼는가

"NoSQL이 유연해서, RDB가 정합성이 좋아서" 같은 일반론으로 설명하고 싶지는 않다. 실제 이유는 두 데이터가 저장소에 요구하는 게 달랐다는 것이다.

`work_stats_daily` 문서 하나가 감당해야 하는 갱신은 생각보다 복잡하다. 이벤트가 하나 들어오면 하루 전체 누적 카운트를 올리고, 동시에 `hours.14`처럼 그 시간대에 중첩된 필드도 같이 올려야 한다. 게다가 그 문서가 아직 없을 수도 있다.

MongoDB에서는 이게 `upsert` 한 번이다. 문서가 없으면 `setOnInsert`로 키 필드를 채워 만들고, 있으면 `$inc`로 최상위 카운터와 `hours.<시간>` 하위 카운터를 함께 증가시킨다. 조회해서 있는지 확인하고, 없으면 만들고, 있으면 올리는 분기를 애플리케이션이 직접 쓸 필요가 없다. 중첩된 경로를 원자적으로 증가시키는 것도 표현식 하나로 끝난다.

같은 걸 관계형 테이블로 옮기면 시간대를 어떻게든 평평하게 펴야 한다. 시간대 컬럼 24개를 늘어놓든, `(통계키, 시간)` 단위로 로우를 쪼개 별도 테이블을 두든 둘 중 하나다. 앞은 "18시대 취소 건수" 같은 항목이 하나 늘 때마다 컬럼이 24개씩 붙고, 뒤는 대시보드가 하루치 시간대별 그래프를 그릴 때마다 조인과 집계가 따라붙는다. MongoDB를 고른 건 스키마가 자유로워서가 아니라, 필요한 갱신 모양이 기본 연산 하나에 그대로 대응했기 때문이다.

카운터를 올리는 것만 놓고 보면 Redis로도 된다. 그런데 작업 이력은 장기간 보존해야 하는 원본 데이터고, 일별 통계 역시 이후 조회와 분석에 계속 쓰이는 지속적인 파생 데이터다. 둘 다 오래 남겨두고 다시 꺼내 보는 값이라 저장소가 필요했다. Redis Streams는 그 값을 만들어내는 이벤트를 서버 사이로 비동기 전달하는 역할에 썼다.

MySQL 쪽은 요구가 정반대였다. 우선 시간 해상도부터 달랐다. MongoDB 집계는 `hours.14`처럼 **시간대 단위로 뭉쳐서** 쌓는다. "14시에 몇 건"은 바로 나오지만, 그 한 시간 안에서 작업자가 어떤 작업을 몇 시 몇 분까지 하다가 언제 다른 작업으로 넘어갔는지는 이미 사라진 정보다. 원본 로그가 남아 있으니 정렬해서 훑으면 복원은 된다. 다만 타임라인 한 번 보자고 매번 수만 건짜리 로그를 시간순으로 정렬하고 구간을 이어 붙이는 건, 그 화면 하나를 위해 치르기에 너무 비싼 값이었다. 그래서 초 단위 시작·종료를 가진 구간을 아예 그 형태로 MySQL에 저장해뒀다.

갱신 방식도 반대였다. `incrementWorkCount()`가 하는 일은 "마지막 상태를 읽고, 조건을 판단하고, 그 결과에 따라 다르게 쓴다"는 상태 머신에 가깝다. 어떤 경우엔 기존 구간의 카운트만 올리고, 어떤 경우엔 이전 구간을 닫고 새 구간을 여는 두 번의 쓰기가 한 묶음이 되어야 한다. 이런 읽기-판단-쓰기를 하나의 트랜잭션으로 묶는 건 RDB가 원래 잘하는 영역이다. 이걸 MongoDB에 넣었다면, 비슷한 수준의 트랜잭션 보장을 받기 위해 레플리카셋 구성이 전제되는 멀티 도큐먼트 트랜잭션을 써야 했을 것이다. 지금 이 로직 하나 때문에 MongoDB를 레플리카셋으로 올릴 이유는 없었다.

정리하면 기준은 두 개였다. **뭉개도 되는 데이터인가**, 그리고 **그 갱신이 저장소가 한 번에 보장해주는 연산에 그대로 얹히는가**. 대시보드 숫자는 두 질문 모두 MongoDB 쪽이었고, 작업 구간은 두 질문 모두 MySQL 쪽이었다. 데이터 형태가 아니라 이 두 답이 저장소를 갈랐다.

### 실시간 집계와 별도의 Scheduler를 함께 둔 이유

일별 통계는 이벤트가 들어올 때 이미 실시간으로 반영되는데, 그 단위는 "이벤트 하나를 어디에 즉시 반영할 것인가"에 맞춰져 있다. 관리자가 보고 싶어 하는 화면은 여러 work_cd를 묶은 공정 단위, 여러 작업장을 합산한 주간 리포트처럼 문서 하나만 읽어서는 안 나오는 조합일 때가 많다. 그래서 가장 자주 봐야 하는 숫자만 실시간 경로에 두고, 조합 리포트는 Scheduler가 미리 만들어두게 나눴다.

중요한 건 Scheduler가 원본에서 통계를 처음 계산하는 게 아니라, 이미 계산돼 있는 숫자를 다시 묶기만 한다는 점이다. 덕분에 배치가 실패하거나 밀려도 대시보드의 기본 숫자는 그대로 살아 있다. 통계의 정확성이 배치 성공 여부에 걸리지 않는다.

---

## 결과

메인 서버 입장에서는 업무 API 코드 안에 이력 저장 로직이 섞여 있지 않게 됐다. `@WorkCount`를 붙이는 것 외에는 신경 쓸 게 없다. 업무 처리와 이력 처리가 서로 다른 실패 지점을 갖게 됐다는 것도 컸다. 이력 처리 쪽에 문제가 생겨도 업무 API 자체는 영향을 받지 않는다.

그런데 이 마지막 문장에는 대가가 따라온다. 업무 처리와 Redis로의 이벤트 전송은 하나의 원자적인 작업으로 묶여 있지 않고, 이력 발행 실패를 업무 API의 실패로 전파하지 않기로 한 이상, 그냥 두면 업무는 성공했는데 그 이력만 사라지는 구간이 생긴다.

그래서 실패한 이벤트를 로그만 남기고 버리지 않고, RDB에 실패 이력으로 적재했다. `WorkCountAspect`의 `catch`가 하는 일이 그것이다.

```java
try {
    ...
    eventPublisher.publishPostOne(...);
} catch (Exception e) {
    // 발행 실패는 비즈니스 흐름을 막지 않도록 로그와 실패 이력만 남김
    log.error("WorkCount event enqueue failed. workCode={}", workCount.workCode(), e);
    failRepository.save(WorkCountFail.of(empNo, workstation, workCount.workCode()));
}
```

여기에 작업 이력을 벌크로 저장하는 기능을 같이 만들어서, 쌓인 실패분을 나중에 한 번에 반영할 수 있게 했다. 실제로 이 경로를 타는 경우는 많지 않았다. 발행이 실패하는 건 대부분 Redis가 내려가 있는 것 같은 특수한 상황이었다. 그런 상황은 자주 오지 않지만, 한 번 오면 그 시간 동안의 작업 이력이 통째로 비는 게 문제였다. 실패 이력과 벌크 반영은 그 구간을 되메우기 위한 장치다.

정리하면 지금 구조는 이렇게 끝난다.

```text
업무 처리 성공
      ↓
정상 응답 반환
      ↓
Redis 전송 실패
      ↓
실패 이력 적재 → 벌크 반영
```

이건 실수로 놓친 부분이 아니라, 이번 구조에서 의도적으로 선택한 책임 분리의 결과에 가깝다. 작업 이력 저장이 실패했다고 해서 핵심 업무 트랜잭션까지 실패하게 만들지는 않기로 했다. 그 대가를 그냥 떠안는 대신 실패한 이벤트를 붙잡아두고 나중에 메우는 쪽을 택했다. 전송 자체의 보장은 느슨하게 두고, 복구 수단을 따로 둔 것에 가깝다.

복구 수단을 두면 곧바로 따라오는 문제가 하나 있다. 미처리 메시지를 다시 처리한다는 건 같은 이벤트가 두 번 들어올 수 있다는 뜻이고, 이 구조에서 그게 제일 아픈 곳은 집계다. `$inc`는 몇 번 실행하느냐에 따라 결과가 달라지는 연산이라, 같은 이벤트가 두 번 들어오면 카운트도 두 번 올라간다. 원본 로그는 나중에 다시 계산해 복구할 수 있지만, 틀어진 숫자는 틀어진 걸 알아채기 전까지 그대로 보인다.

이건 Worker가 이벤트를 처리하는 순서로 막았다. 원본 로그 저장이 먼저고, 집계 갱신이 그 다음이다. 그리고 로그 문서의 `_id`는 Redis 레코드 ID이고 저장은 `insert`다. 그래서 이미 처리한 이벤트가 다시 들어오면 첫 단계에서 `DuplicateKeyException`으로 끊기고, 뒤에 있는 집계 갱신은 아예 실행되지 않는다. 중복 여부를 따로 조회해서 확인하는 코드가 없어도, 저장소의 유니크 제약이 그 판단을 대신해준다.

대신 이 예외는 "실패"가 아니라 "이미 끝난 일"로 취급해야 한다. 다른 실패와 똑같이 다뤄서 ACK하지 않으면, 그 메시지는 영영 pending에 남아 스케줄러가 계속 회수 대상으로 집는다. 이미 처리된 걸 알면서도 매번 다시 꺼내오는 셈이다. 그래서 메시지를 소비하는 쪽은 중복을 따로 구분한다.

```java
try {
    workProcessFacade.saveWorkProcess(event);
    ack(recordId);
} catch (DuplicateKeyException e) {
    // 이미 처리된 이벤트. 실패가 아니므로 ACK하고 넘어간다
    ack(recordId);
} catch (Exception e) {
    // 진짜 실패. ACK하지 않고 pending에 남겨 다음 회수 대상이 되게 한다
    WorkProcessLogger.logStreamProcessingFailed(log, recordId, e);
}
```

`DuplicateKeyException`을 일반 `catch`보다 앞에 두는 게 핵심이다. 뒤에 두거나 하나로 묶어버리면 중복과 실패가 같은 취급을 받아서, 이미 끝난 메시지가 계속 되돌아오거나 반대로 진짜 실패가 처리된 걸로 표시된다. 재시도를 붙인다는 건 "무엇을 실패로 볼 것인가"까지 같이 정하는 일이었다.

처음 목표는 "메인 서버에서 이력 처리를 떼어낸다"였는데, 떼어내고 보니 그게 특정 Controller에 종속되지 않는 공용 이력 처리 경로가 돼 있었다. 촬영 시스템이나 RFID 시스템처럼 WMS 바깥의 공정 시스템도 별도의 API로 작업 이력을 전달하고, 그 뒤로는 같은 경로를 그대로 탄다. 실제로 지금 그렇게 쓰고 있다. 이력을 남기는 쪽은 이벤트만 보내면 되고, 그걸 저장하고 집계하는 방식은 Worker 안에서만 바뀐다. 이력 대상이 하나 늘어날 때 손대야 하는 코드가 없다는 점이, 응답 시간이 짧아진 것보다 실질적인 소득이었다.

---

## 배운 점

처음에는 단순히 "작업 이력을 저장하는 기능"이었다. 그런데 작업량이 계속 쌓이고 통계 요구사항이 생기면서, 중요한 건 어디에 저장할 것인가가 아니라 어떤 책임을 어디에 둘 것인가라는 걸 알게 됐다.

결과적으로 책임은 이렇게 나뉘었다.

```text
업무 처리         → Main Server
작업 이력 처리    → Logis Worker
이벤트 전달       → Redis Streams
개별 로그 원본    → MongoDB
일별 실시간 통계   → MongoDB
작업 타임라인(세션) → MySQL
관리자용 종합 리포트 → Scheduler
```

이 작업의 의미는 "서버를 하나 더 만들었다"가 아니라, 핵심 업무 처리와 부가적인 이력 처리 사이의 결합도를 낮췄다는 데 있다고 생각한다. 작업 이력을 저장하는 기능을 추가한 게 아니라, 업무 처리와 작업 이력 처리의 책임을 분리하고 그 사이를 이벤트로 잇는 구조로 바꾼 것이다.

동시에 이벤트 기반 구조로 바꾸면서 메시지 유실, 재처리, 정합성 같은 새로운 문제도 같이 떠안게 됐다. 하나의 문제(같은 서버에서 서로 다른 책임을 처리하던 것)를 풀면, 그 자리에 다른 트레이드오프(전달 보장을 따로 챙겨야 하는 것)가 들어선다. 그래서 전달 자체를 완벽하게 만들려고 하기보다, 실패했을 때 되메울 수 있는 경로를 같이 만들어두는 쪽을 택했다. 이번 작업에서 가장 크게 남은 건 그 감각이었다.

---

## 참고

- [Spring Framework 공식 문서 - Aspect Oriented Programming](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [Redis 공식 문서 - Streams](https://redis.io/docs/latest/develop/data-types/streams/)
