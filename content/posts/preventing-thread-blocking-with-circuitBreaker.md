---
title: "서킷브레이커로 스레드 풀 고갈 장애를 막아보자 (Resilience4j)"
description: "하위 서버 장애가 전체 서버의 스레드 풀 고갈로 번진 사고를 계기로 Resilience4j 서킷 브레이커를 도입한 과정"
date: "2023-10-14"
category: "Backend"
tags:
  - Java
  - Spring Boot
  - Resilience4j
draft: false
---

# 서킷브레이커로 스레드 풀 고갈 장애를 막아보자 (Resilience4j)

주문 데이터를 여러 하위 서버에 전달하는 배치 로직을 비동기로 전환한 지 한 달쯤 됐을 때, 협력 중이던 하위 서버 하나가 다운되면서 우리 서버의 스레드 풀까지 함께 고갈되는 사고가 있었다. 하위 서버가 죽었는데 왜 우리 서버까지 영향을 받았는지, 그리고 이걸 근본적으로 해결하기 위해 어떠한 작업을 했었는지 기록하려고 한다.

관련 문서: [Resilience4j CircuitBreaker 공식 문서](https://resilience4j.readme.io/docs/circuitbreaker)

---

## 문제 상황

- 증상: `하위 서버 장애 발생 직후`, 서버 내 일부 기능들이 응답하지 않기 시작함
- 영향 범위: 하위서버로의 비동기 주문 정보 전송 로직
- 처음 발견한 단서: 애플리케이션 로그에서 여러 비동기 스레드에서 동일한 하위 서버 API 호출 오류가 반복적으로 발생하고 있음을 확인함

> 하위 서버 장애 발생 시점부터, 우리 서버의 비동기 스레드 풀이 약 40분 동안 고갈되어 일부 장애가 발생하는 상태로 유지됐다.

![스레드 풀 고갈 당시 대처 기록](/images/error_fix_history.png)

원인을 따라 들어가 보니, 하위 서버 호출에 쓰던 Feign 클라이언트에 타임아웃을 별도로 설정하지 않은 상태였다. `feign.Request.Options` 소스를 직접 확인해보니, 각 타임아웃 값의 Javadoc에 기본값이 명시되어 있었다.

```java
// feign.Request.Options

/**
 * Creates the new Options instance using the following defaults:
 * <ul>
 * <li>Connect Timeout: 10 seconds</li>
 * <li>Read Timeout: 60 seconds</li>
 * <li>Follow all 3xx redirects</li>
 * </ul>
 */
public Options() {
  this(10, TimeUnit.SECONDS, 60, TimeUnit.SECONDS, true);
}
```

별도 설정이 없으면 connectTimeout은 10초, **readTimeout은 60초**가 그대로 적용된다는 뜻이다. 즉 하위 서버가 커넥션은 맺어주고 응답만 주지 않는 상황이라면, 스레드 하나가 요청 하나당 **최대 60초**까지 응답을 기다릴 수 있었던 것이다. 비동기 스레드 풀 크기(200개)와 큐 용량(50개)을 감안하면, 응답 없는 요청이 수백개가 겹칠경우 풀 전체가 60초 단위로 순식간에 채워질 수 있는 구조였다.

---

## 원인 분석

비동기 전환 당시 신경 썼던 부분과 실제로 문제가 됐던 부분이 달랐다.

- 가설 1: 재전송 시 중복 전송으로 인한 데이터 정합성 문제 → 전송 완료 플래그로 이미 대비되어 있었음, 원인 아님 ❌
- 가설 2: 스레드 풀 크기 설정이 너무 작음 → 크기를 늘려도 같은 시간 안에 다시 고갈됨, 근본 원인 아님 ❌
- 실제 원인: Feign 클라이언트에 별도 타임아웃 설정이 없어 **기본값인 readTimeout 60초**가 그대로 적용됐고, 응답 없는 요청마다 스레드가 최대 60초씩 점유되면서 새 요청이 계속 대기큐에 쌓임

디버깅 체크리스트는 다음과 같았다.

- [x] 장애 당시 애플리케이션 로그 확인
- [x] 에러가 발생한 스레드 확인
- [x] 스레드 풀 설정(core/max size, queue capacity) 확인
- [x] 하위 서버 API 타임아웃 설정 확인 → Feign 기본값(60초) 그대로 사용 중이었음을 확인

> 스레드 풀 고갈 당시 스레드 재현
![스레드 풀 고갈 당시 스레드 덤프](/images/error_replay.png)

---

## 해결 방법

### 임시 조치:
  - 서킷브레이커 도입 전까지 임시 배치 전송으로 전환
  - 스레드 풀 격리(이미 적용)

쓰레드 풀이 고갈된 로직이 담당하는 데이터를 받는 서버가 애초에 장애가 나있는 상황이라, 추후 복구되었을때 그동안 전달되지 않는 데이터를 모아 전송하는 배치로직으로 되돌려 상황을 대처했고,

해당 비동기 로직은 원래도 별도 스레드 풀을 지정하여 격리되어 있어 실제 운영에는 문제가 없었다.

```java
@Configuration
@EnableAsync
public class AsyncThreadConfigure {

    private final int CORE_POOL_SIZE = 200;
    private final int MAX_POOL_SIZE = 200;
    private final int QUEUE_CAPACITY = 50;
    private final String CUSTOM_THREAD_NAME_PREFIX = "ASYNC_THREAD-";

    @Bean(name = "asyncThreadPoolTaskExecutor")
    public Executor threadPoolTaskExecutor() {
        ThreadPoolTaskExecutor taskExecutor = new ThreadPoolTaskExecutor();
        taskExecutor.setCorePoolSize(CORE_POOL_SIZE);
        taskExecutor.setMaxPoolSize(MAX_POOL_SIZE);
        taskExecutor.setQueueCapacity(QUEUE_CAPACITY);
        taskExecutor.setThreadNamePrefix(CUSTOM_THREAD_NAME_PREFIX);
        taskExecutor.initialize();
        return taskExecutor;
    }
}
```

> 스레드 풀 격리로 전파되지 않는 상황 예시
![장애 전파되지 않는 예시](/images/non_propagated_failure.png)

다만 위처럼 쓰레드 풀이 격리되어 있다해도 **피해 범위를 줄일 뿐**, 스레드가 응답 없는 서버를 계속 기다리다 고갈되는 근본 원인은 해결하지 못한다.

### 1차 조치: Feign 타임아웃 단축

가장 먼저 손댄 건 원인으로 지목된 Feign의 기본 readTimeout(60초)이었다. 응답 없는 요청 하나가 스레드를 60초씩 붙잡고 있을 이유가 없었기 때문에, 하위 서버와의 평소 응답 시간을 참고해 10초로 줄였다. 개별 클라이언트마다 따로 설정하는 대신, `default` 설정으로 모든 Feign 클라이언트에 공통 적용했다.

```yaml
# application.yml
feign:
  client:
    config:
      default:
        connectTimeout: 1000  # ms, 기존 기본값 10초 → 1초
        readTimeout: 10000    # ms, 기존 기본값 60초 → 10초
```

타임아웃을 줄인 것만으로도 스레드 하나가 점유되는 최대 시간이 60초에서 10초로 줄어, 같은 시간 동안 스레드 풀이 고갈되기까지 걸리는 시간이 늘어나는 효과가 있었다. 하지만 이건 고갈되는 속도를 늦췄을 뿐, 하위 서버 장애가 길게 이어지면 여전히 풀이 채워질 수 있는 구조였다. 그래서 서킷 브레이커를 도입했다.

---

### 근본 해결: Resilience4j 서킷 브레이커

`resilience4j-spring-boot3` 의존성을 추가하고 아래처럼 설정했다.

실패율 임계치와 대기 시간은 실제 트래픽 패턴에 맞게 세세한 조정이 필요했다.

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      subServerApi:
        sliding-window-size: 100          # 최근 100건의 호출을 기준으로 판단
        failure-rate-threshold: 50       # 실패율 50% 이상이면 Open
        wait-duration-in-open-state: 10s # Open 상태 유지 시간
        permitted-number-of-calls-in-half-open-state: 5
        automatic-transition-from-open-to-half-open-enabled: true
```

```java
@FeignClient(name = "subServerApi", url = "${sub-server.url}")
public interface SubServerFeignClient {

    @PostMapping("/api/orders")
    OrderResponse sendOrder(@RequestBody OrderRequest request);
}
```

```java
@Service
@RequiredArgsConstructor
public class SubServerClient {

    private final SubServerFeignClient subServerFeignClient;

    @CircuitBreaker(name = "subServerApi", fallbackMethod = "fallback")
    public OrderResponse sendOrder(OrderRequest request) {
        return subServerFeignClient.sendOrder(request);
    }

    // Open 상태이거나 호출이 실패했을 때 대신 실행되는 메서드
    private OrderResponse fallback(OrderRequest request, Throwable t) {
        log.warn("subServerApi 호출 실패, fallback 처리: {}", t.getMessage());
        return OrderResponse.failed(request.getOrderId());
    }
}
```

타임아웃(10초)으로 요청 하나의 최대 대기 시간을 제한하고, 그 위에서 서킷 브레이커가 반복되는 실패를 감지해 이후 요청 자체를 차단하는 구조다.

---

## 왜 이렇게 해결했는가?

### 대안 A: 타임아웃만 설정

응답하지 않는 하위 서버를 무한정 기다리지 않도록
연결 및 읽기 타임아웃을 60초에서 10초로 줄였다.

스레드가 장시간 점유되는 문제를 줄일 수 있지만,
장애가 지속되는 동안에도 10초 간격으로 하위 서버 호출이 계속 발생한다.

### 대안 B: Retry 적용

일시적인 네트워크 오류에는 도움이 될 수 있지만,
하위 서버 자체가 다운된 상황에서는 실패한 요청을 반복해서 전송하게 된다.

오히려 장애 서버에 추가 부하를 발생시킬 수 있다.

### 선택: Timeout + Circuit Breaker

타임아웃으로 개별 요청이 무한정 대기하지 않도록 제한하고,
실패가 일정 수준 이상 누적되면 Circuit Breaker를 OPEN 상태로 전환해
하위 서버에 대한 추가 요청 자체를 차단하도록 했다.

결과적으로 하위 서버의 장애가 지속되는 동안
우리 서버의 스레드가 계속 외부 API 응답을 기다리는 상황을 줄이고,
장애가 혹시 모를 다른 기능으로 전파되는 것을 막는 것을 목표로 했다.

---

## 결과

Before:

- Feign readTimeout 기본값(60초) 그대로 사용
- 하위 서버 장애 발생 시 요청마다 최대 60초씩 스레드 점유
- 작업 큐 지속 증가, 약 40분 만에 스레드 풀 고갈
- 일부 기능 장애 발생

After:

- Feign readTimeout을 60초 → 10초로 단축, 요청당 최대 대기 시간 단축
- 실패율 임계치 도달 시 Circuit Open
- Open 이후 하위 서버 호출 차단, 비동기 스레드 풀의 추가 점유 방지

---

### 남은 리스크와 대응

- 실패한 주문 데이터가 유실되지 않도록 실패 건을 별도로 모아
  하위 서버 복구 후 자동으로 재전송하는 배치 로직을 구성했다.
- Circuit이 Open 상태로 전환되면 장애 상황을 인지할 수 있도록
  Slack 알림을 추가했다.

---

## 배운 점

- 다른 서버와 통신하는 코드를 작성할 때는 내 코드의 정상 동작뿐 아니라, 상대 서버가 응답하지 않는 상황까지 항상 고려해야 한다.
- 외부 클라이언트 라이브러리(Feign 등)의 기본 타임아웃 값을 확인하지 않고 그대로 쓰면, 생각보다 훨씬 긴 시간 동안 스레드가 점유될 수 있다.
- 같은 증상(특정 기능만 응답 없음)이 재발하면 먼저 스레드 덤프와 스레드 풀 사용량부터 확인한다.
- 서킷브레이커가 open 되고 다시 close가 되었을 때, 장애가 된 데이터 등의 뒤처리 로직 설계도 중요하다.
- 팀 컨벤션으로 가져갈 것: 외부 API를 호출하는 모든 클라이언트 코드에는 타임아웃과 서킷 브레이커를 기본으로 적용한다.

---

## 참고

- [Resilience4j CircuitBreaker 공식 문서](https://resilience4j.readme.io/docs/circuitbreaker)
- [Spring Boot 레퍼런스](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring Cloud OpenFeign 레퍼런스](https://docs.spring.io/spring-cloud-openfeign/reference/)
