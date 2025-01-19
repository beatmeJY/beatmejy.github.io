---
title: "Redisson Lock으로 분산 환경의 동시성 문제 해결하기"
description: "해당 일자·시간대(1시간 단위)별 한정 수량 예약 시스템에서 발생한 동시성 문제를 Redisson Lock으로 해결하고, Multi Lock까지 확장한 과정"
date: "2025-01-19"
category: "Backend"
tags:
  - Java
  - Redis
  - Redisson
draft: false
popularRank: 2
---

한정 수량 예약 시스템에서 겪은 동시성 문제를 Redisson Lock으로 해결한 과정을 정리한다. Lock 선택 이유, 분산 Lock을 쓸 때 주의할 점, Multi Lock 확장 순으로 다룬다.

관련 문서: [Redisson 공식 문서 - Locks and synchronizers](https://redisson.pro/docs/data-and-services/locks-and-synchronizers/)

---

## Lock이 필요했던 상황

가용 수량은 하루 단위가 아니라 1시간 단위 슬롯마다 관리됐다. 14시~15시와 15시~16시는 서로 다른 수량 풀이라, 동시성 문제도 같은 슬롯 안에서만 발생한다.

문제는 "조회 → 차감" 사이의 시간차였다. 슬롯 가용 수량이 50개인 상황을 예로 들면:

| 시점 | 스레드 A | 스레드 B |
| --- | --- | --- |
| T0 | 조회 → 50개 | |
| T1 | | 조회 → 50개 (A의 처리 미반영) |
| T2 | 30개 예약 커밋 → 남은 수량 20 | |
| T3 | | 20개 예약 커밋 → 남은 수량 30 (A의 결과를 덮어씀) |

DB에는 "30개 남음"으로 기록되지만 실제로는 50개 전부가 예약된 상태다. 두 트랜잭션 모두 정상 커밋됐는데 A의 갱신이 조용히 사라진 **lost update**다.

이 문제가 위험한 이유는 눈에 보이는 에러가 아니라는 점이다. 두 요청 다 성공 응답을 받고 로그에도 에러가 없다. 나중에 수량을 검증해봐야 어긋난 걸 알 수 있다. 조회와 갱신 사이를 원자적으로 묶는 락 없이는 근본적으로 막을 수 없다.

---

## 왜 Redisson Lock인가

**`synchronized`**: 단일 JVM에서만 안전하다. 서버가 여러 대인 지금 환경에서는 효과가 없다.

**DB Lock**: 정확성은 보장되지만, 레거시 단일 DB에 부하를 더 얹고 싶지 않았다. 마이그레이션도 예정돼 있어 애플리케이션 레벨로 부하를 분산하는 쪽을 택했다.

**Kafka 기반 직렬화**: 파티션 설계와 컨슈머 지연까지 고려해야 해서 복잡도가 크게 늘고, 인프라 비용도 추가된다. 지금 규모에서 감당할 이유가 없었다.

**Redisson Lock**: Redis 기반이라 락 획득/해제가 빠르고, `RLock`·`RedissonMultiLock` 같은 고수준 API가 이미 제공된다. Redis만 공유하면 서버가 늘어나도 그대로 확장된다. 지금 규모엔 이 정도로 충분하고, 트래픽이 커지면 그때 Kafka를 다시 검토하기로 했다.

다만 이 선택은 단일 장애점을 애플리케이션 서버에서 Redis로 옮긴 것이기도 하다. Redis가 응답하지 않으면 예약 로직 전체가 막힌다. 고객사 100곳이 동시에 예약·수정을 시도해도 하루 트래픽 총량 자체가 크지 않아, 단일 인스턴스가 장애를 일으킬 부하는 아니라고 판단해 Sentinel·Cluster 같은 이중화는 구성하지 않았다. 트래픽 규모가 커져 이 전제가 깨지면 그때 재검토한다.

---

## 분산 Lock을 쓸 때 주의할 점

### 1) Lock 해제는 반드시 finally에서

락을 해제하지 않으면 같은 자원을 기다리는 다른 스레드가 영원히 대기한다. 예외가 발생해도 반드시 해제되도록 `finally`에 둔다.

### 2) Lock은 트랜잭션 바깥에서 관리한다

같은 트랜잭션 안에서 락을 걸고 풀면, 스프링은 커밋 시점에야 DB에 반영하기 때문에 락이 먼저 풀리고 커밋이 나중에 일어날 수 있다. 그 틈에 다른 스레드가 아직 반영 안 된 데이터를 읽고 락을 잡아버리면 락을 쓴 의미가 없다. 락은 트랜잭션 시작 전에 획득하고, 완전히 커밋된 뒤에 해제한다.

### 3) Lock 점유 시간(leaseTime)은 워치독에 맡긴다

처음엔 `leaseTime`을 10초로 고정했다. 대부분 로직은 500ms 안에 끝났으니, 20배 가까운 여유를 둔 값이었다.

로컬에서 고의로 처리를 멈춰보고 나서야 문제를 알았다. leaseTime을 직접 지정하면 Redisson은 그 시간이 지나는 즉시 락을 강제로 해제한다. DB 지연 등으로 처리가 10초를 넘기면, 트랜잭션이 커밋되기도 전에 락이 풀려버린다. 그 순간 다른 스레드가 아직 반영 안 된 값을 읽고 자기 결과를 얹으면, 앞서 다룬 lost update가 락을 걸었는데도 그대로 재현된다.

Redisson은 leaseTime 없이 `tryLock(waitTime, unit)`을 호출하면 **워치독(watchdog)**이 스레드가 살아있는 동안 자동으로 만료 시간을 갱신해주는 방식도 제공한다. 처음엔 워치독의 기본 타임아웃(30초)이 다른 사용자를 너무 오래 기다리게 할 거라 생각해 배제했는데, 그 30초는 스레드가 죽어서 갱신이 끊겼을 때만 적용되는 값이었다. 스레드가 살아서 처리 중이면 계속 갱신되므로, 락은 실제 처리 시간만큼만 유지된다.

그래서 leaseTime을 고정값으로 두지 않고, 지정하지 않으면 워치독에 맡기고 명시적으로 지정한 경우에만 고정 만료되도록 바꿨다.

```java
long leaseTime() default -1L; // -1: 워치독에 위임(자동 연장). 양수면 그 시간에 고정 만료.
```

```java
boolean available = distributedLock.leaseTime() > 0
    ? rLock.tryLock(distributedLock.waitTime(), distributedLock.leaseTime(), distributedLock.timeUnit())
    : rLock.tryLock(distributedLock.waitTime(), distributedLock.timeUnit()); // 워치독이 자동 연장
```

무기한 대기가 필요한 경우(금융 거래처럼 순서를 건너뛸 수 없는 로직)라면 대기 락도 고려할 수 있지만, 남용하면 교착 상태로 이어지기 쉬워 재시도·백오프 전략을 함께 설계해야 안전하다.

---

## 구현: AOP 기반 분산 Lock

트랜잭션 바깥에서 락을 걸고 예외가 나도 반드시 해제하는 패턴은 매번 반복되므로 AOP로 공통화했다.

```java
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class DistributedLockAop {

    private static final String DISTRIBUTED_LOCK_PREFIX = "LOCK:";

    private final RedissonClient redissonClient;
    private final AopForTransaction aopForTransaction;

    @Around("@annotation(com.example.common.annotation.DistributedLock)")
    public Object lock(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        DistributedLock distributedLock = method.getAnnotation(DistributedLock.class);

        LocalDateTime lockDateTime;
        try {
            lockDateTime = (LocalDateTime) CustomSpELParser.getDynamicValue(
                signature.getParameterNames(),
                joinPoint.getArgs(),
                distributedLock.key()
            );
            if (lockDateTime == null) {
                throw new IllegalArgumentException("Lock Key는 null일 수 없습니다.");
            }
        } catch (ClassCastException ex) {
            throw new IllegalArgumentException("Lock Key의 타입이 LocalDateTime이 아닙니다. key: " + distributedLock.key(), ex);
        }
        // 같은 시(hour) 슬롯이면 분·초와 무관하게 항상 같은 락 키를 갖도록 시 단위로 자른다.
        String key = DISTRIBUTED_LOCK_PREFIX + lockDateTime.truncatedTo(ChronoUnit.HOURS);

        RLock rLock = redissonClient.getLock(key);
        try {
            boolean available = distributedLock.leaseTime() > 0
                ? rLock.tryLock(distributedLock.waitTime(), distributedLock.leaseTime(), distributedLock.timeUnit())
                : rLock.tryLock(distributedLock.waitTime(), distributedLock.timeUnit());
            if (!available) {
                throw new IllegalStateException("Lock을 획득하지 못하였습니다. key: " + key);
            }
            return aopForTransaction.proceed(joinPoint);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn("Lock 획득 중에 스레드가 중단되었습니다. method: {} in class: {}, key: {}",
                method.getName(), method.getDeclaringClass().getSimpleName(), key);
            throw new IllegalStateException("Lock 획득 중에 스레드가 중단되었습니다.", ex);
        } finally {
            try {
                if (rLock.isHeldByCurrentThread()) {
                    rLock.unlock();
                }
            } catch (IllegalMonitorStateException ex) {
                log.error("Redisson Lock이 이미 해제되었습니다. serviceName: {}, key: {}, ex: {}",
                    method.getName(), key, ex);
            }
        }
    }
}
```

1. 메서드 메타데이터를 가져온다.
2. `key`(SpEL)를 파싱해 `LocalDateTime`을 얻고, 시(hour) 단위로 잘라 같은 슬롯이면 항상 같은 키가 되게 한다. 타입이 다르거나 null이면 예외를 던진다.
3. `getLock(key)`로 `RLock`을 가져온다.
4. `leaseTime`이 양수면 고정 만료로, 아니면(기본값 -1) 워치독에 맡겨 락을 시도한다.
5. 성공하면 `AopForTransaction`으로 트랜잭션과 비즈니스 로직을 실행한다.
6. 대기 중 인터럽트가 발생하면 상태를 복구하고 예외로 전환한다.
7. `finally`에서 현재 스레드가 보유한 락일 때만 해제한다. 이미 만료된 경우는 로그만 남긴다.

SpEL 파싱은 별도 유틸로 분리했다.

```java
public class CustomSpELParser {

    private CustomSpELParser() {
    }

    public static Object getDynamicValue(String[] parameterNames, Object[] args, String key) {
        ExpressionParser parser = new SpelExpressionParser();
        StandardEvaluationContext context = new StandardEvaluationContext();

        for (int i = 0; i < parameterNames.length; i++) {
            context.setVariable(parameterNames[i], args[i]);
        }

        return parser.parseExpression(key).getValue(context, Object.class);
    }
}
```

어노테이션 정의:

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface DistributedLock {

    String key(); // Lock 이름

    TimeUnit timeUnit() default TimeUnit.SECONDS;

    long waitTime() default 30L; // Lock 획득을 기다리는 시간

    long leaseTime() default -1L; // 기본값 -1: 워치독에 위임(자동 연장). 양수를 지정하면 그 시간에 고정 만료.
}
```

사용하는 쪽에서는 `@Transactional` 대신 `@DistributedLock`을 붙여, 락과 트랜잭션 관리를 AOP가 함께 감싸도록 했다.

```java
@DistributedLock(key = "#inboundDateTime")
public void reserveQty(LocalDateTime inboundDateTime, /* 예약 수량 등 */) {
    // inboundDateTime은 특정 시간대 슬롯을 가리키는 시각(예: 2025-01-01T14:00)
    // 예약 처리 로직
}
```

`LOCK:2025-01-01T14:00` 형식의 키로 해당 슬롯의 예약 처리만 직렬화된다. 다른 슬롯은 서로 다른 키라 락이 겹치지 않고 병렬로 처리된다.

---

## Multi Lock으로 확장하기

예약 수량을 다른 시간대 슬롯으로 옮기는 기능이 필요해지면서, 원본 슬롯과 변경할 슬롯 두 개의 락을 동시에 잡아야 했다. Redisson은 이를 위해 `RedissonMultiLock`을 제공한다.

먼저 어노테이션의 `key`를 배열로 바꿨다.

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface DistributedLock {

    String[] keys();
    TimeUnit timeUnit() default TimeUnit.SECONDS;
    long waitTime() default 30L;
    long leaseTime() default -1L; // 기본값 -1: 워치독에 위임. 양수를 지정하면 그 시간에 고정 만료.
}
```

AOP는 락 개수에 따라 단일 락과 멀티 락 처리를 분리했다.

```java
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class DistributedLockAop {

    private static final String DISTRIBUTED_LOCK_PREFIX = "LOCK:";

    private final RedissonClient redissonClient;
    private final AopForTransaction aopForTransaction;

    @Around("@annotation(com.example.common.annotation.DistributedLock)")
    public Object lock(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        DistributedLock distributedLock = method.getAnnotation(DistributedLock.class);

        List<RLock> rLocks = getLocks(signature, joinPoint, distributedLock);
        if (rLocks.isEmpty()) {
            log.error("Lock Key 값이 존재하지 않습니다. method: {} in class: {}",
                method.getName(), method.getDeclaringClass().getSimpleName());
            throw new BusinessException(EExceptionStatus.INTERNAL_SERVER_ERROR);
        }
        if (rLocks.size() == 1) {
            return handleSingleLock(rLocks.get(0), distributedLock, joinPoint, method);
        }
        return handleMultiLock(rLocks, distributedLock, joinPoint, method, distributedLock.keys());
    }

    private List<RLock> getLocks(
        MethodSignature signature, ProceedingJoinPoint joinPoint, DistributedLock distributedLock
    ) {
        List<RLock> rLocks = new ArrayList<>();
        for (String keyExpression : distributedLock.keys()) {
            Object result = CustomSpELParser.getDynamicValue(
                signature.getParameterNames(), joinPoint.getArgs(), keyExpression
            );
            if (result instanceof LocalDateTime dateTime) {
                rLocks.add(redissonClient.getLock(DISTRIBUTED_LOCK_PREFIX + dateTime.truncatedTo(ChronoUnit.HOURS)));
            } else {
                log.error("Lock Key가 null이거나 LocalDateTime 타입이어야 합니다.");
                throw new BusinessException(EExceptionStatus.INTERNAL_SERVER_ERROR);
            }
        }
        return rLocks;
    }

    private Object handleSingleLock(
        RLock rLock, DistributedLock distributedLock, ProceedingJoinPoint joinPoint, Method method
    ) throws Throwable {
        try {
            boolean available = distributedLock.leaseTime() > 0
                ? rLock.tryLock(distributedLock.waitTime(), distributedLock.leaseTime(), distributedLock.timeUnit())
                : rLock.tryLock(distributedLock.waitTime(), distributedLock.timeUnit());
            if (!available) {
                log.error("Single Lock을 획득하지 못하였습니다. key: {}", rLock.getName());
                throw new BusinessException(EExceptionStatus.INTERNAL_SERVER_ERROR);
            }
            return aopForTransaction.proceed(joinPoint);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.error("Single Lock 획득 중에 스레드가 중단되었습니다. method: {} in class: {}, key: {}",
                method.getName(), method.getDeclaringClass().getSimpleName(), rLock.getName());
            throw new BusinessException(EExceptionStatus.INTERNAL_SERVER_ERROR);
        } finally {
            try {
                if (rLock.isHeldByCurrentThread()) {
                    rLock.unlock();
                }
            } catch (IllegalMonitorStateException ex) {
                log.warn("Redisson Single Lock이 이미 해제되었습니다. serviceName: {}, key: {}, ex: {}",
                    method.getName(), rLock.getName(), ex);
            }
        }
    }

    private Object handleMultiLock(
        List<RLock> rLocks, DistributedLock distributedLock, ProceedingJoinPoint joinPoint,
        Method method, String[] keys
    ) throws Throwable {
        RedissonMultiLock multiLock = new RedissonMultiLock(rLocks.toArray(new RLock[0]));
        try {
            boolean available = distributedLock.leaseTime() > 0
                ? multiLock.tryLock(distributedLock.waitTime(), distributedLock.leaseTime(), distributedLock.timeUnit())
                : multiLock.tryLock(distributedLock.waitTime(), distributedLock.timeUnit());
            if (!available) {
                log.error("Multi Lock을 획득하지 못하였습니다. keys: {}", Arrays.toString(keys));
                throw new BusinessException(EExceptionStatus.INTERNAL_SERVER_ERROR);
            }
            return aopForTransaction.proceed(joinPoint);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.error("Multi Lock 획득 중에 스레드가 중단되었습니다. method: {} in class: {}, keys: {}",
                method.getName(), method.getDeclaringClass().getSimpleName(), Arrays.toString(keys));
            throw new BusinessException(EExceptionStatus.INTERNAL_SERVER_ERROR);
        } finally {
            try {
                if (multiLock.isHeldByCurrentThread()) {
                    multiLock.unlock();
                }
            } catch (IllegalMonitorStateException ex) {
                log.warn("Redisson Multi Lock이 이미 해제되었습니다. serviceName: {}, keys: {}, ex: {}",
                    method.getName(), Arrays.toString(keys), ex);
            }
        }
    }
}
```

바뀐 지점:

- `keys` 속성으로 여러 키를 받는다.
- `RedissonMultiLock`으로 여러 키를 하나의 원자적 단위로 묶는다.
- `handleSingleLock`과 `handleMultiLock`을 분리해, 락이 하나든 여러 개든 같은 어노테이션으로 처리한다.

사용 예:

```java
@DistributedLock(keys = {"#beforeInboundDateTime", "#updateInboundDateTime"})
public void updateReservedQty(
    LocalDateTime beforeInboundDateTime, LocalDateTime updateInboundDateTime, /* 변경 수량 등 */
) {
    // 예: 1월 1일 14시 슬롯의 예약을 16시 슬롯으로 옮기는 경우
    // 변경 로직
}
```

---

## 마무리

동시성 문제를 해결하기 위해 Redisson Lock을 도입하고, 트랜잭션 바깥에서 락을 관리하는 구조를 AOP와 커스텀 어노테이션으로 공통화했다. 날짜 이동 요구사항이 생겼을 때는 `RedissonMultiLock`으로, 기존 코드 변경을 최소화하며 확장했다.

leaseTime은 처음엔 20배 여유를 둔 10초 고정값이었지만, 처리가 그 시간을 넘기면 트랜잭션이 끝나기도 전에 락이 풀려 lost update가 재현될 수 있다는 걸 로컬 테스트로 확인하고 -1(워치독 위임)로 바꿨다. 스레드가 살아있는 동안은 실제 처리 시간만큼만 락이 유지되므로, 평소엔 대기 시간 차이 없이 정합성을 지킬 수 있었다.

현재 규모에서는 Redisson Lock만으로 충분하지만, 시스템이 커지면 Kafka 병행이나 다른 분산 트랜잭션 관리 방식을 검토할 것이다.

---

## 참고

- [Redisson 공식 문서 - Locks and synchronizers](https://redisson.pro/docs/data-and-services/locks-and-synchronizers/)
- [Redisson 공식 문서 - Overview](https://redisson.pro/docs/)
